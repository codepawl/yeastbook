import * as vscode from "vscode";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { statSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";

interface WsIncoming {
  type: string;
  cellId?: string;
  status?: "busy" | "idle";
  executionCount?: number;
  name?: "stdout" | "stderr";
  text?: string;
  value?: string;
  richOutput?: { type: string; [key: string]: unknown };
  ename?: string;
  evalue?: string;
  traceback?: string[];
  packages?: string[];
  stream?: "stdout" | "stderr";
  error?: string;
  success?: boolean;
}

export class YbkKernel {
  private controller: vscode.NotebookController;
  private process: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private port: number = 0;
  private notebookPath: string = "";
  private statusBar: vscode.StatusBarItem;
  private executionOrder = 0;

  // Pending executions: cellId → { execution, resolve }
  private pending = new Map<string, {
    execution: vscode.NotebookCellExecution;
    resolve: () => void;
  }>();

  // Buffer for messages that arrive before execution is set up
  private messageListeners: ((msg: WsIncoming) => void)[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.controller = vscode.notebooks.createNotebookController(
      "yeastbook-kernel",
      "yeastbook",
      "Bun Kernel",
    );
    this.controller.supportedLanguages = ["typescript", "javascript"];
    this.controller.supportsExecutionOrder = true;
    this.controller.executeHandler = this.executeHandler.bind(this);

    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBar.command = "yeastbook.restartKernel";
    this.setStatus("stopped");

    context.subscriptions.push(this.controller, this.statusBar);
  }

  get serverPort(): number {
    return this.port;
  }

  get isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private setStatus(state: "stopped" | "starting" | "idle" | "busy" | "error") {
    const icons: Record<string, string> = {
      stopped: "$(circle-slash)",
      starting: "$(loading~spin)",
      idle: "$(circle-filled)",
      busy: "$(loading~spin)",
      error: "$(error)",
    };
    this.statusBar.text = `${icons[state]} Bun Kernel`;
    this.statusBar.tooltip = `Yeastbook Kernel: ${state} (click to restart)`;
    this.statusBar.show();
  }

  async startServer(notebookPath: string): Promise<void> {
    if (this.isRunning && this.notebookPath === notebookPath) return;
    await this.stopServer();

    this.notebookPath = notebookPath;
    this.setStatus("starting");

    const config = vscode.workspace.getConfiguration("yeastbook");
    const configPort = config.get<number>("serverPort", 0);
    this.port = configPort || await this.findFreePort();

    const bunPath = config.get<string>("bunPath", "bun");
    const cliPath = this.findYeastbook();
    if (!cliPath) {
      this.setStatus("error");
      throw new Error("yeastbook CLI not found. Install: bun install -g yeastbook");
    }

    this.process = spawn(bunPath, [cliPath, notebookPath, "--port", String(this.port), "--no-open"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Kernel startup timed out")), 15000);
      this.process!.stdout?.on("data", (d: Buffer) => {
        if (d.toString().includes("running at")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      this.process!.stderr?.on("data", (d: Buffer) => {
        const msg = d.toString();
        if (msg.includes("error") || msg.includes("Error")) {
          console.error("[yeastbook stderr]", msg);
        }
      });
      this.process!.on("error", (e) => { clearTimeout(timeout); reject(e); });
      this.process!.on("exit", (code) => {
        if (code) { clearTimeout(timeout); reject(new Error(`Server exited with code ${code}`)); }
      });
    });

    await this.connectWebSocket();
    this.setStatus("idle");
  }

  async stopServer(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = null;
    this.notebookPath = "";
    this.port = 0;
    this.executionOrder = 0;
    this.setStatus("stopped");

    // Reject any pending executions
    for (const [, pending] of this.pending) {
      pending.execution.end(false, Date.now());
      pending.resolve();
    }
    this.pending.clear();
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = `ws://localhost:${this.port}/ws`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => reject(new Error("WebSocket connection timed out")), 5000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const msg: WsIncoming = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch { /* ignore non-JSON messages */ }
      });

      this.ws.on("close", () => {
        if (this.isRunning) {
          this.setStatus("error");
          // Try to reconnect after a brief delay
          setTimeout(() => {
            if (this.isRunning) this.connectWebSocket().catch(() => {});
          }, 2000);
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        console.error("[yeastbook ws]", err.message);
        reject(err);
      });
    });
  }

  private handleMessage(msg: WsIncoming): void {
    // Dispatch to any registered listeners
    for (const listener of this.messageListeners) {
      listener(msg);
    }

    const cellId = msg.cellId;
    if (!cellId) {
      // Non-cell messages (status updates, etc.)
      if (msg.type === "status") {
        this.setStatus(msg.status === "busy" ? "busy" : "idle");
      }
      return;
    }

    const pending = this.pending.get(cellId);
    if (!pending) return;

    const { execution } = pending;

    switch (msg.type) {
      case "stream": {
        const text = msg.text ?? "";
        execution.appendOutput(new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(text, "text/plain"),
        ]));
        break;
      }

      case "result": {
        const items: vscode.NotebookCellOutputItem[] = [];
        if (msg.richOutput) {
          const mimeMap: Record<string, string> = {
            chart: "x-application/yeastbook-chart",
            table: "x-application/yeastbook-table",
            json: "x-application/yeastbook-json",
            html: "x-application/yeastbook-html",
            widget: "x-application/yeastbook-widget",
          };
          const mime = mimeMap[msg.richOutput.type];
          if (mime) {
            items.push(vscode.NotebookCellOutputItem.text(
              JSON.stringify(msg.richOutput), mime,
            ));
          }
        }
        if (msg.value !== undefined) {
          items.push(vscode.NotebookCellOutputItem.text(msg.value, "text/plain"));
        }
        if (items.length > 0) {
          execution.appendOutput(new vscode.NotebookCellOutput(items));
        }
        break;
      }

      case "error": {
        const errMsg = `${msg.ename}: ${msg.evalue}\n${(msg.traceback ?? []).join("\n")}`;
        execution.appendOutput(new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error(new Error(errMsg)),
        ]));
        // Error ends execution
        execution.end(false, Date.now());
        pending.resolve();
        this.pending.delete(cellId);
        break;
      }

      case "status": {
        if (msg.status === "idle") {
          this.setStatus("idle");
          execution.end(true, Date.now());
          pending.resolve();
          this.pending.delete(cellId);
        } else {
          this.setStatus("busy");
        }
        break;
      }

      case "install_start": {
        execution.appendOutput(new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(
            `Installing packages: ${(msg.packages ?? []).join(", ")}...`,
            "text/plain",
          ),
        ]));
        break;
      }

      case "install_log": {
        execution.appendOutput(new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(msg.text ?? "", "text/plain"),
        ]));
        break;
      }

      case "install_done": {
        execution.appendOutput(new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text("Packages installed successfully.", "text/plain"),
        ]));
        break;
      }

      case "install_error": {
        execution.appendOutput(new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error(new Error(`Install failed: ${msg.error}`)),
        ]));
        break;
      }
    }
  }

  private async executeHandler(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController,
  ): Promise<void> {
    // Ensure server is running
    if (!this.isRunning) {
      try {
        await this.startServer(notebook.uri.fsPath);
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to start kernel: ${e instanceof Error ? e.message : e}`,
        );
        return;
      }
    }

    for (const cell of cells) {
      await this.executeCell(cell);
    }
  }

  private async executeCell(cell: vscode.NotebookCell): Promise<void> {
    const execution = this.controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this.executionOrder;
    execution.start(Date.now());
    execution.clearOutput();

    const cellId = cell.metadata?.id ?? `vscode-${cell.index}`;
    const code = cell.document.getText();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      execution.appendOutput(new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.error(new Error("WebSocket not connected")),
      ]));
      execution.end(false, Date.now());
      return;
    }

    return new Promise<void>((resolve) => {
      this.pending.set(cellId, { execution, resolve });

      // Send execute message
      this.ws!.send(JSON.stringify({
        type: "execute",
        cellId,
        code,
      }));

      // Timeout safety: resolve after 5 minutes if no response
      const timeout = setTimeout(() => {
        if (this.pending.has(cellId)) {
          execution.appendOutput(new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.error(new Error("Execution timed out")),
          ]));
          execution.end(false, Date.now());
          this.pending.delete(cellId);
          resolve();
        }
      }, 300000);

      // Clean up timeout when execution completes
      const originalResolve = resolve;
      this.pending.set(cellId, {
        execution,
        resolve: () => {
          clearTimeout(timeout);
          originalResolve();
        },
      });
    });
  }

  interrupt(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "interrupt" }));
    }
  }

  private findYeastbook(): string | null {
    // 1. Check global install
    try {
      const p = execFileSync("which", ["yeastbook"], { encoding: "utf-8" }).trim();
      if (p) return p;
    } catch { /* not found */ }

    // 2. Check workspace node_modules
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const p = join(folder.uri.fsPath, "node_modules", ".bin", "yeastbook");
      try { if (statSync(p).isFile()) return p; } catch { /* skip */ }
    }

    // 3. Check monorepo CLI path
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const p = join(folder.uri.fsPath, "packages", "app", "src", "cli.ts");
      try { if (statSync(p).isFile()) return p; } catch { /* skip */ }
    }

    return null;
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== "string") {
          server.close(() => resolve(addr.port));
        } else {
          server.close(() => reject(new Error("Could not find free port")));
        }
      });
      server.on("error", reject);
    });
  }

  dispose(): void {
    this.stopServer();
    this.statusBar.dispose();
    this.controller.dispose();
  }
}

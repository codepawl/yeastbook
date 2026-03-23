import * as vscode from "vscode";

interface YbkCell {
  id: string;
  type: "code" | "markdown";
  source: string;
  outputs?: YbkOutput[];
  executionCount?: number;
}

interface YbkOutput {
  output_type: string;
  text?: string[];
  data?: Record<string, string>;
  name?: string;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  execution_count?: number;
  richOutput?: { type: string; [key: string]: unknown };
}

interface YbkFile {
  version: string;
  metadata: Record<string, unknown>;
  settings: Record<string, unknown>;
  cells: YbkCell[];
}

export class YbkSerializer implements vscode.NotebookSerializer {
  private originalData = new WeakMap<vscode.NotebookDocument, { version: string; metadata: Record<string, unknown>; settings: Record<string, unknown> }>();

  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    const text = new TextDecoder().decode(content);

    let ybk: YbkFile;
    try {
      ybk = JSON.parse(text);
    } catch {
      // Empty or invalid file — return welcome cell
      return new vscode.NotebookData([
        new vscode.NotebookCellData(
          vscode.NotebookCellKind.Code,
          '// Welcome to Yeastbook!\nconsole.log("Hello, world!")',
          "typescript",
        ),
      ]);
    }

    if (!ybk.cells || !Array.isArray(ybk.cells)) {
      return new vscode.NotebookData([
        new vscode.NotebookCellData(
          vscode.NotebookCellKind.Code,
          '// Empty notebook\n',
          "typescript",
        ),
      ]);
    }

    const cells = ybk.cells.map((cell) => {
      const kind = cell.type === "markdown"
        ? vscode.NotebookCellKind.Markup
        : vscode.NotebookCellKind.Code;

      const language = cell.type === "markdown" ? "markdown" : "typescript";
      const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source;

      const cellData = new vscode.NotebookCellData(kind, source, language);
      cellData.metadata = { id: cell.id, executionCount: cell.executionCount };
      cellData.outputs = (cell.outputs ?? []).map(mapOutput);

      return cellData;
    });

    const data = new vscode.NotebookData(cells);
    data.metadata = {
      version: ybk.version,
      ybkMetadata: ybk.metadata,
      ybkSettings: ybk.settings,
    };

    return data;
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    const version = data.metadata?.version ?? "0.1.0";
    const metadata = data.metadata?.ybkMetadata ?? {};
    const settings = data.metadata?.ybkSettings ?? {};

    const cells: YbkCell[] = data.cells.map((cell) => {
      const ybkCell: YbkCell = {
        id: cell.metadata?.id ?? generateId(),
        type: cell.kind === vscode.NotebookCellKind.Markup ? "markdown" : "code",
        source: cell.value,
      };
      // Strip outputs on save for clean diffs
      return ybkCell;
    });

    const ybk: YbkFile = { version, metadata, settings, cells };
    return new TextEncoder().encode(JSON.stringify(ybk, null, 2) + "\n");
  }
}

function mapOutput(output: YbkOutput): vscode.NotebookCellOutput {
  const items: vscode.NotebookCellOutputItem[] = [];

  switch (output.output_type) {
    case "stream": {
      const text = Array.isArray(output.text) ? output.text.join("") : (output.text ?? "");
      items.push(vscode.NotebookCellOutputItem.text(text, "text/plain"));
      break;
    }

    case "execute_result":
    case "display_data": {
      if (output.richOutput) {
        const mimeMap: Record<string, string> = {
          chart: "x-application/yeastbook-chart",
          table: "x-application/yeastbook-table",
          json: "x-application/yeastbook-json",
          html: "x-application/yeastbook-html",
          widget: "x-application/yeastbook-widget",
        };
        const mime = mimeMap[output.richOutput.type] ?? "text/plain";
        if (mime !== "text/plain") {
          items.push(vscode.NotebookCellOutputItem.text(
            JSON.stringify(output.richOutput),
            mime,
          ));
        }
      }
      if (output.data) {
        for (const [mime, content] of Object.entries(output.data)) {
          items.push(vscode.NotebookCellOutputItem.text(content, mime));
        }
      }
      if (items.length === 0 && output.text) {
        const text = Array.isArray(output.text) ? output.text.join("") : output.text;
        items.push(vscode.NotebookCellOutputItem.text(text, "text/plain"));
      }
      break;
    }

    case "error": {
      items.push(vscode.NotebookCellOutputItem.error(
        new Error(`${output.ename}: ${output.evalue}\n${(output.traceback ?? []).join("\n")}`),
      ));
      break;
    }

    default: {
      const text = Array.isArray(output.text) ? output.text.join("") : (output.text ?? JSON.stringify(output));
      items.push(vscode.NotebookCellOutputItem.text(text, "text/plain"));
    }
  }

  return new vscode.NotebookCellOutput(items);
}

function generateId(): string {
  return `cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

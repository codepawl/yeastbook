# Standalone Notebook App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Jupyter kernel with a standalone notebook app served by `Bun.serve()` over HTTP+WebSocket, reusing the existing `executeCode()` engine.

**Architecture:** `Bun.serve()` handles HTTP routes (notebook UI, API) and WebSocket (cell execution). The server loads/saves `.ipynb` files, maintains a shared execution context across cells, and streams results back via WebSocket JSON messages. Single HTML file for the UI with inline CSS/JS, no framework.

**Tech Stack:** Bun (runtime, server, file I/O), vanilla HTML/CSS/JS (UI), WebSocket (execution transport), .ipynb JSON format (file format), marked.js + highlight.js from CDN (markdown/syntax).

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Keep | `src/kernel/execute.ts` | Code execution engine |
| Keep | `tests/kernel.test.ts` | Execute tests (rename to `tests/execute.test.ts`) |
| Create | `src/server.ts` | Bun HTTP+WebSocket server |
| Create | `src/notebook.ts` | Notebook model — load, save, update cells |
| Create | `src/ui/notebook.html` | Complete notebook UI (inline CSS+JS) |
| Rewrite | `src/cli.ts` | New CLI: `yeastbook <file>` / `yeastbook new` |
| Delete | `src/zmq/` | ZMQ FFI bindings (no longer needed) |
| Delete | `src/protocol/` | Jupyter wire protocol (no longer needed) |
| Delete | `src/kernel/index.ts` | Jupyter Kernel class (no longer needed) |
| Delete | `tests/zmq.test.ts` | ZMQ tests |
| Delete | `tests/integration.test.ts` | Jupyter integration tests |
| Delete | `tests/protocol.test.ts` | Protocol tests |

---

### Task 1: Clean Up Jupyter/ZMQ Code

**Files:**
- Delete: `src/zmq/ffi.ts`, `src/zmq/index.ts`
- Delete: `src/protocol/messages.ts`
- Delete: `src/kernel/index.ts`
- Delete: `tests/zmq.test.ts`, `tests/integration.test.ts`, `tests/protocol.test.ts`
- Rename: `tests/kernel.test.ts` → `tests/execute.test.ts`
- Modify: `package.json` (remove zeromq/zmq references if any)

- [ ] **Step 1: Delete dead files**

```bash
rm -rf src/zmq/ src/protocol/
rm src/kernel/index.ts
rm tests/zmq.test.ts tests/integration.test.ts tests/protocol.test.ts
```

- [ ] **Step 2: Rename kernel test to execute test**

```bash
mv tests/kernel.test.ts tests/execute.test.ts
```

Update the import in `tests/execute.test.ts` — it already imports from `../src/kernel/execute.ts` so no change needed.

- [ ] **Step 3: Verify existing execute tests pass**

Run: `bun test tests/execute.test.ts`
Expected: All 11 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Jupyter/ZMQ code, keep only execute engine"
```

---

### Task 2: Notebook Model

**Files:**
- Create: `src/notebook.ts`
- Create: `tests/notebook.test.ts`

The notebook model handles loading, saving, creating, and updating `.ipynb` files. It's a pure data layer with no server dependencies.

- [ ] **Step 1: Write the failing tests**

Create `tests/notebook.test.ts`:

```ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Notebook } from "../src/notebook.ts";
import { unlink } from "node:fs/promises";

describe("Notebook", () => {
  const tmpPath = `/tmp/yeastbook-test-${Date.now()}.ipynb`;

  afterEach(async () => {
    try { await unlink(tmpPath); } catch {}
  });

  test("create empty notebook", () => {
    const nb = Notebook.createEmpty();
    expect(nb.cells).toEqual([]);
    expect(nb.metadata.kernelspec.name).toBe("yeastbook");
  });

  test("add code cell", () => {
    const nb = Notebook.createEmpty();
    const id = nb.addCell("code", "1 + 1");
    expect(nb.cells.length).toBe(1);
    expect(nb.cells[0]!.cell_type).toBe("code");
    expect(nb.cells[0]!.source).toEqual(["1 + 1"]);
    expect(nb.cells[0]!.id).toBe(id);
  });

  test("add markdown cell", () => {
    const nb = Notebook.createEmpty();
    nb.addCell("markdown", "# Hello");
    expect(nb.cells[0]!.cell_type).toBe("markdown");
  });

  test("delete cell", () => {
    const nb = Notebook.createEmpty();
    const id = nb.addCell("code", "x");
    nb.deleteCell(id);
    expect(nb.cells.length).toBe(0);
  });

  test("update cell source", () => {
    const nb = Notebook.createEmpty();
    const id = nb.addCell("code", "old");
    nb.updateCellSource(id, "new");
    expect(nb.cells[0]!.source).toEqual(["new"]);
  });

  test("set cell output", () => {
    const nb = Notebook.createEmpty();
    const id = nb.addCell("code", "1+1");
    nb.setCellOutput(id, 1, { value: "2", stdout: "", stderr: "" });
    expect(nb.cells[0]!.execution_count).toBe(1);
    expect(nb.cells[0]!.outputs.length).toBe(1);
  });

  test("save and load round-trip", async () => {
    const nb = Notebook.createEmpty();
    nb.addCell("code", "1 + 1");
    nb.addCell("markdown", "# hi");
    await nb.save(tmpPath);

    const loaded = await Notebook.load(tmpPath);
    expect(loaded.cells.length).toBe(2);
    expect(loaded.cells[0]!.cell_type).toBe("code");
    expect(loaded.cells[1]!.cell_type).toBe("markdown");
  });

  test("load creates file if missing", async () => {
    const missingPath = `/tmp/yeastbook-missing-${Date.now()}.ipynb`;
    const nb = await Notebook.load(missingPath);
    expect(nb.cells).toEqual([]);
    try { await unlink(missingPath); } catch {}
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/notebook.test.ts`
Expected: FAIL — `Notebook` not found.

- [ ] **Step 3: Implement Notebook model**

Create `src/notebook.ts`:

```ts
// src/notebook.ts — Notebook model for .ipynb files

export interface CellOutput {
  output_type: string;
  text?: string[];
  data?: Record<string, string>;
  metadata?: Record<string, unknown>;
  execution_count?: number;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  name?: string;
}

export interface Cell {
  cell_type: "code" | "markdown";
  id: string;
  source: string[];
  metadata: Record<string, unknown>;
  outputs: CellOutput[];
  execution_count: number | null;
}

interface NotebookJson {
  nbformat: number;
  nbformat_minor: number;
  metadata: {
    kernelspec: { name: string; display_name: string; language: string };
    language_info: { name: string };
  };
  cells: Cell[];
}

export class Notebook {
  cells: Cell[];
  metadata: NotebookJson["metadata"];

  private constructor(data: NotebookJson) {
    this.cells = data.cells;
    this.metadata = data.metadata;
  }

  static createEmpty(): Notebook {
    return new Notebook({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { name: "yeastbook", display_name: "Yeastbook (Bun)", language: "typescript" },
        language_info: { name: "typescript" },
      },
      cells: [],
    });
  }

  static async load(filePath: string): Promise<Notebook> {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const data: NotebookJson = await file.json();
      return new Notebook(data);
    }
    // File doesn't exist — create empty and save
    const nb = Notebook.createEmpty();
    await nb.save(filePath);
    return nb;
  }

  async save(filePath: string): Promise<void> {
    const data: NotebookJson = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: this.metadata,
      cells: this.cells,
    };
    await Bun.write(filePath, JSON.stringify(data, null, 2) + "\n");
  }

  addCell(type: "code" | "markdown", source: string = ""): string {
    const id = crypto.randomUUID();
    const cell: Cell = {
      cell_type: type,
      id,
      source: source ? [source] : [],
      metadata: {},
      outputs: [],
      execution_count: null,
    };
    this.cells.push(cell);
    return id;
  }

  deleteCell(id: string): void {
    this.cells = this.cells.filter((c) => c.id !== id);
  }

  updateCellSource(id: string, source: string): void {
    const cell = this.cells.find((c) => c.id === id);
    if (cell) cell.source = [source];
  }

  setCellOutput(
    id: string,
    executionCount: number,
    result: { value?: string; stdout?: string; stderr?: string; error?: { ename: string; evalue: string; traceback: string[] } },
  ): void {
    const cell = this.cells.find((c) => c.id === id);
    if (!cell) return;
    cell.execution_count = executionCount;
    cell.outputs = [];

    if (result.stdout) {
      cell.outputs.push({ output_type: "stream", name: "stdout", text: [result.stdout] });
    }
    if (result.stderr) {
      cell.outputs.push({ output_type: "stream", name: "stderr", text: [result.stderr] });
    }
    if (result.error) {
      cell.outputs.push({
        output_type: "error",
        ename: result.error.ename,
        evalue: result.error.evalue,
        traceback: result.error.traceback,
      });
    } else if (result.value !== undefined) {
      cell.outputs.push({
        output_type: "execute_result",
        data: { "text/plain": result.value },
        metadata: {},
        execution_count: executionCount,
      });
    }
  }

  getCell(id: string): Cell | undefined {
    return this.cells.find((c) => c.id === id);
  }

  toJSON(): NotebookJson {
    return {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: this.metadata,
      cells: this.cells,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/notebook.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notebook.ts tests/notebook.test.ts
git commit -m "feat: add Notebook model for .ipynb files"
```

---

### Task 3: Placeholder UI + WebSocket Server

**Files:**
- Create: `src/ui/notebook.html` (placeholder — real UI in Task 4)
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

The server handles HTTP (UI, API) and WebSocket (cell execution). It owns the execution context and execution count. A placeholder HTML is needed so tests can pass.

- [ ] **Step 1: Create placeholder HTML**

```bash
mkdir -p src/ui
```

Create `src/ui/notebook.html`:

```html
<!DOCTYPE html>
<html><head><title>Yeastbook</title></head>
<body><h1>Yeastbook</h1><p>Loading...</p></body>
</html>
```

- [ ] **Step 2: Write the failing tests**

Create `tests/server.test.ts`:

```ts
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { unlink } from "node:fs/promises";

let server: Awaited<ReturnType<typeof import("../src/server.ts").startServer>>;
const tmpPath = `/tmp/yeastbook-server-test-${Date.now()}.ipynb`;
let baseUrl: string;
let wsUrl: string;

beforeAll(async () => {
  const { startServer } = await import("../src/server.ts");
  server = await startServer(tmpPath, 0); // port 0 = random
  const port = server.port;
  baseUrl = `http://localhost:${port}`;
  wsUrl = `ws://localhost:${port}/ws`;
});

afterAll(async () => {
  server?.stop();
  try { await unlink(tmpPath); } catch {}
});

describe("HTTP routes", () => {
  test("GET / serves HTML", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /api/notebook returns notebook JSON", async () => {
    const res = await fetch(`${baseUrl}/api/notebook`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nbformat).toBe(4);
    expect(data.cells).toBeArray();
  });

  test("POST /api/cells adds a cell", async () => {
    const res = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "1+1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeDefined();
  });

  test("DELETE /api/cells/:id removes a cell", async () => {
    const addRes = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "delete me" }),
    });
    const { id } = await addRes.json();

    const delRes = await fetch(`${baseUrl}/api/cells/${id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);
  });

  test("PATCH /api/cells/:id updates cell source", async () => {
    const addRes = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "old" }),
    });
    const { id } = await addRes.json();

    const patchRes = await fetch(`${baseUrl}/api/cells/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "new" }),
    });
    expect(patchRes.status).toBe(200);

    const nbRes = await fetch(`${baseUrl}/api/notebook`);
    const nb = await nbRes.json();
    const cell = nb.cells.find((c: any) => c.id === id);
    expect(cell.source).toEqual(["new"]);
  });
});

describe("WebSocket execution", () => {
  test("execute returns result", async () => {
    const addRes = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "1+1" }),
    });
    const { id: cellId } = await addRes.json();

    const messages: any[] = [];
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "execute", cellId, code: "1 + 1" }));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        messages.push(msg);
        if (msg.type === "status" && msg.status === "idle") resolve();
      };
    });

    ws.close();

    expect(messages.find((m) => m.type === "status" && m.status === "busy")).toBeDefined();
    const result = messages.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result.value).toBe("2");
    expect(result.executionCount).toBeGreaterThanOrEqual(1);
    expect(messages.find((m) => m.type === "status" && m.status === "idle")).toBeDefined();
  });

  test("execute captures stdout", async () => {
    const addRes = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "" }),
    });
    const { id: cellId } = await addRes.json();

    const messages: any[] = [];
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "execute", cellId, code: 'console.log("hi")' }));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        messages.push(msg);
        if (msg.type === "status" && msg.status === "idle") resolve();
      };
    });

    ws.close();
    const stream = messages.find((m) => m.type === "stream" && m.name === "stdout");
    expect(stream).toBeDefined();
    expect(stream.text).toContain("hi");
  });

  test("execute returns error", async () => {
    const addRes = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "" }),
    });
    const { id: cellId } = await addRes.json();

    const messages: any[] = [];
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "execute", cellId, code: "throw new Error('boom')" }));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        messages.push(msg);
        if (msg.type === "status" && msg.status === "idle") resolve();
      };
    });

    ws.close();
    const err = messages.find((m) => m.type === "error");
    expect(err).toBeDefined();
    expect(err.ename).toBe("Error");
    expect(err.evalue).toBe("boom");
  });

  test("shared execution context across cells", async () => {
    const addRes1 = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "" }),
    });
    const { id: cellId1 } = await addRes1.json();

    const addRes2 = await fetch(`${baseUrl}/api/cells`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "code", source: "" }),
    });
    const { id: cellId2 } = await addRes2.json();

    const ws = new WebSocket(wsUrl);

    // Execute first cell: define a variable
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "execute", cellId: cellId1, code: "var testCtx = 99" }));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "status" && msg.status === "idle") resolve();
      };
    });

    // Execute second cell: read the variable
    const messages: any[] = [];
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      messages.push(msg);
    };
    ws.send(JSON.stringify({ type: "execute", cellId: cellId2, code: "testCtx" }));

    await new Promise<void>((resolve) => {
      const check = () => {
        if (messages.find((m) => m.type === "status" && m.status === "idle")) resolve();
        else setTimeout(check, 50);
      };
      check();
    });

    ws.close();
    const result = messages.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result.value).toBe("99");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/server.test.ts`
Expected: FAIL — `startServer` not found.

- [ ] **Step 4: Implement server**

Create `src/server.ts`:

```ts
// src/server.ts — Bun HTTP+WebSocket server for notebook execution

import { resolve } from "node:path";
import { Notebook } from "./notebook.ts";
import { executeCode } from "./kernel/execute.ts";

interface ServerState {
  notebook: Notebook;
  filePath: string;
  executionCount: number;
  context: Record<string, unknown>;
}

export async function startServer(filePath: string, port: number = 3000) {
  const absPath = resolve(filePath);
  const notebook = await Notebook.load(absPath);

  const state: ServerState = {
    notebook,
    filePath: absPath,
    executionCount: 0,
    context: {},
  };

  const htmlPath = resolve(import.meta.dirname!, "ui/notebook.html");

  const server = Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        if (server.upgrade(req)) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // Let routes handle other paths
      return undefined;
    },
    routes: {
      "/": async () => {
        const html = await Bun.file(htmlPath).text();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
      "/api/notebook": {
        GET: () => Response.json(state.notebook.toJSON()),
      },
      "/api/cells": {
        POST: async (req) => {
          const body = await req.json() as { type: "code" | "markdown"; source?: string };
          const id = state.notebook.addCell(body.type, body.source ?? "");
          await state.notebook.save(state.filePath);
          return Response.json({ id });
        },
      },
      "/api/cells/:id": {
        DELETE: async (req) => {
          state.notebook.deleteCell(req.params.id);
          await state.notebook.save(state.filePath);
          return Response.json({ ok: true });
        },
        PATCH: async (req) => {
          const body = await req.json() as { source: string };
          state.notebook.updateCellSource(req.params.id, body.source);
          await state.notebook.save(state.filePath);
          return Response.json({ ok: true });
        },
      },
      "/api/save": {
        POST: async () => {
          await state.notebook.save(state.filePath);
          return Response.json({ ok: true });
        },
      },
    },
    websocket: {
      open(ws) {
        // nothing needed
      },
      async message(ws, message) {
        const msg = JSON.parse(message as string) as
          | { type: "execute"; cellId: string; code: string }
          | { type: "interrupt" };

        if (msg.type === "execute") {
          ws.send(JSON.stringify({ type: "status", cellId: msg.cellId, status: "busy" }));

          state.executionCount++;
          const result = await executeCode(msg.code, state.context);

          // Update notebook cell
          state.notebook.updateCellSource(msg.cellId, msg.code);
          state.notebook.setCellOutput(msg.cellId, state.executionCount, {
            value: result.value !== undefined ? Bun.inspect(result.value) : undefined,
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error,
          });

          // Send stdout
          if (result.stdout) {
            ws.send(JSON.stringify({
              type: "stream", cellId: msg.cellId, name: "stdout", text: result.stdout,
            }));
          }

          // Send stderr
          if (result.stderr) {
            ws.send(JSON.stringify({
              type: "stream", cellId: msg.cellId, name: "stderr", text: result.stderr,
            }));
          }

          // Send result or error
          if (result.error) {
            ws.send(JSON.stringify({
              type: "error",
              cellId: msg.cellId,
              ename: result.error.ename,
              evalue: result.error.evalue,
              traceback: result.error.traceback,
            }));
          } else if (result.value !== undefined) {
            ws.send(JSON.stringify({
              type: "result",
              cellId: msg.cellId,
              value: Bun.inspect(result.value),
              executionCount: state.executionCount,
            }));
          }

          ws.send(JSON.stringify({ type: "status", cellId: msg.cellId, status: "idle" }));

          // Auto-save
          await state.notebook.save(state.filePath);
        }
      },
    },
  });

  return server;
}
```

Key differences from original plan:
- Added `fetch(req, server)` handler that upgrades `/ws` requests to WebSocket
- `fetch` returns `undefined` for non-WS routes so `routes` handles them

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/server.test.ts`
Expected: All 9 tests PASS (5 HTTP + 4 WebSocket).

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/ui/notebook.html tests/server.test.ts
git commit -m "feat: add HTTP+WebSocket server for notebook execution"
```

---

### Task 4: Notebook UI

**Files:**
- Replace: `src/ui/notebook.html` (replace placeholder from Task 3)

Single HTML file with inline CSS and JS. No framework. Uses marked.js and highlight.js from CDN.

- [ ] **Step 1: Create notebook.html**

Create `src/ui/notebook.html` — a complete notebook UI with:
- Warm off-white background (#FAFAF8)
- JetBrains Mono from Google Fonts for code
- Subtle amber/orange accent (#D97706) for run button and active cell
- Soft shadows, rounded corners
- Code cells: `<textarea>` with run button, output area, execution count
- Markdown cells: rendered HTML via marked.js, click to edit
- Add cell buttons (Code + Markdown)
- Delete cell button per cell
- Keyboard shortcuts: Shift+Enter (run + advance), Ctrl+Enter (run + stay)
- WebSocket connection for execution
- Streams stdout/stderr as it arrives
- Clear output button per cell
- Fetches notebook state from `/api/notebook` on load

The full HTML content should be ~400-500 lines covering:
1. `<head>` — Google Fonts, CDN links for marked.js + highlight.js, inline `<style>`
2. `<body>` — toolbar with title, notebook container, add-cell buttons
3. `<script>` — WebSocket setup, cell rendering, execution handling, keyboard shortcuts

Key UI behaviors:
- On load: `fetch('/api/notebook')` → render all cells
- Code cell run: sends `{ type: "execute", cellId, code }` over WS
- WS messages update output areas in real-time
- Add cell: `POST /api/cells` → render new cell
- Delete cell: `DELETE /api/cells/:id` → remove from DOM
- Markdown cell click: toggle between rendered HTML and editable textarea
- Auto-resize textareas to fit content

- [ ] **Step 3: Verify UI loads**

Start server manually and verify in browser:

```bash
echo '{"nbformat":4,"nbformat_minor":5,"metadata":{"kernelspec":{"name":"yeastbook","display_name":"Yeastbook (Bun)","language":"typescript"},"language_info":{"name":"typescript"}},"cells":[]}' > /tmp/yeastbook-ui-test.ipynb
bun -e "import { startServer } from './src/server.ts'; const s = await startServer('/tmp/yeastbook-ui-test.ipynb', 3333); console.log('http://localhost:3333')"
```

Open http://localhost:3333 in browser, verify:
- Page loads with clean UI
- Can add code and markdown cells
- Can execute code cells and see output
- Markdown renders correctly

- [ ] **Step 4: Commit**

```bash
git add src/ui/notebook.html
git commit -m "feat: add notebook UI with cell editing and execution"
```

---

### Task 5: CLI Update

**Files:**
- Rewrite: `src/cli.ts`

- [ ] **Step 1: Write the CLI**

Rewrite `src/cli.ts`:

```ts
#!/usr/bin/env bun
// src/cli.ts — Yeastbook CLI

import { resolve } from "node:path";
import { startServer } from "./server.ts";

const args = process.argv.slice(2);
const target = args[0];

if (!target) {
  console.log("Usage: yeastbook <file.ipynb>    Open or create a notebook");
  console.log("       yeastbook new             Create a new empty notebook");
  process.exit(0);
}

let filePath: string;

if (target === "new") {
  filePath = resolve(`notebook-${Date.now()}.ipynb`);
  console.log(`Creating new notebook: ${filePath}`);
} else {
  filePath = resolve(target);
}

const port = parseInt(process.env.PORT ?? "3000", 10);
const server = await startServer(filePath, port);
console.log(`Yeastbook running at http://localhost:${server.port}`);
console.log(`Notebook: ${filePath}`);
```

- [ ] **Step 2: Test CLI manually**

```bash
bun src/cli.ts new
# Should print URL and notebook path, server starts
# Ctrl+C to stop

bun src/cli.ts test.ipynb
# Should create test.ipynb if missing, start server
# Ctrl+C to stop, clean up test.ipynb
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: update CLI for standalone notebook server"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run all tests**

```bash
bun test
```

Expected: All tests pass (execute + notebook + server).

- [ ] **Step 2: End-to-end manual test**

```bash
bun src/cli.ts demo.ipynb
```

In browser:
1. Add a code cell, type `1 + 1`, press Shift+Enter → see `2` output
2. Add a code cell, type `console.log("hello")`, run → see `hello` in stdout
3. Add a code cell, type `var x = 42`, run → no output
4. Add a code cell, type `x`, run → see `42` (context persists)
5. Add a markdown cell, type `# Hello World`, see rendered heading
6. Delete a cell
7. Refresh page → notebook state is preserved

- [ ] **Step 3: Verify .ipynb file is valid**

```bash
cat demo.ipynb | bun -e "const nb = JSON.parse(await Bun.stdin.text()); console.log('cells:', nb.cells.length, 'format:', nb.nbformat)"
```

- [ ] **Step 4: Clean up and final commit**

```bash
rm -f demo.ipynb
git add -A
git commit -m "chore: final cleanup for standalone notebook v1"
```

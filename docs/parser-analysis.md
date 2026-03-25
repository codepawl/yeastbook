# Yeastbook Parser Analysis: Python Language Support Readiness

## 1. Parser/Transform Code Inventory

| File | Role |
|------|------|
| `packages/core/src/transform.ts` | AST-based JS/TS cell code transformation (imports, variable hoisting, last-expression return) |
| `packages/core/src/magic.ts` | Magic command parser (`%install`, `%sql`, `%%python`, etc.) |
| `packages/core/src/output.ts` | Output type detection (table, chart, JSON, HTML, widget, MIME) |
| `packages/core/src/mime.ts` | MIME type detection and helpers |
| `packages/core/src/types.ts` | Shared types: `Cell`, `CellOutput`, `CellLanguage`, `WsOutgoing`, `WsIncoming` |
| `packages/core/src/format.ts` | `.ybk` / `.ipynb` format conversion and persistence |
| `packages/core/src/notebook.ts` | `Notebook` model class, cell CRUD, output management |
| `packages/app/src/kernel/execute.ts` | TS cell execution: Bun transpiler then transformCellCode then AsyncFunction eval |
| `packages/app/src/kernel/python-bridge.ts` | Python daemon process manager, JSON-line IPC, YeastBridge |
| `packages/app/src/kernel/python/yeastbook_kernel.py` | Python-side kernel: persistent namespace, `ast`-based last-expr detection |
| `packages/app/src/kernel/execution-queue.ts` | Sequential execution queue with cancel/timeout/dedup |
| `packages/app/src/kernel/sql-engine.ts` | SQL execution via `bun:sqlite` |
| `packages/app/src/kernel/snapshot.ts` | Session snapshot: serialize/restore kernel context |
| `packages/app/src/server.ts` | WebSocket server: receives execute messages, routes by language |
| `packages/vscode/src/YbkKernel.ts` | VS Code extension kernel controller |

---

## 2. Current Execution Pipeline

### ASCII Diagram

```
  UI (packages/ui)

  User types code in Monaco editor
         |
         v
  Shift+Enter / Run button
         |
         v
  WebSocket send:
    { type: "execute", cellId, code, language? }
                               |
                               v
  Server (packages/app/src/server.ts)

  1. parseMagicCommands(code)
     - Extracts: %install, %sql, %timeit, %time, %open, %%python
     - Returns: { magic[], cleanCode, cellMagic? }

  2. Determine language:
     language = msg.language || (cellMagic === "python" ? "python" : "ts")

  3. Route by language:
     +-- language === "python"     --> Python path
     +-- language === "typescript" --> TS path


  --- TypeScript Path ---

  4a. Process magic commands first (%install -> bun add, %sql -> SqlEngine)

  5a. executeCode(cleanCode, context)
      |
      +- transpileTS(code)            [Bun.Transpiler: TS -> JS]
      |   - Wraps in async fn to prevent DCE
      |   - Restores last expression after transpilation
      |
      +- transformCellCode(jsCode)    [acorn-loose + magic-string]
      |   - Parse with acorn-loose (tolerant parser)
      |   - Transform imports -> dynamic await import()
      |   - Strip export keywords
      |   - Hoist const/let -> var + globalThis.x = x
      |   - Hoist function/class -> globalThis.name = name
      |   - Wrap last expression in return(...)
      |   - Wrap everything in: return (async () => { ... })()
      |
      +- ensureGlobalThisHoisting(wrapped)  [regex safety net]
      |
      +- new AsyncFunction(..., wrapped)
      |   - Injected args: $, Bun, createSlider, createInput, etc.
      |
      +- Run with Promise.race([fn(), interruptPromise])
      |
      +- Capture new globalThis keys -> context

  6a. detectOutputType(result.value) -> rich output classification

  7a. Send results back via WebSocket:
      - { type: "stream", name: "stdout"|"stderr", text }
      - { type: "result", value, richOutput }
      - { type: "error", ename, evalue, traceback }


  --- Python Path ---

  4b. Lazy-start PythonKernel (spawn yeastbook_kernel.py daemon)

  5b. pythonKernel.execute(code, onStream)
      |
      +- Send JSON over stdin: { id, type: "execute", code }
      |
      +- yeastbook_kernel.py:
          - _handle_pip_magic() for %pip / !pip
          - _split_last_expr(code) using ast.parse()
          - exec(exec_part, _namespace)  [persistent dict]
          - eval(expr_part, _namespace)  [last expression]
          - _check_matplotlib() -> MIME PNG output
          - _try_serialize_pil() -> MIME PNG output
          - Write JSON response to stdout

  6b. Stream results back via WebSocket (same message types as TS)
```

### Variable Persistence

- **TypeScript cells**: Variables persist via `globalThis`. The `transformCellCode` function rewrites `const`/`let` to `var` and adds `globalThis.x = x` assignments. The `context` object (passed to `executeCode`) tracks all user-defined variables across cells. New `globalThis` keys are detected after each execution and synced back to `context`.

- **Python cells**: Variables persist via `_namespace` dict in `yeastbook_kernel.py`. The daemon process runs continuously, so the namespace persists across all Python cell executions within a session.

- **Cross-language**: `YeastBridge` provides bidirectional key-value sharing. TS side: `yb.push(key, value)` / `yb.get(key)`. Python side: `yb.set(key, value)` / `yb.get(key)`. Communication happens via JSON-line IPC messages (`bridge_push`, `bridge_get`, `bridge_set`).

---

## 3. Language Detection and Routing

### Current Implementation

**Per-cell language is already supported.** The system uses three mechanisms:

1. **WebSocket `language` field** (primary): The `WsOutgoing` type at `packages/core/src/types.ts:100` includes `language?: CellLanguage` on execute messages. The UI sends this from `cell.metadata.language`.

2. **Cell metadata** (storage): `cell.metadata.language` stores `"typescript"` or `"python"` per cell. The `CellLanguage` type is defined at `packages/core/src/types.ts:78`:
   ```typescript
   export type CellLanguage = "typescript" | "python";
   ```

3. **`%%python` cell magic** (legacy fallback): If no explicit language is set, the server checks for `%%python` at the top of the cell code. The `Notebook` class at `packages/core/src/notebook.ts:42-55` also migrates legacy `%%python` cells to metadata-based language on load.

**Routing logic** at `packages/app/src/server.ts:1092`:
```typescript
const language = msg.language || (cellMagic?.type === "python" ? "python" : "typescript");
```

### What's Already in Place
- `CellLanguage` type exists
- Cell metadata `language` field exists
- Server-side routing by language exists
- Python kernel daemon exists and works
- VS Code extension declares `supportedLanguages: ["typescript", "javascript", "python"]`

---

## 4. Parser Architecture Assessment

### 4.1 `packages/core/src/transform.ts`

- **Purpose**: AST-based transformation of JS/TS cell code for notebook execution
- **Input**: Raw JavaScript/TypeScript cell source code (string)
- **Output**: Transformed code wrapped in `return (async () => { ... })()`
- **Dependencies**: `acorn-loose` (tolerant JS parser), `magic-string` (source rewriting), `estree` types
- **Language assumptions**: **100% JS/TS-specific**. Every function assumes ECMAScript AST nodes.

**Hardcoded JS/TS patterns:**

| Line(s) | Pattern | Why JS/TS-specific |
|---------|---------|-------------------|
| 4 | `import { parse } from "acorn-loose"` | Acorn only parses ECMAScript |
| 48-95 | `transformImportNode()` | Rewrites `import x from "mod"` to `const x = await import("mod")` — ES module syntax |
| 101-129 | `hoistVariableDeclaration()` | Converts `const`/`let` to `var` + `globalThis.x = x` — JS scoping semantics |
| 140-143 | `parse(code, { ecmaVersion: "latest", sourceType: "module" })` | ECMAScript parser config |
| 152-198 | Switch on `ImportDeclaration`, `ExportNamedDeclaration`, `VariableDeclaration`, `FunctionDeclaration`, `ClassDeclaration` | All ECMAScript AST node types |
| 211-226 | Last expression return via `ExpressionStatement` detection | JS expression semantics |
| 228-230 | Wrap in `return (async () => { ... })()` | JS async IIFE pattern |
| 239-290 | `extractNewVars()` — parses AST for variable declarations | ECMAScript declarations only |

**Verdict**: This module is entirely JS/TS-specific and must be **bypassed entirely** for Python cells. It cannot be adapted — it must be skipped.

### 4.2 `packages/app/src/kernel/execute.ts`

- **Purpose**: Execute transformed TS/JS code in Bun's runtime
- **Input**: Raw TypeScript cell source code + context object
- **Output**: `ExecResult { value, stdout, stderr, tables, error? }`
- **Dependencies**: `bun` (Transpiler), `@codepawl/yeastbook-core` (transformCellCode, widgets)
- **Language assumptions**: **100% JS/TS-specific**

**Hardcoded JS/TS patterns:**

| Line(s) | Pattern | Why JS/TS-specific |
|---------|---------|-------------------|
| 7-10 | `new Transpiler({ loader: "ts", target: "bun" })` | Bun's TypeScript transpiler |
| 16-102 | `transpileTS()` — TS to JS transpilation with DCE workarounds | TypeScript-only |
| 31 | Regex for JS/TS statement keywords | JS/TS statement detection |
| 72 | `async function __yb_cell__() { ... }` wrapper | JS function wrapping |
| 127-159 | `ensureGlobalThisHoisting()` — regex-based `var` to `globalThis` | JS variable hoisting |
| 170 | `Object.assign(globalThis, context)` | JS globalThis for state sharing |
| 220 | `const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor` | JS dynamic function construction |
| 228 | `new AsyncFunction("$", "Bun", ..., wrapped)` | JS eval via AsyncFunction |

**Verdict**: This module is the JS/TS execution backend. It is already **completely bypassed** for Python cells — the server routes Python cells directly to `PythonKernel.execute()`.

### 4.3 `packages/core/src/magic.ts`

- **Purpose**: Parse magic commands (`%install`, `%sql`, `%%python`, etc.) from cell code
- **Input**: Raw cell source code (string)
- **Output**: `ParseResult { magic[], cleanCode, cellMagic? }`
- **Dependencies**: None (pure string parsing)
- **Language assumptions**: **Mostly language-agnostic**, with one Python-specific feature

**Hardcoded patterns:**

| Line(s) | Pattern | Notes |
|---------|---------|-------|
| 26 | `%%python` cell magic detection | Python-specific, but it's a Yeastbook convention, not a language feature |
| 55 | `%install` maps to `bun add` on TS side | TS-specific *in effect*, but the parser itself is agnostic |
| 62 | `%reload` | Currently TS-specific (invalidates require cache) |

**Verdict**: The parser itself is language-agnostic (string-based). The *interpretation* of magic commands differs by language (e.g., `%install` means `bun add` for TS, `pip install` for Python). The Python kernel already handles `%pip`/`!pip` independently in `yeastbook_kernel.py:222-258`.

### 4.4 `packages/core/src/output.ts`

- **Purpose**: Detect rich output type from execution result values
- **Input**: Any JavaScript value (the return value of cell execution)
- **Output**: `OutputData` (text, json, table, chart, html, widget, mime, etc.)
- **Dependencies**: `mime.ts`
- **Language assumptions**: **Operates on JS objects** — checks for marker properties like `__type`, `__mime`, etc.

**Verdict**: This module only runs on the TS execution path. Python output detection happens in `yeastbook_kernel.py` (matplotlib, PIL Image). The WS message format is shared — both paths produce the same `stream`, `result`, `error` messages. **Already language-agnostic at the protocol level.**

### 4.5 `packages/app/src/kernel/python-bridge.ts`

- **Purpose**: Manages the persistent Python daemon process
- **Input**: Python code string
- **Output**: `PythonExecResult { value, stdout, stderr, mimeOutputs[], error? }`
- **Dependencies**: Bun.spawn, filesystem
- **Language assumptions**: **Python-specific by design** — this IS the Python backend

**Verdict**: Complete, working Python execution backend. Handles venv discovery, persistent daemon lifecycle, JSON-line IPC, YeastBridge, interrupt, and shutdown.

### 4.6 `packages/app/src/kernel/python/yeastbook_kernel.py`

- **Purpose**: Python-side execution kernel
- **Input**: JSON-line commands over stdin
- **Output**: JSON-line responses over stdout
- **Dependencies**: Python stdlib (`ast`, `json`, `io`, `signal`, `subprocess`, `traceback`), optional: `numpy`, `matplotlib`, `PIL`
- **Language assumptions**: **Python-specific by design**

Key features:
- Persistent `_namespace` dict for variable persistence (line 26)
- `_split_last_expr()` uses `ast.parse()` for last-expression detection (lines 140-167)
- `_check_matplotlib()` auto-renders matplotlib figures as PNG (lines 72-90)
- `_try_serialize_pil()` auto-renders PIL images (lines 93-104)
- `_handle_pip_magic()` handles `%pip`/`!pip` commands (lines 222-258)
- `_StreamWriter` streams stdout/stderr in real-time (lines 261-283)

**Verdict**: Complete, working Python kernel. Mirrors the TS kernel's functionality.

### 4.7 `packages/app/src/kernel/execution-queue.ts`

- **Purpose**: Sequential cell execution with cancel, timeout, dedup
- **Input**: Cell ID, code, executor function
- **Output**: Promise resolution/rejection
- **Dependencies**: None
- **Language assumptions**: **Completely language-agnostic**

**Verdict**: This is infrastructure. Works for any language.

### 4.8 `packages/app/src/kernel/snapshot.ts`

- **Purpose**: Save/restore kernel context between sessions
- **Input/Output**: JSON serialization of `context` object
- **Dependencies**: Node fs, crypto
- **Language assumptions**: **TS-only currently** — serializes `globalThis`/`context` for TS cells only

**Potential issue**: The `SKIP_KEYS` set (line 22-31) is Bun/JS-specific. Python variables in `_namespace` are not captured by this snapshot system.

### 4.9 `packages/core/src/format.ts`

- **Purpose**: `.ybk` and `.ipynb` file format handling
- **Dependencies**: Node path/fs
- **Language assumptions**: See Section 6

---

## 5. Abstraction Gaps for Multi-Language Support

### Modules Tightly Coupled to JS/TS

| Module | Coupling | Notes |
|--------|----------|-------|
| `transform.ts` | **Hard** | 100% ECMAScript AST. Must be bypassed for Python. |
| `execute.ts` | **Hard** | Bun transpiler + AsyncFunction eval. Must be bypassed for Python. |
| `snapshot.ts` | **Medium** | Only captures JS `globalThis`. Python `_namespace` is not persisted. |

### Modules Already Language-Agnostic

| Module | Notes |
|--------|-------|
| `execution-queue.ts` | Pure execution scheduling, no language awareness |
| `output.ts` | Operates on rich output markers, protocol is shared |
| `mime.ts` | File extension to MIME type, no language coupling |
| `types.ts` | `CellLanguage` type already exists, WS protocol supports `language` field |
| `format.ts` | Cell metadata can store any key-value pairs |
| `notebook.ts` | Already migrates `%%python` to `metadata.language`, no TS-specific logic in model |
| `magic.ts` | String-based parsing, already detects `%%python` |

### The Server Already Has the Right Architecture

The server at `packages/app/src/server.ts:1086-1184` already implements a clean language routing pattern:

```
if (language === "python") {
    --> PythonKernel.execute()
} else {
    --> executeCode() (TS path)
}
```

Both paths produce the same WebSocket message types (`stream`, `result`, `error`, `status`), so the UI is already language-agnostic for output rendering.

### What Would Need to Change for a New Language (e.g., R, Julia)

1. **New kernel backend**: A file analogous to `python-bridge.ts` + the language's kernel script
2. **Extend `CellLanguage` type**: Add the new language to the union type at `types.ts:78`
3. **Add routing branch in server**: Add another `else if (language === "newlang")` block
4. **Snapshot support**: Extend `snapshot.ts` to capture state from the new kernel
5. **VS Code extension**: Add the language to `supportedLanguages` in `YbkKernel.ts:55`

### Shared Interfaces

The following interfaces are effectively shared between TS and Python:

```typescript
// WebSocket protocol (types.ts) — both languages produce these
type WsIncoming =
  | { type: "stream"; cellId: string; name: "stdout" | "stderr"; text: string }
  | { type: "result"; cellId: string; value: string; richOutput?: RichOutput }
  | { type: "error"; cellId: string; ename: string; evalue: string; traceback: string[] }
  | { type: "status"; cellId: string; status: "busy" | "idle" }

// Python execution result (python-bridge.ts) — mirrors ExecResult
interface PythonExecResult {
  value: string | null;
  stdout: string;
  stderr: string;
  mimeOutputs: Array<{ mime: string; data: string }>;
  error?: { ename: string; evalue: string; traceback: string[] };
}

// TS execution result (execute.ts)
interface ExecResult {
  value: unknown;
  stdout: string;
  stderr: string;
  tables: Record<string, unknown>[];
  error?: { ename: string; evalue: string; traceback: string[] };
}
```

The error shape `{ ename, evalue, traceback }` is shared across both languages, which is good.

### Output Format Differences

| Feature | TypeScript | Python |
|---------|-----------|--------|
| Return value | Raw JS value via `detectOutputType()` to rich output | `repr(value)` string |
| Tables | `console.table(data)` via `tables[]` | Not directly supported (no equivalent) |
| Rich output | Marker objects (`__type: "chart"`, etc.) | MIME outputs (matplotlib PNG, PIL PNG) |
| Streaming | `console.log()` monkey-patched | `sys.stdout` redirected via `_StreamWriter` |

**Gap**: Python results are always `repr()` strings, while TS results are typed objects that can be rendered as tables/charts/JSON trees. Python cells could benefit from structured output detection (e.g., detecting pandas DataFrames and sending them as table data).

---

## 6. The .ybk File Format

### Schema (from `packages/core/src/format.ts:8-49`)

```typescript
interface YbkNotebook {
  version: string;          // "0.1.0"
  metadata: {
    title: string;
    created: string;        // ISO date
    runtime: string;        // "bun"
    bunVersion: string;
    dependencies?: Record<string, string>;
    packageJson?: string;
    bunLock?: string;
    pythonPath?: string;    // <-- already exists for Python support
  };
  settings: { fontSize, tabSize, wordWrap, theme };
  cells: YbkCell[];
}

interface YbkCell {
  id: string;
  type: "code" | "markdown";
  source: string;
  outputs?: YbkCellOutput[];
  executionCount?: number | null;
  metadata?: Record<string, unknown>;  // <-- language stored here
}
```

### Cell Language Field

**The `.ybk` format already supports per-cell language** via `cell.metadata.language`. This is a free-form `Record<string, unknown>` field, so no schema change is needed.

Example of a Python cell in `.ybk`:
```json
{
  "id": "cell-abc123",
  "type": "code",
  "source": "import pandas as pd\ndf = pd.read_csv('data.csv')\ndf.head()",
  "metadata": { "language": "python" },
  "outputs": [],
  "executionCount": 3
}
```

### Notebook-Level Language

The notebook metadata has `runtime: "bun"` but no notebook-level default language field. The default language is implicitly TypeScript (hardcoded in `notebook.ts:38`):
```typescript
kernelspec: { name: "yeastbook", display_name: "Yeastbook (Bun)", language: "typescript" },
language_info: { name: "typescript" },
```

### `.ipynb` Conversion

When converting to `.ipynb` format, the kernel language is hardcoded to TypeScript at `format.ts:78-80`:
```typescript
kernelspec: { name: "yeastbook", display_name: "Yeastbook (Bun)", language: "typescript" },
language_info: { name: "typescript" },
```

This doesn't affect per-cell language — `.ipynb` also supports per-cell metadata. But it means the notebook-level metadata always says "typescript" even if the notebook is mostly Python.

---

## 7. Risk Areas

### 7.1 Variable Sharing Between TS and Python Cells

**Current state**: `YeastBridge` exists and works for explicit data sharing (`yb.push()`/`yb.set()`). However:

- **No implicit sharing**: A variable defined in a TS cell (`const x = 42`) is not automatically available in a Python cell. Users must explicitly use `yb.push("x", x)` in TS and `yb.get("x")` in Python.
- **Serialization boundary**: Data crosses JSON serialization. Complex objects (functions, class instances, circular references) cannot be shared. Only JSON-serializable data works.
- **No type mapping**: There's no automatic conversion between TS and Python types (e.g., `Date` to `datetime`, typed arrays to numpy arrays).
- **Race conditions**: If a TS cell and Python cell both write to the bridge simultaneously, the last writer wins. The bridge is not transactional.

### 7.2 Output Format Differences

- **Python `repr()` vs TS rich output**: Python cells return `repr(value)` strings. TS cells return typed objects that get classified by `detectOutputType()` into tables, charts, JSON trees, etc. Python cells miss out on rich rendering unless they produce matplotlib/PIL output.
- **`console.table()` has no Python equivalent**: TS cells can produce tabular output via `console.table()`. Python cells would need explicit DataFrame-to-table conversion.
- **MIME output asymmetry**: Python supports MIME outputs (matplotlib PNG, PIL PNG) via the kernel. TS supports MIME via marker objects (`__mime` property). The protocols are different but both result in the same WS message format.

### 7.3 Error Handling Differences

- **Traceback format**: Python tracebacks include file/line references to `<cell>`. TS errors include Bun runtime stack traces with internal function names (`__yb_cell__`, IIFE wrappers). Neither is ideal for notebook display.
- **Interrupt mechanism**: TS uses `Promise.race` with an interrupt promise. Python uses `SIGINT` signal handling. Both work but have different edge cases (e.g., Python can interrupt C extensions, TS can only interrupt at async yield points).

### 7.4 Session Snapshot Gaps

- **Python state not persisted**: `snapshot.ts` only captures TS `context`/`globalThis`. When a session is restored, Python variables are lost.
- **Python kernel restart**: If the Python daemon crashes or is restarted, all Python state is lost. There's no mechanism to replay Python cells to restore state.

### 7.5 Package/Dependency Management

- **TS dependencies**: Managed via `%install` then `bun add`. Dependencies stored in `notebook.metadata.dependencies` and `bunLock`.
- **Python dependencies**: Managed via `%pip`/`!pip` in the Python kernel. **Not stored in the notebook file.** There's no `requirements.txt` equivalent in `.ybk` metadata.
- **No isolation between notebooks**: TS packages install to the notebook's directory. Python packages install to the active venv. Multiple notebooks sharing a venv can conflict.

### 7.6 `%%python` Legacy Migration

The `Notebook` class at `notebook.ts:42-55` migrates `%%python` cells to `metadata.language` on load. This migration:
- Only runs on notebook load (not on save)
- Modifies `cell.source` by stripping the `%%python` line
- Is one-way (no reverse migration)

If a user has an older `.ybk` file with `%%python` cells and opens it in an older version of Yeastbook after the migration, the cells would no longer have `%%python` and would be treated as TypeScript.

### 7.7 VS Code Extension Language Gap

The VS Code `YbkKernel.executeCell()` at `packages/vscode/src/YbkKernel.ts:547-551` does **not** send the `language` field:
```typescript
this.ws!.send(JSON.stringify({
  type: "execute",
  cellId,
  code,
  // Missing: language field
}));
```

This means VS Code cells always fall through to the magic-command detection path (`%%python`) or default to TypeScript. The per-cell metadata `language` field is not transmitted.

### 7.8 SQL Engine Coupling

The `SqlEngine` at `packages/app/src/kernel/sql-engine.ts` uses `bun:sqlite` and is only accessible via TS-side magic commands (`%sql`). Python cells cannot use `%sql` — they would need to use Python's `sqlite3` module directly, which means separate database connections and no shared state with the TS SQL engine.

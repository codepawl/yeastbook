import { useRef, useEffect, useCallback, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { CellOutput } from "./CellOutput.tsx";
import type { Cell, CellOutput as CellOutputType } from "../types.ts";

interface Props {
  cell: Cell;
  busy: boolean;
  liveOutputs: CellOutputType[];
  theme: "light" | "dark";
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  installing?: { packages: string[]; logs: string[]; done: boolean; error?: string };
  onRun: (cellId: string, code: string) => void;
  onRunAndAdvance: (cellId: string, code: string) => void;
  onSourceChange: (cellId: string, source: string) => void;
  onDelete: (cellId: string) => void;
  onClear: (cellId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function CodeCell({
  cell, busy, liveOutputs, theme, fontSize, tabSize, wordWrap,
  installing, onRun, onRunAndAdvance, onSourceChange, onDelete, onClear, onMoveUp, onMoveDown,
}: Props) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [editorHeight, setEditorHeight] = useState(60);
  const sourceRef = useRef(cell.source.join("\n"));
  // Refs for callbacks to avoid stale closures in Monaco commands
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onRunAndAdvanceRef = useRef(onRunAndAdvance);
  onRunAndAdvanceRef.current = onRunAndAdvance;

  const updateHeight = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
    const lineCount = editor.getModel()?.getLineCount() ?? 1;
    const height = Math.max(lineHeight * lineCount + 20, 60);
    setEditorHeight(height);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // TypeScript compiler options
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    });

    // Load Bun type definitions
    fetch("/api/types/bun")
      .then((r) => r.text())
      .then((dts) => {
        if (dts) {
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            dts, "file:///node_modules/@types/bun/index.d.ts"
          );
        }
      })
      .catch(() => {});

    // Shift+Enter: run and advance (use refs to avoid stale closures)
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => onRunAndAdvanceRef.current(cell.id, sourceRef.current),
    );

    // Ctrl/Cmd+Enter: run and stay
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current(cell.id, sourceRef.current),
    );

    // Auto-resize + notify parent of source changes
    editor.onDidChangeModelContent(() => {
      sourceRef.current = editor.getValue();
      onSourceChange(cell.id, sourceRef.current);
      updateHeight();
    });
    updateHeight();
  }, [cell.id, onSourceChange, updateHeight]);

  useEffect(() => { updateHeight(); }, [updateHeight]);

  const displayOutputs = liveOutputs.length > 0 ? liveOutputs : cell.outputs;

  return (
    <div className="cell code-cell" id={`cell-${cell.id}`}>
      <div className="cell-header">
        <span className="exec-count">
          {busy && <span className="busy-indicator" />}
          {cell.execution_count ? `[${cell.execution_count}]` : "[ ]"}
        </span>
        <span className="cell-type">code</span>
        <div className="cell-actions">
          {onMoveUp && <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} title="Move up"><i className="bi bi-chevron-up" /></button>}
          {onMoveDown && <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} title="Move down"><i className="bi bi-chevron-down" /></button>}
          <button className="run-btn" onClick={(e) => { e.stopPropagation(); onRun(cell.id, sourceRef.current); }} title="Run cell">
            <i className="bi bi-play-fill" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClear(cell.id); }} title="Clear output"><i className="bi bi-eraser" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(cell.id); }} title="Delete cell"><i className="bi bi-trash3" /></button>
        </div>
      </div>
      {installing && !installing.done && (
        <div className="install-progress">
          <div className="install-header">
            <span className="busy-indicator" />
            Installing {installing.packages.join(", ")}...
          </div>
          {installing.logs.length > 0 && (
            <pre className="install-logs">{installing.logs.join("")}</pre>
          )}
        </div>
      )}
      {installing?.done && installing.error && (
        <div className="install-error-banner">
          <i className="bi bi-x-circle" /> Install failed: {installing.error}
        </div>
      )}
      {installing?.done && !installing.error && (
        <div className="install-success-banner">
          <i className="bi bi-check-circle" /> Installed {installing.packages.join(", ")}
        </div>
      )}
      <div className="code-area">
        <Editor
          height={editorHeight}
          defaultLanguage="typescript"
          defaultValue={cell.source.join("\n")}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize,
            tabSize,
            wordWrap: wordWrap ? "on" : "off",
            lineNumbers: "on",
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 0,
            renderLineHighlight: "none",
            scrollbar: { vertical: "hidden", horizontal: "hidden" },
            overviewRulerLanes: 0,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
      <CellOutput outputs={displayOutputs} />
    </div>
  );
}

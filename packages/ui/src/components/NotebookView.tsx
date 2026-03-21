import { CodeCell } from "./CodeCell.tsx";
import { MarkdownCell } from "./MarkdownCell.tsx";
import type { Cell, CellOutput, Settings } from "@yeastbook/core";
import type { Mode } from "../hooks/useKeyboardShortcuts.ts";

interface Props {
  cells: Cell[];
  busyCells: Set<string>;
  liveOutputs: Map<string, CellOutput[]>;
  settings: Settings;
  installStates: Map<string, { packages: string[]; logs: string[]; done: boolean; error?: string }>;
  mode: Mode;
  focusedCellId: string | null;
  onModeChange: (mode: Mode) => void;
  onRunCell: (cellId: string, code: string) => void;
  onRunAndAdvance: (cellId: string, code: string) => void;
  onSourceChange: (cellId: string, source: string) => void;
  onDeleteCell: (cellId: string) => void;
  onClearOutput: (cellId: string) => void;
  onUpdateMarkdown: (cellId: string, source: string) => void;
  onAddCell: (type: "code" | "markdown") => void;
  onMoveCell: (cellId: string, direction: "up" | "down") => void;
}

export function NotebookView({
  cells, busyCells, liveOutputs, settings, installStates,
  mode, focusedCellId, onModeChange,
  onRunCell, onRunAndAdvance, onSourceChange, onDeleteCell, onClearOutput, onUpdateMarkdown, onAddCell, onMoveCell,
}: Props) {
  return (
    <div className="notebook">
      {cells.map((cell, idx) =>
        cell.cell_type === "code" ? (
          <CodeCell
            key={cell.id}
            cell={cell}
            busy={busyCells.has(cell.id)}
            liveOutputs={liveOutputs.get(cell.id) || []}
            theme={settings.appearance.theme}
            fontSize={settings.editor.fontSize}
            tabSize={settings.editor.tabSize}
            wordWrap={settings.editor.wordWrap}
            installing={installStates.get(cell.id)}
            isCommandFocused={mode === "command" && focusedCellId === cell.id}
            onModeChange={onModeChange}
            onRun={onRunCell}
            onRunAndAdvance={onRunAndAdvance}
            onSourceChange={onSourceChange}
            onDelete={onDeleteCell}
            onClear={onClearOutput}
            onMoveUp={idx > 0 ? () => onMoveCell(cell.id, "up") : undefined}
            onMoveDown={idx < cells.length - 1 ? () => onMoveCell(cell.id, "down") : undefined}
          />
        ) : (
          <MarkdownCell
            key={cell.id}
            cell={cell}
            onUpdate={onUpdateMarkdown}
            onDelete={onDeleteCell}
            onMoveUp={idx > 0 ? () => onMoveCell(cell.id, "up") : undefined}
            onMoveDown={idx < cells.length - 1 ? () => onMoveCell(cell.id, "down") : undefined}
          />
        )
      )}
      <div className="add-cell-bar">
        <button onClick={() => onAddCell("code")}><i className="bi bi-code-slash" /> Code</button>
        <button onClick={() => onAddCell("markdown")}><i className="bi bi-markdown" /> Markdown</button>
      </div>
      <div className="shortcut-hint">Shift+Enter to run &amp; advance / Ctrl+Enter to run</div>
    </div>
  );
}

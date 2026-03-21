import { useEffect, useRef } from "react";

export type Mode = "command" | "edit";

interface ShortcutHandlers {
  cells: { id: string; cell_type: string }[];
  focusedCellId: string | null;
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  onAddCellAbove: () => void;
  onAddCellBelow: () => void;
  onDeleteCell: () => void;
  onChangeCellType: (type: "code" | "markdown") => void;
  onFocusPrev: () => void;
  onFocusNext: () => void;
  onEnterEdit: () => void;
  onRunCell: () => void;
  onSave: () => void;
  onOpenPalette: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const lastDPress = useRef(0);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const h = handlersRef.current;

      // Global shortcuts (both modes)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        h.onSave();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        h.onOpenPalette();
        return;
      }

      // Only command mode shortcuts below
      if (h.mode !== "command") return;

      // Ignore if in input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "a": e.preventDefault(); h.onAddCellAbove(); break;
        case "b": e.preventDefault(); h.onAddCellBelow(); break;
        case "d": {
          const now = Date.now();
          if (now - lastDPress.current < 500) {
            e.preventDefault(); h.onDeleteCell(); lastDPress.current = 0;
          } else {
            lastDPress.current = now;
          }
          break;
        }
        case "m": e.preventDefault(); h.onChangeCellType("markdown"); break;
        case "y": e.preventDefault(); h.onChangeCellType("code"); break;
        case "ArrowUp": case "k": e.preventDefault(); h.onFocusPrev(); break;
        case "ArrowDown": case "j": e.preventDefault(); h.onFocusNext(); break;
        case "Enter":
          if (!e.shiftKey) { e.preventDefault(); h.onEnterEdit(); }
          else { e.preventDefault(); h.onRunCell(); }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

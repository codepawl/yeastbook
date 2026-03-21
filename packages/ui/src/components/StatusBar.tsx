import type { Mode } from "../hooks/useKeyboardShortcuts.ts";

interface Props {
  mode: Mode;
  connected: boolean;
  saved: boolean;
}

export function StatusBar({ mode, connected, saved }: Props) {
  return (
    <div className="status-bar">
      <span className={`mode-indicator mode-${mode}`}>{mode.toUpperCase()}</span>
      <span className="status-bar-spacer" />
      <span className={`status-dot ${connected ? "connected" : ""}`} />
      <span className="status-bar-text">{connected ? "Connected" : "Disconnected"}</span>
      <span className="status-bar-sep">|</span>
      <span className="status-bar-text">{saved ? "Saved" : "Unsaved"}</span>
    </div>
  );
}

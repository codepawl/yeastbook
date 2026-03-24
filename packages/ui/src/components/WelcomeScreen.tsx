interface Props {
  onNewNotebook: () => void;
  onOpenExplorer: () => void;
}

export function WelcomeScreen({ onNewNotebook, onOpenExplorer }: Props) {
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-icon">
          <i className="bi bi-journal-code" />
        </div>
        <h1 className="welcome-title">No notebook open</h1>
        <p className="welcome-subtitle">Let's yeast some notebooks!</p>
        <div className="welcome-actions">
          <button className="welcome-btn welcome-btn-primary" onClick={onNewNotebook}>
            <i className="bi bi-file-earmark-plus" /> New Notebook
          </button>
          <button className="welcome-btn welcome-btn-secondary" onClick={onOpenExplorer}>
            <i className="bi bi-folder2-open" /> Open from Explorer
          </button>
        </div>
      </div>
    </div>
  );
}

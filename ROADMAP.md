# Roadmap

## Current: v0.0.x (Internal Dev)

Core execution engine, Monaco editor, rich output (charts, tables, JSON trees), Jupyter import/export, session persistence, VS Code extension.

## Next: v0.1.0 (Public Beta)

- [ ] `bunx yeastbook new` works on a another user's machine
- [ ] No crash during normal usage
- [ ] README sufficient for new users
- [ ] Binary builds on Linux + macOS
- [ ] At least 1-2 external testers confirm usable

## Planned

**Editor**
- [ ] Multi-cursor support
- [ ] Cell folding
- [ ] Find & replace across cells

**Kernel**
- [ ] `%pip`-style magic for Bun packages
- [ ] Cell execution queue with cancel
- [ ] Session export/restore

**Output**
- [ ] Interactive DataFrame viewer
- [ ] Vega/Vega-Lite chart support
- [ ] LaTeX/KaTeX math rendering

**Ecosystem**
- [ ] Plugin API for custom output renderers
- [ ] npm publish for `yeastbook` CLI
- [ ] Homebrew formula

## Non-Goals (for now)

- Multi-user collaboration (Google Docs style)
- Cloud hosting / Yeastbook-as-a-service
- Python/R kernel support
- JupyterHub compatibility

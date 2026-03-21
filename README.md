# yeastbook

A standalone TypeScript notebook powered by [Bun](https://bun.sh). Think Jupyter, but for TypeScript — no Python, no conda, no kernel installs.

## Quick Start

```bash
# Run instantly (no install)
bunx yeastbook new

# Or install globally
bun install -g yeastbook
yeastbook new
```

## Features

- **Zero config** — one command to start. No kernel setup, no config files.
- **TypeScript native** — write TypeScript/JavaScript in cells, executed by Bun.
- **Top-level await** — `const data = await fetch(...)` just works.
- **Variable sharing** — variables defined in one cell are available in the next.
- **Live output** — console.log streams to the browser in real-time via WebSocket.
- **Jupyter compatible** — import/export `.ipynb` files.
- **Light & dark themes** — switch in the UI or settings.
- **Self-contained binary** — download a single file, no runtime needed.

## CLI Commands

```bash
yeastbook new              # Create a new .ybk notebook
yeastbook new --ipynb      # Create a new .ipynb notebook
yeastbook <file>           # Open an existing notebook
yeastbook export <f.ybk>   # Convert .ybk → .ipynb
yeastbook import <f.ipynb>  # Convert .ipynb → .ybk
```

## .ybk Format

Yeastbook uses `.ybk` — a simplified notebook format. It's JSON with:
- Single-string cell sources (not arrays)
- Embedded settings (theme, font size, etc.)
- Full round-trip compatibility with Jupyter `.ipynb`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift+Enter` | Run cell & advance |
| `Ctrl+Enter` | Run cell & stay |
| `Ctrl+S` | Save notebook |

## Development

```bash
git clone https://github.com/youruser/yeastbook
cd yeastbook
bun install
bun run dev          # Build UI + start dev server
bun test             # Run tests
bun run build:all    # Full build (UI → embed → binary)
```

## License

MIT

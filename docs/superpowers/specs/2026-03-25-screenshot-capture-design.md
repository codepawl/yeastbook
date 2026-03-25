# Screenshot Capture Script

**Date:** 2026-03-25
**Status:** Approved

## Goal

Automate capturing README screenshots so they stay current as the UI evolves. One command produces all demo images.

## Files to Create

### `demos/screenshot-demo.ybk`

A purpose-built notebook with three sections:

1. **Hero section** — markdown title + code cell with console output + a small Chart.js chart. Gives the "real notebook in action" feel for the main README image.
2. **Rich output section** — Chart.js bar chart cell, a data table cell (array of objects), and a JSON/math cell. Showcases the variety of output renderers.
3. **SQL section** — `%sql import` a small inline CSV, then `%sql SELECT` query. Shows SQL support with interactive table result.

### `scripts/capture-screenshots.ts`

Bun script using Playwright:

1. **Start server** — spawn `bun packages/app/src/cli.ts demos/screenshot-demo.ybk --port <random> --no-open` as a child process. Wait for the server to be ready (poll HTTP until 200).
2. **Launch browser** — Playwright chromium, viewport 1280x800.
3. **Execute cells** — click "Run All" button or use keyboard shortcut to execute all cells. Wait for all cell outputs to render (poll for output elements).
4. **Capture screenshots:**
   - `assets/demo-hero.png` — full page screenshot at scroll position 0 (top of notebook showing first cells with outputs)
   - `assets/demo-rich-output.png` — scroll to rich output section, screenshot the visible area showing charts/tables
   - `assets/demo-sql.png` — scroll to SQL section, screenshot the query + table result area
5. **Cleanup** — kill the server process, close browser, exit.

Error handling: if server fails to start within 15s or cells fail to execute within 30s, exit with error.

### Root `package.json` change

Add script: `"screenshots": "bun scripts/capture-screenshots.ts"`

### `README.md` changes

Remove the four `<!-- TODO -->` comments next to the image references.

## Dependencies

- `playwright` added as a devDependency for browser automation
- Playwright chromium browser (installed via `bunx playwright install chromium`)

## Not in Scope

- `demo-vscode.png` — requires VS Code, not automatable with this approach
- CI integration — can be added later if needed
- Dark mode variants

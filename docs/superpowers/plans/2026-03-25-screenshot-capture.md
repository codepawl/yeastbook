# Screenshot Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate capturing README screenshots from a running yeastbook instance using Playwright.

**Architecture:** A Bun script spawns the yeastbook server with a purpose-built demo notebook, uses Playwright to open the browser, executes all cells, and captures three screenshots for the README.

**Tech Stack:** Bun, Playwright (chromium), yeastbook CLI

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `demos/screenshot-demo.ybk` | Purpose-built notebook with hero, rich output, and SQL sections |
| Create | `scripts/capture-screenshots.ts` | Playwright script: spawn server, execute cells, capture screenshots |
| Modify | `package.json` | Add `screenshots` script |
| Modify | `README.md` | Remove `<!-- TODO -->` comments |

---

### Task 1: Install Playwright and create demo notebook

**Files:**
- Create: `demos/screenshot-demo.ybk`
- Modify: `package.json` (root — add devDependency + script)

- [ ] **Step 1: Install Playwright**

```bash
bun add -d playwright
bunx playwright install chromium
```

- [ ] **Step 2: Add screenshots script to package.json**

Add to `scripts` in root `package.json`:
```json
"screenshots": "bun scripts/capture-screenshots.ts"
```

- [ ] **Step 3: Create `demos/screenshot-demo.ybk`**

A `.ybk` notebook with three sections. Cells have NO pre-baked outputs (they'll be executed live).

**Section 1 — Hero:** markdown intro + code cell with console output + Chart.js bar chart
**Section 2 — Rich Output:** data table (array of objects) + math/LaTeX cell
**Section 3 — SQL:** `%sql` import inline CSV + `%sql SELECT` query

```json
{
  "version": "0.1.0",
  "metadata": {
    "title": "Yeastbook Demo",
    "created": "2026-03-25T00:00:00.000Z",
    "runtime": "bun",
    "bunVersion": "1.3.11"
  },
  "settings": {
    "fontSize": 13,
    "tabSize": 2,
    "wordWrap": false,
    "theme": "light"
  },
  "cells": [
    {
      "id": "hero-md",
      "type": "markdown",
      "source": "# Welcome to Yeastbook\nA polyglot notebook powered by Bun. TypeScript-first with Python support."
    },
    {
      "id": "hero-code",
      "type": "code",
      "source": "// Quick data analysis\nconst sales = [\n  { month: \"Jan\", revenue: 4200 },\n  { month: \"Feb\", revenue: 5800 },\n  { month: \"Mar\", revenue: 7100 },\n  { month: \"Apr\", revenue: 6300 },\n  { month: \"May\", revenue: 8900 },\n  { month: \"Jun\", revenue: 9400 },\n]\n\nconst total = sales.reduce((s, r) => s + r.revenue, 0)\nconsole.log(`Total revenue: $${total.toLocaleString()}`)\nconsole.log(`Average: $${(total / sales.length).toLocaleString()}`)\nconsole.log(`Best month: ${sales.sort((a, b) => b.revenue - a.revenue)[0].month}`)\nsales"
    },
    {
      "id": "hero-chart",
      "type": "code",
      "source": ";({\n  __type: \"chart\",\n  config: {\n    chartType: \"bar\",\n    title: \"Monthly Revenue\",\n    xLabel: \"Month\",\n    yLabel: \"Revenue ($)\"\n  },\n  data: [4200, 5800, 7100, 6300, 8900, 9400],\n  labels: [\"Jan\", \"Feb\", \"Mar\", \"Apr\", \"May\", \"Jun\"]\n})"
    },
    {
      "id": "rich-md",
      "type": "markdown",
      "source": "## Rich Output\nYeastbook renders tables, charts, math, and more."
    },
    {
      "id": "rich-table",
      "type": "code",
      "source": "// Any array of objects auto-renders as a table\n[\n  { name: \"Alice\", role: \"Engineer\", score: 94 },\n  { name: \"Bob\", role: \"Designer\", score: 87 },\n  { name: \"Carol\", role: \"PM\", score: 91 },\n  { name: \"Dan\", role: \"Engineer\", score: 96 },\n  { name: \"Eve\", role: \"Designer\", score: 89 },\n]"
    },
    {
      "id": "rich-math",
      "type": "code",
      "source": ";({ __type: \"math\", latex: \"\\\\nabla \\\\times \\\\mathbf{E} = -\\\\frac{\\\\partial \\\\mathbf{B}}{\\\\partial t}\" })"
    },
    {
      "id": "sql-md",
      "type": "markdown",
      "source": "## SQL Support\nQuery data directly in your notebook with built-in SQLite."
    },
    {
      "id": "sql-import",
      "type": "code",
      "source": "%sql CREATE TABLE IF NOT EXISTS products (name TEXT, category TEXT, price REAL, stock INT);\n%sql INSERT INTO products VALUES ('Laptop', 'Electronics', 999.99, 45), ('Keyboard', 'Electronics', 79.99, 200), ('Notebook', 'Office', 12.99, 500), ('Monitor', 'Electronics', 349.99, 78), ('Pen Set', 'Office', 24.99, 300), ('Webcam', 'Electronics', 59.99, 150);"
    },
    {
      "id": "sql-query",
      "type": "code",
      "source": "%sql SELECT category, COUNT(*) as items, ROUND(AVG(price), 2) as avg_price, SUM(stock) as total_stock FROM products GROUP BY category ORDER BY avg_price DESC"
    }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add demos/screenshot-demo.ybk package.json
git commit -m "chore: add screenshot demo notebook and playwright dep"
```

---

### Task 2: Write the capture script

**Files:**
- Create: `scripts/capture-screenshots.ts`

- [ ] **Step 1: Create `scripts/capture-screenshots.ts`**

```typescript
#!/usr/bin/env bun
// scripts/capture-screenshots.ts — Capture README screenshots using Playwright

import { chromium } from "playwright";
import { resolve } from "node:path";
import { Subprocess } from "bun";

const DEMO_NOTEBOOK = resolve("demos/screenshot-demo.ybk");
const ASSETS_DIR = resolve("assets");
const PORT = 9222; // unlikely to conflict
const VIEWPORT = { width: 1280, height: 800 };
const SERVER_TIMEOUT = 15_000;
const EXECUTE_TIMEOUT = 30_000;

async function waitForServer(port: number, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://localhost:${port}`);
      if (res.ok) return;
    } catch {}
    await Bun.sleep(200);
  }
  throw new Error(`Server did not start within ${timeout}ms`);
}

async function main() {
  console.log("Starting yeastbook server...");
  const serverProc = Bun.spawn(
    ["bun", "packages/app/src/cli.ts", DEMO_NOTEBOOK, "--port", String(PORT), "--no-open"],
    { stdout: "inherit", stderr: "inherit" }
  );

  try {
    await waitForServer(PORT, SERVER_TIMEOUT);
    console.log("Server ready.");

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });

    await page.goto(`http://localhost:${PORT}`);
    // Wait for notebook UI to load (Monaco editors to initialize)
    await page.waitForSelector(".cell-wrapper", { timeout: 10_000 });
    await page.waitForTimeout(1000); // let Monaco finish rendering

    // Click "Run All Cells"
    console.log("Executing all cells...");
    await page.click('button[title="Run All Cells"]');

    // Wait for all cells to finish executing — check that no cells are busy
    await page.waitForFunction(() => {
      const busyCells = document.querySelectorAll(".cell-exec-busy");
      const outputs = document.querySelectorAll(".output-area");
      return busyCells.length === 0 && outputs.length >= 5;
    }, { timeout: EXECUTE_TIMEOUT });
    // Extra settle time for charts/tables to render
    await page.waitForTimeout(2000);

    // Screenshot 1: Hero — top of notebook
    console.log("Capturing demo-hero.png...");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(ASSETS_DIR, "demo-hero.png") });

    // Screenshot 2: Rich output section — scroll to rich-md cell
    console.log("Capturing demo-rich-output.png...");
    const richSection = page.locator('[data-type="markdown"]:has-text("Rich Output")');
    if (await richSection.count() > 0) {
      await richSection.scrollIntoViewIfNeeded();
    } else {
      // Fallback: scroll to middle of page
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(ASSETS_DIR, "demo-rich-output.png") });

    // Screenshot 3: SQL section — scroll to sql-md cell
    console.log("Capturing demo-sql.png...");
    const sqlSection = page.locator('[data-type="markdown"]:has-text("SQL Support")');
    if (await sqlSection.count() > 0) {
      await sqlSection.scrollIntoViewIfNeeded();
    } else {
      // Fallback: scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(ASSETS_DIR, "demo-sql.png") });

    console.log("All screenshots captured!");
    await browser.close();
  } finally {
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Test the script manually**

```bash
bun scripts/capture-screenshots.ts
```

Verify:
- Server starts and cells execute
- `assets/demo-hero.png`, `assets/demo-rich-output.png`, `assets/demo-sql.png` are created
- Screenshots show the notebook with executed outputs

- [ ] **Step 3: Iterate on selectors if needed**

If `button[title="Run All Cells"]` or `[data-type="markdown"]` don't match, inspect the actual DOM in the Playwright trace and adjust selectors.

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-screenshots.ts
git commit -m "feat: add automated screenshot capture script"
```

---

### Task 3: Clean up README TODO comments

**Files:**
- Modify: `README.md` (lines 23, 95, 123, 179)

- [ ] **Step 1: Remove TODO comments from README.md**

Remove these four lines:
- Line 23: `  <!-- TODO: Replace with actual screenshot of the notebook UI -->`
- Line 95: `  <!-- TODO: Replace with actual screenshot showing chart + table + JSON output -->`
- Line 123: `  <!-- TODO: Replace with actual screenshot of VS Code with .ybk file open -->`
- Line 179: `  <!-- TODO: Replace with actual screenshot of SQL query + table result -->`

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "chore: remove README screenshot TODO comments"
```

# Contributing to Yeastbook

Thanks for your interest in contributing! Yeastbook is a TypeScript notebook powered by Bun, and we welcome contributions of all kinds.

## Getting Started

```bash
git clone https://github.com/nxank4/yeastbook
cd yeastbook
bun install
bun run dev          # Build UI + start dev server with hot reload
bun test             # Run all tests
bun run build:ui     # Bundle UI only
```

## Project Structure

Bun monorepo with 4 packages:

| Package | Path | Description |
|---------|------|-------------|
| `@yeastbook/core` | `packages/core` | Shared library (types, transforms, format conversion) |
| `@yeastbook/app` | `packages/app` | CLI, HTTP server, kernel (cell execution) |
| `@yeastbook/ui` | `packages/ui` | React frontend with Monaco editor |
| `vscode-yeastbook` | `packages/vscode` | VS Code extension |

## How to Contribute

### Bug Reports

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Yeastbook version (`yeastbook --version`) and OS

### Feature Requests

Open an issue describing the use case. We prefer small, focused features that serve the core notebook experience.

### Pull Requests

1. Fork the repo and create a branch from `staging`
2. Make your changes
3. Ensure `bun test` passes and `bun run build:ui` succeeds
4. Open a PR against `staging`

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `chore:` tooling, config
- `docs:` documentation
- `refactor:` code restructure
- `test:` adding tests

## Code Style

- TypeScript everywhere, Bun APIs preferred over Node.js equivalents
- No external bundlers (Vite, webpack) — we use `bun build`
- No Express — we use `Bun.serve()`
- Tests use `bun test` (built-in test runner)

## PR Checklist

Before submitting:

- [ ] `bun test` passes
- [ ] `bun run build:ui` succeeds
- [ ] Manual smoke test: `bun packages/app/src/cli.ts new` opens a working notebook
- [ ] No TypeScript errors in changed files

## Questions?

Open an issue or start a discussion. We're happy to help!

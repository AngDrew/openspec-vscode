# Repository Agent Guide (openspec-vscode)

This repo is a VS Code extension written in TypeScript. Follow existing patterns in `src/` and keep changes scoped.

## Build / Lint / Test

Package manager: `npm` (lockfile: `package-lock.json`). Run commands from the repo root.

```bash
npm install
```

### Build

```bash
npm run compile
```

Watch:

```bash
npm run watch
```

Prepublish (used by VS Code packaging):

```bash
npm run vscode:prepublish
```

Notes:
- Extension entrypoint is `out/extension.js`.
- If `tsc` is not found, run `npm install` first.

### Lint

```bash
npm run lint
```

Auto-fix:

```bash
npx eslint src --ext ts --fix
```

### Tests

Tests use Mocha (TDD interface: `suite()` / `test()`), located in `test/suite/`.

Compile + lint + compile tests:

```bash
npm run pretest
```

Run tests (expects compiled output under `out/test/`):

```bash
npm test
```

Compile then run:

```bash
npm run test:compile
```

Where this comes from (`package.json`):
- `pretest`: `npm run compile && npm run lint && tsc -p ./tsconfig.test.json`
- `test`: `node ./out/test/test/runTest.js`

#### Run a single test (file or name)

`npm test` uses a harness that loads compiled `*.test.js` (see `test/runTest.ts`). For single-test workflows, run Mocha directly against compiled output.

1) Compile tests:

```bash
npm run pretest
```

2) Run one test file:

```bash
npx mocha "out/test/test/suite/extension.test.js" --timeout 60000
```

3) Run by test name:

```bash
npx mocha "out/test/test/suite/extension.test.js" --grep "Should register commands" --timeout 60000
```

If the path differs, inspect `out/test/` for the compiled structure.

### Packaging

```bash
npm install -g @vscode/vsce
vsce package
```

## Project Layout

- `src/extension.ts` - activation, commands, watchers
- `src/providers/explorerProvider.ts` - tree view
- `src/providers/webviewProvider.ts` - webview panel + HTML
- `src/utils/workspace.ts` - filesystem + OpenSpec discovery (cached)
- `src/utils/errorHandler.ts` - output channel logging
- `src/utils/cache.ts` - TTL cache
- `src/types/index.ts` - shared types
- `test/runTest.ts` - Mocha harness
- `test/suite/*.test.ts` - tests

Generated (do not commit): `out/`, `dist/`, `*.vsix`.

## Code Style

### TypeScript / Types

- `strict: true` in `tsconfig.json`.
- Prefer `unknown` + narrowing over `any`.
- `any` is acceptable for VS Code mocks in tests.

### Formatting

- 2-space indent
- single quotes
- semicolons
- No Prettier config: match existing formatting in `src/*.ts`.

### Imports

Use the repo's established patterns:
- VS Code API: `import * as vscode from 'vscode';`
- Node builtins: `import * as path from 'path';`, `import * as fs from 'fs/promises';`
- Third-party: idiomatic imports (e.g. `import { marked } from 'marked';`).

Recommended order: `vscode` -> Node -> third-party -> local.

### Naming

- Classes: `PascalCase`
- functions/vars: `camelCase`
- files: `camelCase.ts` (match existing)
- OpenSpec change IDs: `kebab-case`

### Error Handling / Logging

- Prefer `ErrorHandler` (`src/utils/errorHandler.ts`) over `console.*`.
- For actionable failures, include context: `ErrorHandler.handle(err, 'what failed')`.
- Avoid silent catch blocks; either log or surface the error.

### VS Code Extension Patterns

- Push disposables to `context.subscriptions`.
- Keep `activate()` lightweight.
- Prefer `vscode.Uri` with VS Code APIs; use `path.join` for filesystem paths.
- Debounce file watcher events; don't spam notifications.

### Webview Safety

- Keep CSP strict.
- Use `webview.asWebviewUri(...)` for local resources.
- Escape file paths used in HTML attributes.
- Treat webview messages as untrusted input; validate `message.type` and fields.

### Tests

- Mocha TDD (`suite`, `test`, `setup`, `suiteSetup`).
- Keep tests deterministic; avoid network.
- Use `path.join` to avoid platform path issues.
- Use Node `assert`.

## Cursor / Copilot Rules

- Cursor rules: none found (`.cursor/rules/` and `.cursorrules` not present).
- Copilot rules: none found (`.github/copilot-instructions.md` not present).

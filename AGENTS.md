# Repository Agent Guide (openspec-vscode)

This repo is a VS Code extension written in TypeScript. Keep changes scoped, follow existing patterns in `src/`, and avoid committing generated output.

## Commands (Build / Lint / Test)

Package manager: `npm` (lockfile: `package-lock.json`). Run commands from the repo root.

Install deps:

```bash
npm install
```

Build (TypeScript -> `out/`):

```bash
npm run compile
```

Watch mode:

```bash
npm run watch
```

Lint (ESLint over `src/**/*.ts`):

```bash
npm run lint
```

Lint autofix (safe default):

```bash
npx eslint src --ext ts --fix
```

Prepublish (what VS Code packaging uses):

```bash
npm run vscode:prepublish
```

### Tests

Tests use Mocha (TDD interface: `suite()` / `test()`), run via the VS Code test harness.

Full test pipeline (compile + lint + compile tests):

```bash
npm run pretest
```

Run tests (executes compiled harness at `out/test/test/runTest.js`):

```bash
npm test
```

Compile then run tests (convenience):

```bash
npm run test:compile
```

#### Running a single test (recommended workflow)

`npm test` loads all compiled `*.test.js` under `out/test/` (see `test/runTest.ts`). For single-test iteration, run Mocha directly against compiled output.

1) Compile tests once:

```bash
npm run pretest
```

2) Run a single test file:

```bash
npx mocha "out/test/test/suite/workspace.test.js" --timeout 60000
```

3) Run a single test by name:

```bash
npx mocha "out/test/test/suite/workspace.test.js" --grep "Workspace" --timeout 60000
```

If paths differ, inspect `out/test/` (compiled structure mirrors `test/`).

### Packaging

Do not commit built artifacts (`out/`, `dist/`, `*.vsix`). To package locally:

```bash
npx vsce package
```

## Project Layout (key files)

- `src/extension.ts` - entrypoint (`activate`/`deactivate`)
- `src/extension/commands.ts` - command registration and terminal integration
- `src/extension/watcher.ts` - `openspec/**` filesystem watcher + debounce
- `src/providers/explorerProvider.ts` - activity bar tree view
- `src/providers/webviewProvider.ts` - details webview + CSP + message handling
- `src/utils/workspace.ts` - filesystem helpers + caching + OpenCode port checks
- `src/utils/errorHandler.ts` - output channel + user notifications
- `src/types/index.ts` - shared types
- `test/runTest.ts` - Mocha harness (adds `**/**.test.js`)
- `test/suite/*.test.ts` - test suites

## Code Style (TypeScript)

Compiler settings:
- `strict: true` (`tsconfig.json`)
- `target: ES2020`, `module: commonjs`, `rootDir: src`, `outDir: out`

Types:
- Prefer `unknown` + narrowing over `any`
- `any` is acceptable for VS Code mocks or external untyped boundaries in tests
- Keep async APIs `Promise<T>` and use early returns to reduce nesting

Formatting:
- 2-space indent, single quotes, semicolons (match existing files)
- No Prettier; do not reformat unrelated code

Imports:
- VS Code: `import * as vscode from 'vscode';`
- Node builtins: `import * as path from 'path';`, `import * as fs from 'fs/promises';`
- Third-party: idiomatic (e.g. `import { marked } from 'marked';`)
- Order: `vscode` -> Node -> third-party -> local

Naming:
- Classes/types: `PascalCase`
- Functions/vars: `camelCase`
- Files: `camelCase.ts` (follow existing)
- OpenSpec change IDs: `kebab-case` (folder names under `openspec/changes/`)

Lint rules (see `.eslintrc.js`):
- `@typescript-eslint/no-unused-vars`: error, allow unused args prefixed with `_`
- `@typescript-eslint/no-explicit-any`: warn
- ESLint ignores `out/`, `dist/`, `node_modules/`, and `*.js`

## Error Handling / Logging

- Prefer `ErrorHandler.handle(err, 'context', showMessage?)` over `console.*`
- Include actionable context strings ("reading tasks.md", "setup file watcher", etc.)
- Avoid silent `catch {}` unless explicitly best-effort; otherwise log via `ErrorHandler.debug`/`handle`
- Extension uses an output channel: `OpenSpec Extension`

## VS Code Extension Patterns

- Push disposables to `context.subscriptions`
- Keep `activate()` lightweight; delegate to helpers
- Use `vscode.Uri` with VS Code APIs; use `path.join` for filesystem paths
- Debounce watcher refreshes (see `src/extension/watcher.ts`)
- Terminals: reuse existing terminals by name when possible (see `src/extension/commands.ts`)

## Webview Safety

- Keep CSP strict; only allow local scripts/styles via `${webview.cspSource}`
- Use `webview.asWebviewUri(...)` for extension resources
- Escape values used in HTML attributes (see `escapeAttr` pattern)
- Treat webview messages as untrusted; validate `message.type` and payload before acting

## Cursor / Copilot Rules

- Cursor rules: none found (no `.cursor/rules/` and no `.cursorrules`)
- Copilot rules: none found (no `.github/copilot-instructions.md`)

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: `npx openskills read <skill-name>` (run in your shell)
  - For multiple: `npx openskills read skill-one,skill-two`
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>changelog-automation</name>
<description>Automate changelog generation from commits, PRs, and releases following Keep a Changelog format. Use when setting up release workflows, generating release notes, or standardizing commit conventions.</description>
<location>global</location>
</skill>

<skill>
<name>librarian</name>
<description>Multi-repository codebase exploration. Research library internals, find code patterns, understand architecture, compare implementations across GitHub/npm/PyPI/crates. Use when needing deep understanding of how libraries work, finding implementations across open source, or exploring remote repository structure.</description>
<location>global</location>
</skill>

<skill>
<name>vscode-extension-expert</name>
<description>This skill provides expert-level guidance for VS Code extension development. Use when implementing new extension features, debugging extension code, designing WebView UIs, implementing Language Server Protocol features, or optimizing extension performance. Covers activation events, contribution points, VS Code API patterns, security best practices, testing strategies, and publishing workflows.</description>
<location>global</location>
</skill>

<skill>
<name>vscode-extension-refactorer</name>
<description>This skill provides expert-level guidance for refactoring VS Code extension code. Use when extracting classes or functions, reducing code duplication, improving type safety, reorganizing module structure, applying design patterns, or optimizing performance. Covers systematic refactoring workflows, code smell detection, safe transformation techniques, and VS Code-specific patterns.</description>
<location>global</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>

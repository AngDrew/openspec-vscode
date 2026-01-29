# Contributing

Thanks for helping improve OpenSpecCodeExplorer.

## Development setup

Prereqs:

- VS Code `^1.74.0`
- Node.js + npm

Install dependencies and build:

```bash
npm install
npm run compile
```

Run the extension:

- Open this repository in VS Code
- Start the Extension Development Host (typically `F5`)

## Checks

Lint:

```bash
npm run lint
```

Tests:

```bash
npm run pretest
npm test
```

## Pull requests

- Keep changes scoped and follow existing patterns in `src/`.
- Add or update tests under `test/suite/` when behavior changes.
- Do not commit build output (`out/`, `dist/`) or packaged artifacts (`*.vsix`).

## Reporting issues

When filing a bug report, include:

- VS Code version and OS
- Extension version (`package.json`)
- Steps to reproduce and expected behavior
- Relevant logs from the `OpenSpec Extension` output channel

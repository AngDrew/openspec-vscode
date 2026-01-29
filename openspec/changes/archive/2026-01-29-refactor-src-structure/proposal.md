## Why

The extension code under `src/` is currently small but tightly coupled: `src/extension.ts` owns activation, command registration, file watching, and OpenCode orchestration. This makes it harder to reason about, test, and evolve without accidental regressions.

This change creates a clearer internal structure now, while the project is still small, so future features can land without growing a single “god file”.

## What Changes

- Split responsibilities currently in `src/extension.ts` into a small set of focused modules (activation wiring, command registration, file watching, OpenCode integration).
- Keep all current commands, contributions, and behavior intact (refactor-only).
- Introduce a predictable folder layout under `src/` (e.g. `src/extension/*`, `src/opencode/*`) so new functionality has an obvious home.
- Improve internal logging consistency by preferring the existing `ErrorHandler` over scattered `console.*` usage where practical.

## Capabilities

### New Capabilities
- `internal-src-structure`: Establish and enforce an internal `src/` module layout for the VS Code extension (entrypoint remains `src/extension.ts`, implementation is delegated to organized modules).

### Modified Capabilities

<!-- None (no spec-level behavior changes intended). -->

## Impact

- VS Code extension internals: move/extract code from `src/extension.ts` into new modules and update imports.
- No changes intended to `package.json` command IDs, view IDs, or user-facing behavior.
- Tests/build: `npm run compile` / `npm run lint` / `npm test` should continue to pass after refactor.

## Context

This repository is a VS Code extension written in TypeScript.

Today, `src/extension.ts` is the primary coordination point for:

- activation/deactivation lifecycle
- command registration
- file watching and refresh behavior
- OpenCode server + runner terminal orchestration

Even though the codebase is still small, this concentration makes it easy to introduce regressions (a change in one concern impacts another) and makes maintenance harder (harder navigation and testing).

Constraints:

- Refactor-only: no intended changes to user-facing behavior.
- Keep extension entrypoint stable (`src/extension.ts` -> `out/extension.js`).
- Keep command IDs and package contributions stable.
- Keep patterns aligned with existing utilities (e.g., `ErrorHandler`).

## Goals / Non-Goals

**Goals:**

- Make `src/extension.ts` a thin entrypoint that delegates to organized modules.
- Extract cohesive units:
  - activation wiring
  - command registration
  - OpenSpec file watching
  - OpenCode helper logic
- Improve internal logging consistency (prefer `ErrorHandler` for debug/info and error surfacing).
- Preserve current runtime behavior and existing APIs.

**Non-Goals:**

- No new commands, settings, or contribution changes.
- No change to existing OpenSpec/OpenCode workflows.
- No major architecture rewrite (no DI framework, no large class hierarchy).

## Decisions

- **Keep entrypoint stable**
  - `src/extension.ts` remains the only file exporting `activate()` / `deactivate()`.
  - It delegates to `src/extension/activate.ts` and `src/extension/deactivate.ts`.

- **Minimal module split (not a full feature re-org)**
  - Create a small set of modules to hold extracted logic without over-abstracting.
  - Keep existing folders (`src/providers`, `src/utils`, `src/types`) intact.

- **Runtime state stays explicit and centralized**
  - Store mutable state (file watcher, terminals, debounce timers) in a single runtime object created during activation.
  - Pass that runtime into helpers (commands, watcher) to avoid hidden globals.

- **Prefer `ErrorHandler` over `console.*`**
  - Replace scattered `console.log/error` in core extension code with `ErrorHandler.debug/info/handle` where practical.
  - Leave `ErrorHandler` itself as the only place where `console.error` is acceptable.

## Risks / Trade-offs

- [Refactor regression] Moving code can accidentally change behavior (timing, initialization order) -> Mitigation: keep function bodies intact where possible; run compile/lint/tests.
- [Over-structure] Too many tiny files can hurt discoverability -> Mitigation: keep the split to a few obvious modules; avoid unnecessary abstractions.
- [Circular imports] New modules could introduce cycles -> Mitigation: keep `src/utils/*` dependency direction one-way; avoid importing `extension` modules into `utils`.

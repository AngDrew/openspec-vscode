## Why

The extension should guide users from an empty change scaffold to an active OpenCode session without requiring platform-specific shell scripts. Today, the UX is unclear when a change has no artifacts yet, and the provided automation is Bash-only.

## What Changes

- Detect and operate on the workspace-root `openspec/` folder only (not nested `**/openspec/**`).
- In the change details view, show a clear empty-state CTA when a change exists but has no artifacts yet.
- Add a top "status dot" control to start OpenCode (`opencode serve --port 4099`) and show live started/not-started state via port probing.
- Replace `ralph_opencode.sh` usage with a cross-platform Node script that provides the same behavior (attach/run-loop/check-off verification).
- When artifacts exist, render `proposal.md`, `design.md`, `tasks.md`, and `specs/*/spec.md` in the details UI.

## Capabilities

### New Capabilities

- `root-openspec-discovery`: The extension uses `./openspec` at the workspace root for discovery + watching.
- `opencode-server-controls`: A UI control can start OpenCode server and shows live started status.
- `ralph-runner`: A cross-platform runner provides a 1:1 experience with `ralph_opencode.sh` and can be invoked from user terminals.
- `change-details-artifacts`: The details view renders proposal/design/tasks/specs and shows an empty-state action when missing.

### Modified Capabilities

- `<existing-name>`: <what requirement is changing>

## Impact

- VS Code extension: update `src/extension.ts`, providers, and webview assets for UI + commands.
- Add a Node-based runner script (e.g. `ralph_opencode.mjs`) and wire it to a UI button.
- Port/proc probing logic for OpenCode status (localhost TCP connect).

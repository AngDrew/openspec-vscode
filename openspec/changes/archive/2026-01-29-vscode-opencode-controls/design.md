## Context

This repository is a VS Code extension that surfaces an OpenSpec workflow in the Activity Bar. It currently assumes `openspec/` at the workspace root for core operations, but it watches `**/openspec/**`, which can create noisy refreshes and ambiguous behavior in mono-repos or nested folders.

The existing automation for applying tasks (`ralph_opencode.sh`) is Bash-only and lives in the extension repo, which means it is not naturally available inside a user's workspace terminal on Windows.

The requested UX changes are centered around the change-details view:

- When a change exists but has no artifacts yet, show a clear call-to-action that attaches to an already-running OpenCode server at `http://localhost:4099`.
- Add a "status dot" control that starts the OpenCode server on port 4099 and reflects its started/not-started state.

Constraints:

- Must work on Windows/macOS/Linux.
- Must not rely on a Bash script being present.
- Must keep behavior scoped to the workspace-root `openspec/`.

## Goals / Non-Goals

**Goals:**

- Use `./openspec` at the workspace root as the only OpenSpec root.
- Change-details UI:
  - Empty state when `proposal.md`, `design.md`, `tasks.md`, and `specs/*/spec.md` are all missing.
  - Render `proposal.md`, `design.md`, `tasks.md`, and each `specs/*/spec.md` when present.
- Add a dot button in the change-details header:
  - Red when port 4099 is not listening.
  - Green when port 4099 is listening.
  - Tooltip communicates "OpenCode not started" / "OpenCode started".
  - Clicking red dot runs `opencode serve --port 4099` in a VS Code terminal.
- Replace `ralph_opencode.sh` with a Node-based runner that can be generated into the user workspace and run from any terminal via `node ralph_opencode.mjs`.

**Non-Goals:**

- Guaranteeing that a listener on port 4099 is *specifically* OpenCode (we only probe the port).
- Implementing a full embedded OpenCode client inside the extension.
- Supporting multi-root workspaces beyond the first folder (current extension behavior).

## Decisions

- Root discovery: keep `WorkspaceUtils.getOpenSpecRoot()` as `path.join(workspaceRoot, 'openspec')`, and tighten the file watcher to `openspec/**` instead of `**/openspec/**`.

- OpenCode started state: treat "port 4099 is accepting TCP connections" as started. Implement with Node's `net` module in the extension host (reliable cross-platform).

- UI placement: implement both the dot control and the empty-state "Attach" button inside the change-details webview. This allows a colored dot and a richer UX than tree view title actions.

- Ralph runner implementation: implement a single-file ESM Node script (`ralph_opencode.mjs`) that mirrors `ralph_opencode.sh` behavior:
  - `--attach URL` (or `OPENCODE_ATTACH_URL` env)
  - `MAX_ITERS` env default 20
  - uses `openspec list` to pick the first change
  - walks `tasks.md` for the next unchecked task, sends an instruction block into `opencode run`, and verifies the task checkbox was checked
  - exits with non-zero codes on error

- Runner distribution: the extension generates the runner into the user's workspace root on demand (when the empty-state button is clicked). This makes the script available for the user to run directly in their own terminal.

## Risks / Trade-offs

- [Port probe false positives] Another process could bind 4099 → The dot turns green even if OpenCode isn't running. Mitigation: tooltip and docs can clarify it's "port open".

- [Node availability in terminal] Users may not have `node` on PATH even though VS Code runs on Node → Mitigation: the extension can still run OpenCode commands in a VS Code terminal; the runner being runnable from user terminal is best-effort.

- [Runner behavior drift] Keeping 1:1 parity with the original Bash script can drift over time → Mitigation: keep the Node script logic close to the Bash semantics and include error codes and text output.

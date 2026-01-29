## Why

The current `ralph_opencode.mjs` loop is intentionally conservative (one task at a time), but that makes common “apply change” workflows slower than necessary when users want to run a small batch of tasks in one go.

## What Changes

- Add a new CLI option to the bundled runner to process more than one task per invocation.
- Preserve default behavior (still runs a single task per run unless explicitly configured).
- Keep existing safety guarantees: per-task verification that the task was marked done before moving on.

## Capabilities

### New Capabilities
- `ralph-loop-multi-task`: Runner supports processing multiple tasks per invocation via a new CLI flag while maintaining sequential verification.

### Modified Capabilities
- `ralph-runner`: Add a new requirement describing multi-task-per-run behavior (the runner’s task loop contract changes).

## Impact

- `ralph_opencode.mjs`: parse and honor a new `--count <n>` flag and adjust loop control.
- VS Code UX/docs: any places that reference the runner usage/help text may need updates.

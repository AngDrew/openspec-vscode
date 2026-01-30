## Why

When batching tasks with `--count`, the Ralph runner currently includes the next N unchecked task IDs purely by file order. This can cross section boundaries (e.g. `2.2` followed by `3.1`) and mix unrelated context in a single OpenCode run, increasing drift and wrong-file edits.

## What Changes

- Update `--count` batching so each `opencode run` iteration only includes tasks that share the same parent as the first task in the batch (e.g. `2.2` can batch `2.3`, but not `3.1`).
- Keep default behavior (`--count` omitted) unchanged.
- Add a regression test that proves `--count` does not cross a parent boundary.
- Update relevant spec/docs wording so the intended batching behavior is explicit.

## Capabilities

### New Capabilities

- `ralph-count-same-parent`: Constrain `--count` batching to tasks that share the same parent section to avoid mixed context.

### Modified Capabilities

- `ralph-loop-multi-task`: Clarify batching semantics for `--count` to stop at the parent boundary.
- `ralph-runner`: Clarify runner batching semantics for `--count` to stop at the parent boundary.

## Impact

- `ralph_opencode.mjs`: change how the next batch of task IDs is selected; prompt may optionally add a clarifying line.
- `test/suite/ralphRunner.test.ts`: add a new test case for parent-bounded batching.
- `openspec/specs/ralph-loop-multi-task/spec.md` and `openspec/specs/ralph-runner/spec.md`: update requirement text to match new behavior.
- `README.md`: optional doc tweak to avoid implying `--count` will batch across sections.

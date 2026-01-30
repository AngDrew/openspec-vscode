## Context

The Ralph runner (`ralph_opencode.mjs`) supports batching multiple tasks into a single `opencode run` prompt via `--count <n>`. Today, batching selects the next N unchecked task IDs purely by scanning the file for unchecked tasks and taking the first N.

This can cross section boundaries inside `tasks.md` (e.g. `2.2` followed by `3.1`) which mixes unrelated work into one run. The goal is to keep each run focused on a single parent section.

Constraint: task IDs are one level deep (e.g. `2.2`), no `2.2.1` style nesting.

## Goals / Non-Goals

**Goals:**

- Constrain `--count` batching so it only includes tasks with the same parent number as the first task in the batch (parent for `2.2` is `2`).
- Preserve current behavior when `--count` is omitted (default 1).
- Keep ordering guarantees: tasks are still completed in file order, and verification still ensures tasks are checked off in order.
- Add a regression test that asserts the prompt does not list cross-parent task IDs.

**Non-Goals:**

- Supporting deeper nesting levels (e.g. `2.2.1`) or non-numeric task IDs.
- Rewriting or reformatting `tasks.md` structure; the runner only reads it.
- Changing the MAX_ITERS loop semantics.

## Decisions

- Batch selection changes from:
  - "first N unchecked task IDs" to
  - "first unchecked task ID, then up to N-1 additional unchecked task IDs with the same parent segment".

  Rationale: the first unchecked task is the canonical next work item; keeping subsequent tasks in the same parent section prevents mixed context.

- Parent definition is the integer segment before the first dot.

  Rationale: the repository task format is one-level deep (e.g. `2.2`), so the parent boundary is the top-level section number.

- The prompt is left largely unchanged.

  Rationale: the prompt already enforces a strict "only listed task IDs" rule. If we adjust batching, the prompt naturally reflects the new batch.

## Risks / Trade-offs

- [Users expect `--count` to always fill to N] -> Mitigation: update specs (and optionally README) to document that batching is bounded by parent section.

- [Test fragility due to prompt parsing] -> Mitigation: in tests, reuse the existing `Task IDs (complete in order):` section parsing and assert the first run's IDs via a run log.

## Context

The repository bundles a cross-platform runner script at `ralph_opencode.mjs`. Today it runs tasks sequentially and stops after completing exactly one task per invocation (while also being bounded by `MAX_ITERS` to prevent runaway loops). This is safe but slow when users want to apply a small batch of tasks quickly.

This change introduces an explicit “tasks per run” knob while preserving the runner's core safety property: the runner must verify that a task is marked done in `tasks.md` before proceeding.

Constraints:

- Keep the runner cross-platform and dependency-free (Node built-ins only).
- Preserve default behavior (one task per run).
- Keep existing `MAX_ITERS` semantics as a global safety bound.

## Goals / Non-Goals

**Goals:**

- Add a `--count <n>` CLI flag to `ralph_opencode.mjs` to run up to `n` tasks in a single invocation.
- Default to `--count 1` behavior when not provided.
- Maintain sequential processing and per-task verification (no concurrency).
- Keep logging/UX clear (print effective configuration and progress).

**Non-Goals:**

- Parallel task execution.
- Changing how tasks are discovered (still “next unchecked task id”).
- Changing the OpenCode prompt format beyond what is required to execute multiple tasks.

## Decisions

- Decision: Add `--count <n>`.
  - Rationale: Mirrors existing CLI-style flags (`--attach`, `--change`), avoids environment-variable-only configuration, and is explicit in terminal usage.
  - Alternatives considered:
    - `MAX_TASKS` env var: consistent with `MAX_ITERS`, but less discoverable and harder to document in help output.
    - “run until done”: fastest, but too easy to accidentally run a large change without intending to.

- Decision: Enforce `count` as an integer >= 1.
  - Rationale: Prevent ambiguous behavior; keep control simple.
  - Behavior: invalid values exit with usage error code 64.

- Decision: Keep `MAX_ITERS` as the outer hard stop.
  - Rationale: `MAX_ITERS` already bounds how long the runner can keep iterating. `--count` should be an additional limit, not a replacement.
  - Behavior: The runner stops when either it has completed `count` tasks, all tasks are done, or it hits `MAX_ITERS`.

## Risks / Trade-offs

- Risk: Users set `--count` large and trigger more edits than intended.
  - Mitigation: Default remains 1; `--count` must be provided explicitly.

- Risk: Off-by-one / loop control regressions could break existing 1-task behavior.
  - Mitigation: Keep existing iteration loop structure; add a small wrapper counter and add tests (or manual verification steps) that cover `--count 1`, `--count 2`, and “all tasks done early”.

- Risk: Help/usage drift between docs and behavior.
  - Mitigation: Update `printHelp()` usage line + README snippet if present.

## 1. Runner batching: same-parent selection

- [x] 1.1 Update `findNextUncheckedTaskIds()` in `ralph_opencode.mjs` to stop batching at the parent boundary (parent for `2.2` is `2`)
- [x] 1.2 Add minimal unit coverage via runner test that verifies `--count` does not include cross-parent task IDs in the prompt

## 2. Prompt + documentation alignment

- [x] 2.1 Update the runner prompt at `ralph_opencode.mjs` (around `const prompt =`) only if needed to clarify same-parent batching
- [x] 2.2 Update specs wording (`openspec/specs/ralph-loop-multi-task/spec.md`, `openspec/specs/ralph-runner/spec.md`) to document parent-bounded batching
- [x] 2.3 (Optional) Update `README.md` `--count` wording to avoid implying batching crosses sections

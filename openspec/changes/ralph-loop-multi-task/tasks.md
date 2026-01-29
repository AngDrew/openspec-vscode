## 1. Runner CLI + Loop Control

- [ ] 1.1 Update `ralph_opencode.mjs` help/usage text to document `--count <n>`
- [ ] 1.2 Extend argument parsing to accept `--count <n>` and `--count=<n>` and validate integer >= 1
- [ ] 1.3 Implement tasks-per-run limit: stop after completing N tasks (while still respecting MAX_ITERS)

## 2. Apply UX (VS Code)

- [ ] 2.1 When `OpenSpec: Apply Change` runs, show an input dialog for tasks-per-run with default value `1`
- [ ] 2.2 Validate input (integer >= 1); cancel should not start runner
- [ ] 2.3 Pass `--count <n>` to the runner invocation when user confirms

## 3. Safety + Verification Behavior

- [ ] 3.1 Verify behavior: default (no flag) still completes exactly one task and exits 0 when it succeeds
- [ ] 3.2 Verify behavior: `--count 3` completes up to 3 tasks, stops early if all tasks complete, and preserves per-task “must be checked off” verification
- [ ] 3.3 Verify behavior: invalid `--count` values fail fast with exit code 64 and do not start the loop

## 4. Documentation Touchpoints

- [ ] 4.1 Update `README.md` manual runner invocation section to mention `--count <n>`

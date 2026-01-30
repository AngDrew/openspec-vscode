## MODIFIED Requirements

### Requirement: Runner supports multi-task per invocation
The runner SHALL accept a `--count <n>` flag that controls how many tasks it processes in a single invocation.

#### Scenario: Default remains one task
- **WHEN** the runner is invoked without `--count`
- **THEN** it processes exactly one task (current behavior)

#### Scenario: Runs up to N tasks within the same parent section
- **WHEN** the runner is invoked with `--count 3`
- **THEN** each `opencode run` iteration includes up to 3 unchecked tasks in the prompt (or fewer if fewer tasks remain)
- **AND** the runner does not include tasks from a different parent section than the first selected task

#### Scenario: Count does not change MAX_ITERS loop behavior
- **WHEN** the runner is invoked with `--count 3`
- **THEN** it continues iterating until tasks complete or `MAX_ITERS` is reached (as in the default behavior)

#### Scenario: Invalid count is rejected
- **WHEN** the runner is invoked with `--count 0` (or a non-integer)
- **THEN** it exits with a usage error and does not start any task loop

## ADDED Requirements

### Requirement: Batch selection is bounded by parent section
When the runner is invoked with `--count <n>`, it SHALL select up to `n` unchecked task IDs for the next `opencode run` prompt, but it MUST NOT include task IDs from a different parent section than the first selected task.

Parent section is defined as the integer segment before the first dot in the task id (e.g. parent of `2.2` is `2`).

#### Scenario: Batch stays within the same parent
- **WHEN** the next unchecked task is `2.2` and the following unchecked tasks include `2.3` and `3.1`
- **THEN** a run with `--count 3` includes `2.2` and `2.3` but does not include `3.1`

#### Scenario: Batch stops early at the boundary
- **WHEN** the next unchecked task is `2.2` and the next unchecked task from the same parent section does not exist
- **THEN** a run with `--count 10` includes only `2.2`

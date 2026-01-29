## Purpose
Define requirements for running multiple OpenSpec tasks per invocation and prompting for a per-run task limit.

## Requirements

### Requirement: Runner supports multi-task per invocation
The runner SHALL accept a `--count <n>` flag that controls how many tasks it processes in a single invocation.

#### Scenario: Default remains one task
- **WHEN** the runner is invoked without `--count`
- **THEN** it processes exactly one task (current behavior)

#### Scenario: Runs up to N tasks
- **WHEN** the runner is invoked with `--count 3`
- **THEN** it processes up to 3 unchecked tasks sequentially (or fewer if the change completes)

#### Scenario: Invalid count is rejected
- **WHEN** the runner is invoked with `--count 0` (or a non-integer)
- **THEN** it exits with a usage error and does not start any task loop

### Requirement: Apply action prompts for tasks-per-run
When the user initiates an Apply action, the extension SHALL prompt for how many tasks to run for that invocation.

#### Scenario: Default count is 1
- **WHEN** the user triggers Apply
- **THEN** the prompt defaults to `1`

#### Scenario: User selects a count
- **WHEN** the user enters `3` in the prompt and confirms
- **THEN** the extension invokes the runner with `--count 3`

#### Scenario: User cancels
- **WHEN** the user dismisses the prompt
- **THEN** the extension does not start the runner

#### Scenario: Invalid count is rejected
- **WHEN** the user enters `0` (or a non-integer)
- **THEN** the extension rejects the input and does not start the runner

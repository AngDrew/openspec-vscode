## Purpose
Define requirements for a cross-platform Ralph runner that drives OpenCode task execution.

## Requirements

### Requirement: Cross-platform Ralph runner availability
The project SHALL include a cross-platform runner that provides a 1:1 experience with `ralph_opencode.sh`.

#### Scenario: User can run from terminal
- **WHEN** the runner script exists in the workspace
- **THEN** the user can execute it from PowerShell, cmd.exe, or Bash using `node <script>`

### Requirement: Attach support
The runner SHALL accept `--attach <url>` and SHALL also support `OPENCODE_ATTACH_URL` environment variable.

#### Scenario: Attach flag used
- **WHEN** the runner is invoked with `--attach http://localhost:4099`
- **THEN** it passes `--attach http://localhost:4099` to `opencode run`

### Requirement: Task loop parity
The runner SHALL:

- derive a change name from `openspec list` by selecting the first listed change
- locate `openspec/changes/<change>/tasks.md`
- find the next unchecked task id matching `- [ ] <id>`
- send a prompt to `opencode run` that instructs working on exactly that task id
- verify the task was marked done (`- [x] <id>`) and stop with an error if not
- optionally include more than one task in each iteration prompt when a tasks-per-run count is configured

#### Scenario: Marks tasks done sequentially
- **WHEN** `tasks.md` contains unchecked tasks
- **THEN** the runner processes tasks one-by-one and verifies each is checked off before continuing

#### Scenario: Includes up to N tasks per iteration
- **WHEN** the runner is invoked with `--count 3`
- **THEN** each `opencode run` iteration includes up to 3 unchecked tasks in the prompt
- **AND** batching MUST be bounded to the parent section of the first task id in the batch (e.g. `2.2` can batch `2.3` but not `3.1`)
- **AND** the iteration MAY include fewer than `N` tasks when the next unchecked task is in a different parent section

#### Scenario: Default count is 1
- **WHEN** the runner is invoked without `--count`
- **THEN** it completes at most one task and exits

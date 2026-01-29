## MODIFIED Requirements

### Requirement: Task loop parity
The runner SHALL:

- derive a change name from `openspec list` by selecting the first listed change
- locate `openspec/changes/<change>/tasks.md`
- find the next unchecked task id matching `- [ ] <id>`
- send a prompt to `opencode run` that instructs working on exactly that task id
- verify the task was marked done (`- [x] <id>`) and stop with an error if not
- optionally process more than one task per invocation when a tasks-per-run limit is configured

#### Scenario: Marks tasks done sequentially
- **WHEN** `tasks.md` contains unchecked tasks
- **THEN** the runner processes tasks one-by-one and verifies each is checked off before continuing

#### Scenario: Stops after N tasks
- **WHEN** the runner is invoked with `--count 3`
- **THEN** it stops after completing 3 tasks even if more unchecked tasks remain

#### Scenario: Default count is 1
- **WHEN** the runner is invoked without `--count`
- **THEN** it completes at most one task and exits

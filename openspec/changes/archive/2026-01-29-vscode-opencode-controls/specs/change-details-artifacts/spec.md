## ADDED Requirements

### Requirement: Change details renders artifacts
The change-details view SHALL render the following artifacts when they exist in `openspec/changes/<change>/`:

- `proposal.md`
- `design.md`
- `tasks.md`
- each `specs/*/spec.md`

#### Scenario: Artifacts exist
- **WHEN** any of the supported artifact files exist for the selected change
- **THEN** the view shows sections for each existing artifact and allows opening the underlying files

### Requirement: Empty state call-to-action
The change-details view SHALL show an empty state with a button when a change exists but has no artifacts.

#### Scenario: No artifacts exist
- **WHEN** `proposal.md`, `design.md`, `tasks.md`, and `specs/*/spec.md` are all missing
- **THEN** the view shows a button that attaches to `http://localhost:4099`

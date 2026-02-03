## ADDED Requirements

### Requirement: Artifact renderer displays proposal content
The artifact renderer SHALL display proposal.md content within the chat interface as a collapsible section.

#### Scenario: Proposal displayed in chat
- **WHEN** a change has a proposal.md file
- **THEN** the system SHALL render the proposal content
- **AND** display it in a collapsible section
- **AND** support markdown formatting

### Requirement: Artifact renderer displays design content
The artifact renderer SHALL display design.md content within the chat interface.

#### Scenario: Design document displayed
- **WHEN** a change has a design.md file
- **THEN** the system SHALL render the design content
- **AND** code blocks SHALL have syntax highlighting

### Requirement: Artifact renderer displays tasks with progress
The artifact renderer SHALL display tasks.md with visual progress indicators.

#### Scenario: Tasks with checkboxes displayed
- **WHEN** tasks.md is rendered
- **THEN** completed tasks SHALL show checked boxes
- **AND** pending tasks SHALL show unchecked boxes
- **AND** task counts SHALL be summarized

### Requirement: Artifact renderer displays specs list
The artifact renderer SHALL display the list of specs for a change.

#### Scenario: Specs list displayed
- **WHEN** viewing a change with specs
- **THEN** the system SHALL list all spec files
- **AND** each spec SHALL be expandable to view content

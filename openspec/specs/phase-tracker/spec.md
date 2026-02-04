# phase-tracker Specification

## Purpose
TBD - created by archiving change transform-to-chat-ui. Update Purpose after archive.
## Requirements
### Requirement: Phase tracker displays current workflow phase
The phase tracker SHALL visually indicate which phase of the workflow the user is currently in.

#### Scenario: Current phase highlighted
- **WHEN** the user is in a specific phase
- **THEN** that phase SHALL be visually highlighted
- **AND** previous phases SHALL show as completed
- **AND** future phases SHALL show as pending

### Requirement: Phase tracker shows phase breakdown
The phase tracker SHALL display a breakdown of phases for the current workflow.

#### Scenario: Phase breakdown visible
- **WHEN** viewing the chat interface
- **THEN** the system SHALL display phases: New Change, Drafting, Implementation
- **AND** each phase SHALL show its completion status

### Requirement: Phase tracker supports phase navigation
The phase tracker SHALL allow users to view details of completed phases.

#### Scenario: View previous phase details
- **WHEN** the user clicks on a completed phase
- **THEN** the system SHALL show phase-specific artifacts and actions
- **AND** allow review of phase decisions


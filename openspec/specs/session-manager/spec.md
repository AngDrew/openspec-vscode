# session-manager Specification

## Purpose
TBD - created by archiving change transform-to-chat-ui. Update Purpose after archive.
## Requirements
### Requirement: Session manager persists conversation state
The session manager SHALL save and restore conversation sessions using VS Code's global storage.

#### Scenario: Conversation persists across reloads
- **WHEN** the user reloads VS Code
- **THEN** the system SHALL restore the previous conversation history
- **AND** the current phase SHALL be maintained

#### Scenario: Multiple conversation sessions
- **WHEN** the user creates a new change
- **THEN** the system SHALL create a new session for that change
- **AND** previous sessions SHALL remain accessible

### Requirement: Session manager tracks conversation phase
The session manager SHALL track which phase of the workflow the conversation is in (new change, drafting, implementation).

#### Scenario: Phase transitions automatically
- **WHEN** the conversation progresses from one phase to another
- **THEN** the session manager SHALL update the current phase
- **AND** the phase tracker UI SHALL reflect the change

### Requirement: Session context is maintained across commands
The session manager SHALL maintain conversation context when transitioning between different commands (new change to fast-forward, etc.).

#### Scenario: Fast-forward uses existing session
- **WHEN** the user invokes fast-forward after creating a change
- **THEN** the system SHALL use the same OpenCode session
- **AND** context SHALL not be reset

#### Scenario: Apply attaches to existing server
- **WHEN** the user invokes apply implementation
- **THEN** the system SHALL attach to the previously started OpenCode server
- **AND** the session SHALL continue with task execution


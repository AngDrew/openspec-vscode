## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Session manager stores ACP connection metadata
The session manager SHALL store ACP connection metadata needed for reconnection and diagnostics, including the last successful server port.

#### Scenario: Port is restored for reconnect attempts
- **WHEN** the extension restarts
- **THEN** the system SHALL attempt to reuse the last known server port before scanning for a new port

#### Scenario: Reconnect falls back to scanning
- **WHEN** reconnect to the last known port fails
- **THEN** the system SHALL fall back to scanning sequential ports starting at 4090

## MODIFIED Requirements

### Requirement: Chat panel displays message history
The chat interface SHALL display a scrollable message history showing all conversation messages between the user and OpenCode AI.

#### Scenario: User views chat history
- **WHEN** the user opens the chat panel
- **THEN** the system SHALL display all previous messages in chronological order
- **AND** user messages SHALL be visually distinct from AI messages
- **AND** the view SHALL auto-scroll to the most recent message

## ADDED Requirements

### Requirement: Chat panel displays ACP connection state
The chat interface SHALL display the ACP connection state as one of: disconnected, connecting, connected.

#### Scenario: Chat view opens while ACP is starting
- **WHEN** the user opens the chat panel and ACP startup/connection has begun
- **THEN** the system SHALL display the state as "connecting"

#### Scenario: ACP connection established
- **WHEN** ACP is connected
- **THEN** the system SHALL display the state as "connected"

#### Scenario: ACP connection unavailable
- **WHEN** ACP is not connected
- **THEN** the system SHALL display the state as "disconnected"

### Requirement: Chat panel surfaces actionable connection errors
The chat interface SHALL surface ACP connection/session errors in a user-visible banner with an action to retry.

#### Scenario: ACP startup fails
- **WHEN** ACP cannot be started or connected
- **THEN** the system SHALL display an error banner describing the failure
- **AND** the banner SHALL provide a retry action

#### Scenario: New chat session creation fails
- **WHEN** the user clicks "New Chat" and a new ACP session cannot be created
- **THEN** the system SHALL display an error banner describing the failure
- **AND** the system SHALL keep the current chat session intact

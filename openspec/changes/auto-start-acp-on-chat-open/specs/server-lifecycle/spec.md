## MODIFIED Requirements

### Requirement: Server auto-starts on extension activation
The server lifecycle manager SHALL automatically start an OpenCode server when the extension activates.

#### Scenario: Extension activates with workspace
- **WHEN** the extension activates
- **THEN** the system SHALL check for an existing OpenCode server
- **AND** if none is running, start a new server on an available port

#### Scenario: Server already running
- **WHEN** the extension activates and an OpenCode server is already running
- **THEN** the system SHALL connect to the existing server
- **AND** not start a duplicate instance

## ADDED Requirements

### Requirement: Server lifecycle respects chat auto-start configuration
The server lifecycle manager SHALL only auto-start/connect OpenCode when chat auto-start is enabled.

#### Scenario: Auto-start enabled
- **WHEN** chat auto-start is enabled
- **THEN** the system SHALL attempt to start/connect OpenCode on activation

#### Scenario: Auto-start disabled
- **WHEN** chat auto-start is disabled
- **THEN** the system SHALL NOT start/connect OpenCode until the user initiates a chat action that requires it

### Requirement: Chat-open triggers a startup fallback
Opening the chat view SHALL trigger an attempt to start/connect OpenCode when it is not already connected.

#### Scenario: Chat view opened while disconnected
- **WHEN** the user opens the chat panel and OpenCode is not connected
- **THEN** the system SHALL attempt to start/connect OpenCode

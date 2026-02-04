# server-lifecycle Specification

## Purpose
TBD - created by archiving change transform-to-chat-ui. Update Purpose after archive.
## Requirements
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

### Requirement: Server status is monitored
The server lifecycle manager SHALL continuously monitor the OpenCode server status.

#### Scenario: Server status displayed in UI
- **WHEN** the OpenCode server is running
- **THEN** the system SHALL display a status indicator (green dot)
- **AND** the status SHALL update in real-time

#### Scenario: Server crash detection
- **WHEN** the OpenCode server stops unexpectedly
- **THEN** the system SHALL detect the disconnection
- **AND** update the status indicator (red dot)
- **AND** attempt to restart the server

### Requirement: Server can be manually controlled
The server lifecycle manager SHALL provide controls to manually start, stop, or restart the OpenCode server.

#### Scenario: Manual server restart
- **WHEN** the user clicks the restart server button
- **THEN** the system SHALL gracefully stop the current server
- **AND** start a new server instance
- **AND** reconnect the ACP client


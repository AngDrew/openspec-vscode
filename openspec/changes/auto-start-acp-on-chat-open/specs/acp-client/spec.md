## MODIFIED Requirements

### Requirement: ACP client connects to OpenCode server
The ACP client SHALL establish and maintain a connection to the OpenCode server using JSON-RPC over HTTP.

#### Scenario: Successful connection to OpenCode
- **WHEN** the extension initializes and an OpenCode server is running
- **THEN** the ACP client SHALL connect to the server
- **AND** the connection status SHALL be reflected in the UI

#### Scenario: Connection retry on failure
- **WHEN** the ACP client fails to connect to OpenCode
- **THEN** the system SHALL retry the connection with exponential backoff
- **AND** after 5 failed attempts, the system SHALL prompt the user to start the server

## ADDED Requirements

### Requirement: ACP auto-starts on extension activation and chat open
When chat auto-start is enabled, the extension SHALL attempt to start/connect ACP on extension activation and again when the chat view is opened as a fallback.

#### Scenario: Activation triggers ACP startup
- **WHEN** the extension activates and chat auto-start is enabled
- **THEN** the system SHALL attempt to start/connect ACP
- **AND** the UI connection state SHALL transition to "connecting"

#### Scenario: Chat-open fallback triggers ACP startup
- **WHEN** the user opens the chat panel and ACP is not connected
- **THEN** the system SHALL attempt to start/connect ACP
- **AND** the UI connection state SHALL transition to "connecting"

### Requirement: ACP client reports connecting state and failures
The ACP client SHALL report a distinct "connecting" state and surface startup/connection failures to the chat UI.

#### Scenario: Startup begins
- **WHEN** the ACP client begins to connect
- **THEN** the connection state SHALL be "connecting"

#### Scenario: Startup fails
- **WHEN** the ACP client fails to start or connect
- **THEN** the connection state SHALL be "disconnected"
- **AND** an error message SHALL be surfaced to the chat UI

### Requirement: New chat creates a new ACP session deterministically
Creating a new chat SHALL create a new ACP session when ACP is available, or surface a user-visible error when it is not.

#### Scenario: New chat creates session
- **WHEN** the user clicks "New Chat" and ACP is connected
- **THEN** the system SHALL create a new ACP session

#### Scenario: New chat fails to create session
- **WHEN** the user clicks "New Chat" and a new ACP session cannot be created
- **THEN** the system SHALL surface a user-visible error
- **AND** the existing session SHALL remain active

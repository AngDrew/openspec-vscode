# acp-client Specification

## Purpose
TBD - created by archiving change transform-to-chat-ui. Update Purpose after archive.
## Requirements
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

### Requirement: ACP client sends user messages
The ACP client SHALL send user messages to OpenCode and handle the response.

#### Scenario: User message sent successfully
- **WHEN** the user submits a message
- **THEN** the ACP client SHALL send the message via JSON-RPC
- **AND** the response SHALL be streamed back to the chat UI

### Requirement: ACP client handles streaming responses
The ACP client SHALL support streaming responses from OpenCode for real-time chat updates.

#### Scenario: Receive streaming response
- **WHEN** OpenCode sends a streaming response
- **THEN** the ACP client SHALL process each chunk as it arrives
- **AND** update the chat UI incrementally
- **AND** display a typing indicator while streaming

### Requirement: ACP client handles tool calls
The ACP client SHALL parse and display tool calls (e.g., file reads, searches) from OpenCode responses.

#### Scenario: Tool call received
- **WHEN** OpenCode initiates a tool call
- **THEN** the ACP client SHALL parse the tool call details
- **AND** display it in an expandable tool calls panel
- **AND** show tool execution status


# tool-call-visualizer Specification

## Purpose
TBD - created by archiving change transform-to-chat-ui. Update Purpose after archive.
## Requirements
### Requirement: Tool calls panel displays execution details
The tool call visualizer SHALL display an expandable panel showing all tool calls made by OpenCode.

#### Scenario: Tool calls visible during conversation
- **WHEN** OpenCode executes a tool
- **THEN** the tool call SHALL appear in the tool calls panel
- **AND** the panel SHALL be collapsible

### Requirement: Tool calls show execution status
Each tool call SHALL display its execution status (running, completed, failed).

#### Scenario: Tool status updates in real-time
- **WHEN** a tool starts executing
- **THEN** the status SHALL show "running"
- **AND** when complete, the status SHALL update to "completed" with duration

### Requirement: Tool calls display parameters and results
Tool calls SHALL display the parameters passed and the results returned.

#### Scenario: View tool call details
- **WHEN** the user expands a tool call
- **THEN** the system SHALL show input parameters
- **AND** display the output/results
- **AND** format JSON responses for readability


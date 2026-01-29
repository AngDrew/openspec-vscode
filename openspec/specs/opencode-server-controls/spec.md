## Purpose
Define requirements for OpenCode server status controls in the VS Code change-details view.

## Requirements

### Requirement: OpenCode server dot control
The change-details view SHALL show a dot control that reflects whether an OpenCode server is listening on `localhost:4099`.

#### Scenario: Server not started
- **WHEN** no process is listening on `localhost:4099`
- **THEN** the dot is red and the hover tooltip indicates "OpenCode not started"

#### Scenario: Server started
- **WHEN** a process is listening on `localhost:4099`
- **THEN** the dot is green and the hover tooltip indicates "OpenCode started"

### Requirement: Start OpenCode server
Clicking the red dot SHALL start an OpenCode server by running `opencode serve --port 4099` in a VS Code terminal.

#### Scenario: Start from not-started state
- **WHEN** the dot is red and the user clicks it
- **THEN** the extension launches a VS Code terminal and sends `opencode serve --port 4099`

#### Scenario: Port already in use
- **WHEN** a process is already listening on `localhost:4099`
- **THEN** the dot remains green and clicking the dot does not start a second server

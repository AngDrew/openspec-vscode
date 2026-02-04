# port-manager Specification

## Purpose
TBD - created by archiving change transform-to-chat-ui. Update Purpose after archive.
## Requirements
### Requirement: Port manager finds available port in 4xxx range
The port manager SHALL dynamically find an available port in the 4000-4999 range.

#### Scenario: Find unused port
- **WHEN** the system needs to start an OpenCode server
- **THEN** the port manager SHALL scan ports 4000-4999
- **AND** select the first available port
- **AND** verify the port is not in use

#### Scenario: Port preference starting from 4000
- **WHEN** scanning for available ports
- **THEN** the system SHALL start from port 4000
- **AND** increment sequentially until an available port is found

### Requirement: Port manager validates port availability
The port manager SHALL verify that a selected port is truly available before assigning it.

#### Scenario: Port validation before use
- **WHEN** a port is selected
- **THEN** the system SHALL attempt to bind to the port
- **AND** if binding fails, try the next port

#### Scenario: Port conflict resolution
- **WHEN** the preferred port is in use
- **THEN** the system SHALL automatically try the next available port
- **AND** log the port selection for debugging

### Requirement: Port is persisted for session
The port manager SHALL remember which port the OpenCode server is using for the current session.

#### Scenario: Port remembered across reconnections
- **WHEN** the ACP client needs to reconnect
- **THEN** the system SHALL use the same port
- **AND** the port SHALL be stored in extension state


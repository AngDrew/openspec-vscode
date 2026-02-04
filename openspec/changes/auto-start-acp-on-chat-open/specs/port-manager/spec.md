## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Port manager prefers port 4090 and increments sequentially
The port manager SHALL prefer port 4090 for OpenCode server startup, and if it is occupied SHALL try 4091, then 4092, continuing sequentially until a free port is found.

#### Scenario: Preferred port available
- **WHEN** the system needs to start an OpenCode server and port 4090 is available
- **THEN** the system SHALL start the server on port 4090

#### Scenario: Preferred port occupied
- **WHEN** the system needs to start an OpenCode server and port 4090 is in use
- **THEN** the system SHALL try port 4091
- **AND** continue incrementing ports until an available port is found

#### Scenario: Multiple workspaces run concurrently
- **WHEN** multiple VS Code workspaces start OpenCode servers on the same machine
- **THEN** each workspace SHALL select a distinct port using sequential fallback

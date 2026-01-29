## ADDED Requirements

### Requirement: CLI can display pokemon summary
The system SHALL provide a CLI command that prints a human-readable summary of a Pokemon.

#### Scenario: Basic output
- **WHEN** the user requests pokemon "bulbasaur"
- **THEN** the CLI prints at least: name, id, types, and one or more abilities

### Requirement: CLI supports name or id input
The system MUST accept either a Pokemon name or numeric id as input.

#### Scenario: Name input
- **WHEN** the user provides a non-numeric argument
- **THEN** the system treats the argument as a name

#### Scenario: Id input
- **WHEN** the user provides a numeric argument
- **THEN** the system treats the argument as an id

### Requirement: Exit codes reflect success/failure
The system MUST exit with status code 0 on success and non-zero on failure.

#### Scenario: Command succeeds
- **WHEN** the command completes without error
- **THEN** the process exits with status code 0

#### Scenario: Command fails
- **WHEN** a fatal error occurs (e.g., network failure or pokemon not found)
- **THEN** the process exits with a non-zero status code

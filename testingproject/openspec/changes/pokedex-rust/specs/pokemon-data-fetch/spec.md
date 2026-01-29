## ADDED Requirements

### Requirement: Fetch pokemon by name or id
The system SHALL fetch Pokemon details from a public HTTP API when given a Pokemon name or numeric id.

#### Scenario: Fetch by name
- **WHEN** the user requests pokemon "pikachu"
- **THEN** the system fetches the Pokemon resource for "pikachu" and returns parsed data

#### Scenario: Fetch by id
- **WHEN** the user requests pokemon id "25"
- **THEN** the system fetches the Pokemon resource for id "25" and returns parsed data

### Requirement: Handle non-existent pokemon
The system MUST surface a user-friendly error when the requested Pokemon does not exist.

#### Scenario: Unknown pokemon
- **WHEN** the API returns a 404 for the requested pokemon
- **THEN** the system reports "Pokemon not found" (or equivalent) and exits with a non-zero status

### Requirement: Tolerate API response changes
The system SHOULD deserialize only the fields it needs and ignore unknown fields in API responses.

#### Scenario: Unknown fields present
- **WHEN** the API response includes additional fields not represented in local models
- **THEN** deserialization succeeds and required fields are still available

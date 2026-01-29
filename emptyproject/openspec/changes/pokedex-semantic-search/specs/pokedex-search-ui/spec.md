## ADDED Requirements

### Requirement: Search entry point
The system SHALL provide a user-facing entry point for semantic search that allows entering a natural-language query string.

#### Scenario: Opening search
- **WHEN** the user invokes the search entry point
- **THEN** the system prompts for a query string

### Requirement: Results presentation
The system SHALL present a ranked list of results showing, at minimum, the Pokemon name and dex number.

#### Scenario: Viewing results
- **WHEN** a query completes successfully
- **THEN** the user sees a ranked list of results with name and dex number

### Requirement: Result selection
The system SHALL allow selecting a result to view additional details (at minimum: types and a short description).

#### Scenario: Selecting a result
- **WHEN** the user selects a result
- **THEN** the system shows details for the selected Pokemon

### Requirement: Index build feedback
If an index build is required, the UI flow MUST communicate that indexing is in progress and MUST surface failure information if the build fails.

#### Scenario: Indexing progress is shown
- **WHEN** the user triggers search and the index is not ready
- **THEN** the user is informed that indexing is running and sees an error if indexing fails

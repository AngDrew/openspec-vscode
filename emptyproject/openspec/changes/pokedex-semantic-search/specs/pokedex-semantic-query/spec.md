## ADDED Requirements

### Requirement: Semantic query API
The system SHALL provide a query operation that accepts a natural-language query string and returns a ranked list of matching Pokemon documents.

#### Scenario: Basic query
- **WHEN** the user submits a query string
- **THEN** the system returns results ordered from most relevant to least relevant

### Requirement: Similarity score
Each returned result SHALL include a `score` representing similarity between the query embedding and the document embedding.

#### Scenario: Scores are present
- **WHEN** the system returns query results
- **THEN** every result includes a numeric `score`

### Requirement: Result limit
The query operation SHALL support a caller-provided maximum number of results (`topK`) and MUST default to a non-zero value when not provided.

#### Scenario: Limiting results
- **WHEN** the caller requests `topK = 5`
- **THEN** the system returns at most 5 results

### Requirement: Filter constraints
The query operation SHALL support optional filters over document metadata (at minimum: type) and MUST apply the filters before ranking is returned to the caller.

#### Scenario: Filtering by type
- **WHEN** the caller queries with a type filter (e.g., `electric`)
- **THEN** the system returns only Pokemon whose document type metadata matches the filter

### Requirement: Index readiness behavior
If the semantic index is not available or is invalid, the query flow MUST trigger an index build and MUST NOT return semantic results from a stale or mismatched index.

#### Scenario: Query triggers build
- **WHEN** a query is executed and no valid index exists
- **THEN** the system initiates an index build before returning semantic query results

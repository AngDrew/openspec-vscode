## ADDED Requirements

### Requirement: Persistent local index
The system SHALL persist the embeddings index and its metadata to local storage so that searches after the first build do not require regenerating embeddings.

#### Scenario: Reusing an existing index
- **WHEN** the system starts and a valid stored index exists
- **THEN** the system loads the index and can serve queries without rebuilding

### Requirement: Index manifest
The system SHALL store an index manifest containing at least:
- `documentSchemaVersion`
- `embeddingProviderId`
- `embeddingConfigHash`
- `documentCount`

#### Scenario: Manifest is written
- **WHEN** an index build completes successfully
- **THEN** the system writes a manifest that records schema and embedding configuration identifiers

### Requirement: Safe rebuild on mismatch
The system MUST rebuild the index when any of the following differ between the current configuration and the stored manifest:
- `documentSchemaVersion`
- `embeddingProviderId`
- `embeddingConfigHash`

#### Scenario: Provider configuration changes
- **WHEN** the embedding provider configuration changes
- **THEN** the system rebuilds the index before serving semantic search results

### Requirement: Atomic index writes
The system SHALL write index files using an atomic strategy to prevent partially-written indexes from being treated as valid.

#### Scenario: Interrupted build
- **WHEN** an index build is interrupted before completion
- **THEN** the system does not load a partially-written index as valid

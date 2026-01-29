## ADDED Requirements

### Requirement: Canonical Pokemon document
The system SHALL represent each Pokemon as a canonical document with:
- A stable `id` (string) that uniquely identifies the Pokemon across rebuilds.
- Display fields (e.g., name, dex number) used for UI.
- Filter fields (e.g., types, generation) used for query constraints.
- A single `content` string that is used as the embedding input.

#### Scenario: Building a document
- **WHEN** the system constructs a document for a Pokemon
- **THEN** it produces exactly one document containing `id`, display/filter fields, and `content`

### Requirement: Stable document ID
The system SHALL generate `id` values deterministically from source data such that the same Pokemon yields the same `id` across runs.

#### Scenario: Deterministic IDs
- **WHEN** documents are generated from the same Pokemon dataset twice
- **THEN** each Pokemon has the same `id` in both generations

### Requirement: Embedding content construction
The system SHALL construct `content` by combining the Pokemon's name and relevant descriptive fields (e.g., types, abilities, flavor text) into a single human-readable text block.

#### Scenario: Content includes descriptive fields
- **WHEN** a Pokemon document is created
- **THEN** `content` includes the Pokemon name and at least one descriptive attribute beyond the name

### Requirement: Document schema version
The system SHALL define a `documentSchemaVersion` used to detect when stored indexes must be rebuilt due to document format changes.

#### Scenario: Schema version changes
- **WHEN** `documentSchemaVersion` changes between releases
- **THEN** any existing stored index is treated as invalid and requires a rebuild

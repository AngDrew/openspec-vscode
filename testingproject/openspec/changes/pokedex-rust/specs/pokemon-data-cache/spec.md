## ADDED Requirements

### Requirement: Cache successful pokemon fetches on disk
The system SHALL cache successful Pokemon fetch responses on disk to reduce repeat network requests.

#### Scenario: Cache hit
- **WHEN** the user requests a pokemon that is present in cache and not expired
- **THEN** the system returns cached data without performing an HTTP request

#### Scenario: Cache miss
- **WHEN** the user requests a pokemon that is not present in cache
- **THEN** the system performs an HTTP request and stores the successful response in cache

### Requirement: Cache expiry via TTL
The system MUST treat cached entries older than a TTL as expired.

#### Scenario: Entry expired
- **WHEN** a cached entry is older than the configured TTL
- **THEN** the system re-fetches from the API and overwrites the cached entry

### Requirement: Cache clear
The system SHALL provide a way to clear cached entries.

#### Scenario: Clear cache command
- **WHEN** the user runs a cache clear operation
- **THEN** the system deletes cached entries and reports success

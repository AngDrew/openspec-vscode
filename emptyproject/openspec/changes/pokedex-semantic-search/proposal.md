## Why

Pokedex search is currently limited to exact matches (name/number/type), which makes it hard to find the right Pokemon when the user only knows characteristics (e.g., "electric mouse", "fire lizard", "blue water starter"). Adding semantic search lets users search with natural language and still get relevant results.

## What Changes

- Add a semantic search feature that ranks Pokemon results using embeddings rather than exact string matches.
- Add an indexing pipeline that converts each Pokemon into a search document and builds/updates a local vector index.
- Add a query API that accepts natural-language input and returns ranked matches with basic metadata and scores.
- Add UI/command surface for searching and viewing results.

## Capabilities

### New Capabilities
- `pokedex-data-documents`: Define how Pokemon data is normalized into searchable documents (fields, text sources, stable IDs).
- `pokedex-embeddings-index`: Build, persist, and update a local embeddings index for Pokemon documents.
- `pokedex-semantic-query`: Execute semantic queries against the index and return ranked results (with scores and basic filters).
- `pokedex-search-ui`: Provide a user-facing search flow (command/UI) for entering queries and viewing results.

### Modified Capabilities

<!-- None. -->

## Impact

- New dependencies for embeddings and vector similarity (or a provider abstraction if using a remote embedding API).
- New on-disk storage for the index and document metadata (cache location).
- Changes to search-related UI/commands and any existing Pokedex data loading pipeline.

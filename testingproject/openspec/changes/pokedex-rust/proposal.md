## Why

Build a small but complete Pokedex app as a structured way to learn Rust fundamentals (I/O, HTTP, JSON, error handling, testing) by shipping something tangible.

## What Changes

- Add a Rust CLI app that can search and display Pokemon data.
- Support fetching Pokemon details from a public PokeAPI and caching responses locally for repeat runs.
- Provide a minimal interactive flow (search by name/id, list basic info, view moves/types/abilities).
- Add basic tests and documentation so the project is a good learning reference.

## Capabilities

### New Capabilities
- `pokemon-data-fetch`: Fetch Pokemon data from a public HTTP API and parse JSON into Rust types.
- `pokemon-data-cache`: Cache fetched Pokemon responses on disk with a simple invalidation strategy.
- `pokedex-cli-ui`: Provide CLI commands and/or prompts to search and display Pokemon info.

### Modified Capabilities

<!-- None (no existing OpenSpec capabilities in this repo) -->

## Impact

- New Rust workspace/app added to the repo (likely under `examples/` or a dedicated folder).
- New dependencies in Rust (`reqwest`, `serde`, `tokio`, etc.).
- No breaking changes expected to existing code.

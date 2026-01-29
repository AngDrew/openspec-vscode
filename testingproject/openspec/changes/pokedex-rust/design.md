## Context

This change adds a small Pokedex app intended for learning Rust by building a real (but scoped) client that does HTTP requests, parses JSON, handles errors, and has tests.

The app will use a public Pokemon API (PokeAPI) as its backend source of truth. To keep the learning loop fast and avoid rate limits, the client will cache API responses on disk.

Constraints:
- Keep the project simple and readable (prefer explicit code over heavy abstractions).
- Cross-platform support (Windows/macOS/Linux).
- Avoid committing generated artifacts (cache, build output).

## Goals / Non-Goals

**Goals:**
- Provide a Rust CLI that can fetch Pokemon by name or id and print a friendly summary.
- Structure the code into small modules (api client, models, cache, CLI) to demonstrate good Rust project layout.
- Use async I/O for HTTP requests and file operations.
- Cache successful API responses to disk with a simple TTL.
- Include a small test suite (unit tests for parsing, cache behavior; minimal integration tests behind a feature flag if needed).

**Non-Goals:**
- No GUI/web frontend.
- No full offline Pokedex dataset.
- No authentication, accounts, or persistence beyond local cache.
- No attempt to mirror the full PokeAPI surface area.

## Decisions

- Use a single binary crate (Cargo) for the CLI, with internal modules:
  - `cli`: argument parsing / command routing
  - `api`: HTTP client wrapper and endpoints
  - `models`: serde structs for API responses
  - `cache`: disk cache read/write + TTL
  - `format`: output rendering

- Use async runtime and HTTP stack:
  - `tokio` for async runtime
  - `reqwest` for HTTP
  - `serde` / `serde_json` for deserialization
  Rationale: common, well-documented crates; good learning value.

- Cache strategy:
  - Cache per endpoint key (e.g., `pokemon/<name-or-id>.json`)
  - Store metadata (fetched_at) alongside payload (either in a wrapper JSON or via filesystem mtime)
  - TTL default: 24h (configurable via CLI flag)
  Rationale: keeps logic understandable; avoids over-engineering.

- Error handling:
  - Use a single error type (e.g., `thiserror`) to unify HTTP, IO, and JSON errors
  - Print user-friendly errors; keep debug details behind `--verbose`
  Rationale: teaches idiomatic error propagation while keeping CLI UX decent.

- CLI interface:
  - Subcommands like:
    - `pokedex pokemon <name-or-id>`
    - `pokedex search <prefix>` (optional stretch)
    - `pokedex cache clear`
  - Use `clap` for argument parsing
  Rationale: stable, widely used, good learning material.

## Risks / Trade-offs

- [PokeAPI downtime/rate limits] -> Mitigation: disk cache + clear message on network failure.
- [API schema drift] -> Mitigation: keep models minimal (only fields used) and tolerate unknown fields.
- [Async complexity for beginners] -> Mitigation: keep async usage localized to api/cache boundaries and avoid complex concurrency.
- [Windows path quirks] -> Mitigation: use `dirs`/`directories` crate for cache dir and `std::path` throughout.

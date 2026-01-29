## 1. Project Setup

- [x] 1.1 Choose project location/name in repo and create a new Rust binary crate (Cargo)
- [x] 1.2 Add baseline dependencies (`tokio`, `reqwest`, `serde`, `serde_json`, `clap`, `thiserror`, cache-dir helper)
- [ ] 1.3 Add a minimal README with how to run the CLI and examples

## 2. Models (JSON)

- [ ] 2.1 Define minimal Rust models for the Pokemon endpoint (id, name, types, abilities)
- [ ] 2.2 Add unit tests for JSON deserialization using a small fixture payload

## 3. HTTP Client

- [ ] 3.1 Implement API client function to fetch pokemon by name or id
- [ ] 3.2 Implement not-found handling (404 -> user-friendly error)
- [ ] 3.3 Implement network/parse error propagation with a unified error type

## 4. Disk Cache

- [ ] 4.1 Implement cache key/path mapping for pokemon requests
- [ ] 4.2 Implement cache read/write for successful responses
- [ ] 4.3 Implement TTL expiry logic and overwrite behavior
- [ ] 4.4 Implement a cache clear operation
- [ ] 4.5 Add unit tests for cache hit/miss/expiry behavior

## 5. CLI Commands and Output

- [ ] 5.1 Implement `pokemon <name-or-id>` command and wire it to fetch+cache
- [ ] 5.2 Print a readable summary (name, id, types, abilities) and ensure exit code 0 on success
- [ ] 5.3 Ensure failures exit non-zero with friendly messages (not found, network)
- [ ] 5.4 Implement `cache clear` command

## 6. Polish

- [ ] 6.1 Add `--ttl` (or config) flag to override cache TTL
- [ ] 6.2 Add `--verbose` flag for debug output
- [ ] 6.3 Add a lightweight end-to-end test strategy (optional feature-flagged integration tests)

## 1. Document Schema

- [ ] 1.1 Define `PokemonDocument` shape (id, display fields, filter fields, content)
- [ ] 1.2 Implement deterministic `id` generation and add basic unit coverage
- [ ] 1.3 Implement `content` construction from Pokemon fields (name + descriptive attributes)
- [ ] 1.4 Add `documentSchemaVersion` constant and wire it into indexing manifest

## 2. Embedding Provider Layer

- [ ] 2.1 Define `EmbeddingProvider` interface (provider id + config hash + embed method)
- [ ] 2.2 Implement a default embedding provider (local or OpenAI-compatible) behind the interface
- [ ] 2.3 Add error handling for provider failures and missing configuration

## 3. Index Persistence

- [ ] 3.1 Define on-disk storage layout for (documents metadata, vectors, manifest)
- [ ] 3.2 Implement atomic write strategy (temp write + rename) for index artifacts
- [ ] 3.3 Implement manifest load/validate logic (schema/provider/config mismatch triggers rebuild)
- [ ] 3.4 Implement index build pipeline (generate docs -> embed -> store -> write manifest)

## 4. Query Engine

- [ ] 4.1 Implement query flow: embed query -> vector search -> return ranked results with scores
- [ ] 4.2 Add support for `topK` with a non-zero default
- [ ] 4.3 Add filter constraints (at minimum: type) and ensure filters apply for returned results
- [ ] 4.4 Ensure query triggers build when no valid index exists; never serve stale/mismatched index

## 5. UI / Command Surface

- [ ] 5.1 Add a user-facing search entry point to capture a natural-language query string
- [ ] 5.2 Display ranked results (name + dex number) and allow selecting a result
- [ ] 5.3 Show selected result details (types + short description)
- [ ] 5.4 Surface indexing progress and clear failure messaging in the search flow

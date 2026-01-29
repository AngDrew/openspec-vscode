## Context

Pokedex search currently relies on exact or near-exact matches (name/number/type). Users frequently search by describing a Pokemon ("electric mouse", "fire starter lizard"), which is not well served by keyword matching.

This change introduces a local semantic search pipeline:
- Normalize Pokemon data into stable, versioned documents.
- Generate embeddings for those documents.
- Persist a vector index on disk.
- Query the index from a user-facing search surface.

Constraints and assumptions:
- Runs locally (no server required by default) and works offline after the index is built.
- Index storage must be deterministic and versioned to support schema/model changes.
- Embeddings generation may be provided by a remote API or a local model; the implementation should allow swapping providers.

## Goals / Non-Goals

**Goals:**
- Support natural-language search over Pokemon characteristics with ranked results.
- Provide a clear, stable document schema so embeddings are repeatable.
- Persist the index and metadata so subsequent searches are fast.
- Support incremental rebuilds and safe invalidation when inputs change.
- Provide a usable search UI flow (query -> ranked list -> select result).

**Non-Goals:**
- Perfect accuracy or "human-like" reasoning; the goal is better recall than exact matching.
- Multi-lingual search.
- A hosted/shared index; this design focuses on local storage.
- Training models; we only consume embedding models.

## Decisions

- Document schema and versioning
  - Decision: Define a canonical `PokemonDocument` with a stable `id` and an embedding `content` string derived from structured fields.
  - Rationale: Separating structured metadata (filters/display) from `content` (embedding input) enables consistent indexing and future field additions without breaking callers.
  - Alternative: Embed the raw JSON blob. Rejected because it is noisy, unstable across formatting changes, and harder to test.

- Embedding provider abstraction
  - Decision: Implement an `EmbeddingProvider` interface with a small surface area (e.g., `embed(texts: string[]): Promise<number[][]>` and provider `id`/`configHash`).
  - Rationale: Keeps indexing/query logic independent from the embedding backend; supports swapping between remote (OpenAI-compatible) and local providers.
  - Alternative: Hardcode a single provider. Rejected because it couples the feature to one vendor and complicates testing.

- Local index storage and invalidation
  - Decision: Persist (1) document metadata, (2) embedding vectors, and (3) an index manifest containing `documentSchemaVersion` and `embeddingConfigHash`.
  - Rationale: Enables fast startup and safe rebuilds when the schema/model changes.
  - Alternative: Recompute on every activation. Rejected due to latency and repeated cost.

- Index build strategy
  - Decision: Build the index on-demand (first search) and support manual rebuild. For large rebuilds, show progress and allow cancellation.
  - Rationale: Avoids doing heavy work for users who never use the feature; still provides a predictable user-triggered flow.
  - Alternative: Build on activation. Rejected as it can degrade startup performance.

- Query behavior
  - Decision: Semantic queries return ranked results with similarity scores and allow optional filters (e.g., type, generation). If the index is not ready, the query flow triggers a build.
  - Rationale: Keeps UX simple (one entry point) while ensuring results are meaningful.
  - Alternative: Return empty results until indexing completes. Rejected due to confusing UX.

## Risks / Trade-offs

- [Index build latency] -> Mitigation: On-demand build, progress UI, caching, incremental rebuild support.
- [Embedding provider availability/cost] -> Mitigation: Provider abstraction, clear configuration, and an explicit error when provider is unavailable.
- [Index corruption or version drift] -> Mitigation: Versioned manifest + atomic write strategy (write temp then rename), rebuild on mismatch.
- [Relevance quality varies by model/data] -> Mitigation: Tune `content` construction, allow future improvements without changing external API.

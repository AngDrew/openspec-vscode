## Context

Today the OpenSpec Chat webview frequently shows ACP as "Disconnected" on open because we only attempt to connect lazily (first prompt / retry / new chat). The UI hardcodes "Disconnected" initially and there is no proactive startup on view open.

The extension launches OpenCode ACP by spawning `opencode acp` and communicates with it via JSON-RPC over stdio. The `opencode acp` process in turn starts an OpenCode HTTP server (used internally by OpenCode) and the CLI flag `--port` controls that HTTP server port.

We want a predictable, multi-project friendly startup behavior:

- On activation: attempt to start/connect ACP when a workspace is present.
- On chat view open: attempt to start/connect ACP if still disconnected.
- Prefer port 4090 for the OpenCode HTTP server backing ACP, then 4091, 4092, ...

## Goals / Non-Goals

**Goals:**

- Chat view shows a distinct "connecting" state while ACP is starting.
- If auto-start is enabled, ACP startup happens on activation and is retried on chat open.
- Port selection is deterministic: 4090, 4091, 4092, ... to support multiple concurrently open projects.
- "New Chat" reliably creates a new ACP session or shows a clear error.
- Connection/session failures are surfaced in the chat UI (banner + retry).

**Non-Goals:**

- Implement ACP over TCP. (Transport remains stdio; `--port` only controls the internal OpenCode HTTP server.)
- Add new OpenSpec workflow schemas.
- Implement full server controls UI (start/stop/restart) beyond what is required for reliable auto-start and error surfacing.

## Decisions

1) Connection lifecycle triggers

- Decision: start/connect ACP in two places:
  - Activation path (when a workspace exists)
  - Chat view resolve/visibility path as a fallback
- Rationale: activation covers "ready when user opens chat"; chat-open fallback handles cases where activation skipped or failed.
- Alternatives:
  - Only on chat-open (simpler, but keeps initial Disconnected state and adds latency)
  - Only on activation (may miss cases where activation runs without workspace / server starts too early)

2) Connection state machine (including "connecting")

- Decision: add an explicit connection state enum: disconnected | connecting | connected.
- Rationale: UI should not show "Disconnected" while we are actively starting ACP.
- Alternatives:
  - Boolean connected/disconnected (current) (cannot represent in-progress startup)

3) Port selection strategy

- Decision: choose port sequentially starting at 4090 for spawning `opencode acp`.
  - If port is occupied, retry with 4091, then 4092, etc.
- Rationale: deterministic and supports multiple projects; avoids random port selection that makes debugging and reconnect hard.
- Alternatives:
  - `--port 0` (OpenCode chooses port; simpler but not deterministic and can collide with other behaviors)
  - Random 40xx (less predictable)

4) "New Chat" error handling

- Decision: do not swallow session creation errors; show a connection/session banner and keep the current session.
- Rationale: prevents silent failures and makes it obvious what the user should do.
- Alternatives:
  - Best-effort ignore (current; confusing)

5) Configuration source

- Decision: continue using existing config discovery:
  - Prefer OpenCode config file at `~/.config/opencode/opencode.json(c)` (and Windows equivalent)
  - Allow inline config via `OPENCODE_CONFIG_CONTENT`
- Rationale: aligns with OpenCode behavior and supports portable setup.

## Risks / Trade-offs

- [Risk] Starting ACP on activation could increase startup cost. -> Mitigation: gate behind `openspec.chat.autoStartServer` and avoid expensive work when disabled.
- [Risk] Port scanning could race with other processes starting simultaneously. -> Mitigation: treat spawn failure as signal to try next port; optionally probe port first but do not rely solely on probe.
- [Risk] OpenCode CLI errors could be noisy. -> Mitigation: capture stderr into OutputChannel and surface a concise banner in the webview.

## Migration Plan

- No user data migration.
- Deploy as a standard extension update.
- If users prefer manual startup, they can disable `openspec.chat.autoStartServer`.

## Open Questions

- Should activation auto-start require a workspace folder, or any window? (Default: require a workspace folder.)
- Do we persist the last selected port per workspace to improve reconnect speed? (Default: store last successful port in global/workspace state.)

## Why

Opening the OpenSpec Chat view frequently shows ACP as "Disconnected" because the extension does not attempt to start/connect ACP when the view is opened (or at startup). This causes confusing UX and makes the chat feel unreliable.

## What Changes

- Auto-start and connect OpenCode ACP on extension activation (when a workspace is available) and on chat view open as a fallback.
- Add an explicit ACP connection state machine with a distinct "connecting" state, and surface connection errors in the chat UI when startup or session creation fails.
- Use a deterministic port strategy for the OpenCode server that backs ACP: prefer port 4090, then 4091, 4092, ... so multiple projects can run concurrently.
- Make the "New Chat" action deterministic by ensuring a new ACP session is created (or a clear error is shown).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `chat-interface`: Connection state SHOULD reflect connecting/connected/disconnected and show actionable errors when ACP cannot be started/connected.
- `acp-client`: Connect/start behavior changes to proactively connect on activation + chat-open; session creation errors must be surfaced.
- `port-manager`: Port selection strategy changes to prefer 4090 and increment sequentially when occupied.
- `server-lifecycle`: Startup behavior changes to start/connect in activation and monitor connection status.

## Impact

- Affected code: `src/providers/chatViewProvider.ts`, `src/services/acpClient.ts`, `src/services/acpTransport.ts`, `src/services/sessionManager.ts`, activation code under `src/extension/`.
- UX impact: Chat should typically show "Connecting" briefly, then "Connected", without requiring the first message to trigger startup.
- Compatibility: Requires `opencode` CLI to be available and OpenCode config to be discoverable via `~/.config/opencode/opencode.json(c)` or `OPENCODE_CONFIG_CONTENT`.

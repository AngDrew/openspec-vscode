## 1. Wiring And State

- [ ] 1.1 Read `openspec.chat.autoStartServer` setting and plumb it into activation and chat view lifecycle
- [ ] 1.2 Add ACP connection state enum (disconnected/connecting/connected) and expose it to the chat webview
- [ ] 1.3 Update chat webview rendering to display "Connecting" while ACP startup is in progress

## 2. Auto-Start Behavior

- [ ] 2.1 On extension activation (with workspace), if auto-start enabled, attempt to start/connect ACP
- [ ] 2.2 On chat view resolve/visibility, if auto-start enabled and ACP is disconnected, attempt to start/connect ACP (fallback)
- [ ] 2.3 Capture `opencode acp` stderr and surface a concise error banner in the chat UI when startup fails

## 3. Port Strategy

- [ ] 3.1 Implement deterministic port selection for `opencode acp`: try 4090, then 4091, 4092, ... until success
- [ ] 3.2 Persist last successful port and attempt it first on subsequent reconnects
- [ ] 3.3 Ensure port selection supports multiple concurrent workspaces without collisions

## 4. New Chat Reliability

- [ ] 4.1 Make "New Chat" always create a new ACP session when connected
- [ ] 4.2 If session creation fails, show an error banner and keep the current session intact (no silent failures)

## 5. Verification

- [ ] 5.1 Manual verification: open chat view -> connection transitions to connecting then connected without sending a message
- [ ] 5.2 Manual verification: start a second workspace -> it selects the next port (4091/4092...) and connects
- [ ] 5.3 Manual verification: simulate missing `opencode` CLI -> chat shows actionable error banner with retry

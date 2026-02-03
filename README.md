# OpenSpecCodeExplorer

[![Version](https://img.shields.io/github/package-json/v/AngDrew/openspec-vscode?label=version)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/vscode-%5E1.74.0-007ACC.svg)](https://code.visualstudio.com/)

![OpenSpec icon](media/openspec-icon.png)

Spec-driven development inside VS Code, powered by OpenSpec + OpenCode.

- **NEW: Chat UI** - Have natural conversations with OpenCode AI to create changes, draft artifacts, and implement code
- Browse `openspec/changes/*` and `openspec/specs/*` from the Activity Bar
- Read `proposal.md`, `design.md`, and `tasks.md` in a focused details webview
- Fast-forward scaffold-only changes into full artifacts
- Apply tasks via the Ralph loop (batching supported with `--count`, bounded to the same parent task section)
- Monitor runs live at `http://localhost:4099`

Note: this extension is built for OpenCode. Other agentic CLIs/runners (Claude Code, Codex CLI, Gemini CLI, etc.) are not supported.

## The Loop

This extension is built around a very specific workflow:

1. Plan mode: use OpenCode to discuss the request until you are satisfied with what you want.
   - **Chat UI**: Open the chat panel to have a natural conversation with OpenCode AI
2. Build mode: ask OpenCode to write the spec change artifacts.
3. Fast-forward: close OpenCode, then click the Fast-Forward icon on the newly created scaffold-only change.
   - This continues the previous OpenCode session and generates all artifacts while keeping the context window efficient.
   - **Chat UI**: Use the Fast-Forward action button
4. Apply change (Ralph loop): start applying tasks from the extension.
   - Optionally set a task count per invocation (`--count`) to save time.
   - **Chat UI**: Use the Apply action button
5. Watch the magic: the loop works on up to `--count` tasks per run.
   - Each loop spawns a fresh OpenCode run (fresh context per batch), which helps reduce drift and hallucinations.
6. Monitor in real time: open `http://localhost:4099` to watch progress.
   - The extension tries to spawn/attach OpenCode on `localhost:4099` before running automation.

Graceful behavior:

- If you set `--count 50` but only 10 tasks exist, it stops gracefully when tasks are done.
- If you stop the loop mid-way from the OpenCode web UI, it breaks the loop safely.

## What you get

The extension to automate OpenSpec with:

- **Chat UI Panel**: Full-featured chat interface for natural conversations with OpenCode AI
  - Message history with markdown rendering and syntax highlighting
  - Real-time streaming responses with typing indicators
  - Action buttons for workflow commands (New Change, Fast-Forward, Apply, Archive)
- Connection status indicator for server state
  - Phase tracker showing current workflow progress
- OpenSpec Explorer tree: active changes, archived changes, and workspace specs
- Change details webview: renders artifacts and previews other files in a change folder
- Opencode CLI-first actions: start OpenCode server, fast-forward artifacts, apply tasks, archive changes, draft requirements interactively

![alt text](spec-creation.png)
![alt text](explorer.png)

The extension is intentionally not a GUI wizard. It keeps OpenSpec as the source of truth and drives automation through terminals.

## Prerequisites

- VS Code `^1.74.0`
- An OpenSpec-initialized workspace (or you can run `openspec init`)
- CLI tools available in your terminal:
  - openspec 
  ```bash
  npm install -g @fission-ai/openspec@latest
  ```
  - opencode 
   ```bash
   npm install -g opencode-ai
   ```

Runner fallback: if `opencode` is not on your PATH, the bundled runner can fall back to `npx -y opencode-ai@1.1.44` (see `ralph_opencode.mjs`).

## Quickstart

1. Open a folder that contains `openspec/` at the workspace root.
   - If not initialized yet: run `OpenSpec: Initialize` (runs `openspec init` in a terminal).
2. Open the OpenSpec view from the Activity Bar.
3. Start the server: run command or just press the opencode icon `OpenSpec: Start OpenCode Server`.
   - It runs:

```bash
opencode serve --port 4099 --print-logs
```

4. Open the Chat UI: run `OpenSpec: Open Chat` or use the chat icon in the OpenSpec view.
5. Create/spec a change: use the New Change action or run `OpenSpec: New Change (OpenCode)` (plan mode first).
6. Fast-forward artifacts: click `Fast-Forward Change` on scaffold-only changes.
7. Apply tasks: click `Apply Change` and enter how many tasks to include per OpenCode run (batch size within the same parent task section; default 1).
8. Monitor: run `OpenSpec: Open OpenCode UI` or open `http://localhost:4099`.

## Chat UI

The Chat UI provides a conversational interface for OpenSpec workflows:

### Features

- **Natural Conversations**: Chat with OpenCode AI using natural language to create changes and implement features
- **Message History**: Persistent conversation history that survives VS Code reloads
- **Markdown Rendering**: AI responses are rendered with full markdown support including code blocks with syntax highlighting
- **Streaming Responses**: Real-time streaming with typing indicators
- **Connection Status**: Connection indicator shows connected, connecting, or disconnected state
- **Phase Tracker**: Visual progress indicator showing current workflow phase (New Change, Drafting, Implementation)
- **Action Buttons**: Quick-access buttons for common actions like Fast-Forward and Apply

### Opening the Chat

- Run command: `OpenSpec: Open Chat` (or press `Ctrl+Shift+P` and type "Open Chat")
- Click the chat icon in the OpenSpec Explorer view
- Use keyboard shortcut (configurable in settings under `openspec.chat.keybinding`)

### Chat Workflow Example

1. **Start a conversation**: Open the chat and describe what you want to build
2. **Create a change**: Click the New Change action and answer the prompts
3. **Generate artifacts**: After the scaffold is created, click Fast-Forward to generate all spec files
4. **Review**: Check the generated proposal.md, design.md, and tasks.md
5. **Implement**: Click Apply to start implementing tasks
6. **Monitor**: Watch progress in the chat and at `http://localhost:4099`
7. **Complete**: When done, click Archive to archive the change

## Apply Change (Ralph loop)

When you click Apply Change, the extension:

- best-effort ensures a local OpenCode server is listening on port 4099
- runs the bundled cross-platform runner `ralph_opencode.mjs`
- iterates through `openspec/changes/<changeId>/tasks.md` in order using the `openspec-apply-change` skill

Manual runner usage:

```bash
node ralph_opencode.mjs --attach http://localhost:4099 --change your-change-id [--count <n>]
```

`--count <n>` includes up to `n` tasks per `opencode run` iteration (default: `1`).

Batching is bounded to the parent section of the first task id in the batch (e.g. `2.2` can batch `2.3`, but not `3.1`), so a run may include fewer than `n` tasks at a parent boundary.

## Fast-forward scaffold-only changes

If an active change folder contains only `.openspec.yaml` (and optionally an empty `specs/`), the explorer shows `Fast-Forward Change`.

It runs a continuation prompt like:

```bash
opencode run --attach localhost:4099 --continue "use openspec ff skill to populate <changeId>"
```

## Configuration

Configure OpenSpec settings in VS Code: open Settings (File > Preferences > Settings or `Ctrl+,`) and search for "openspec".

### Chat Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `openspec.chat.enabled` | boolean | `true` | Enable the chat UI feature for OpenSpec workflow |
| `openspec.chat.autoStartServer` | boolean | `true` | Automatically start OpenCode server when opening chat |
| `openspec.chat.maxMessages` | number | `100` | Maximum number of messages to store in chat history (10-500) |
| `openspec.chat.streamingEnabled` | boolean | `true` | Enable streaming responses from AI |
| `openspec.chat.showTimestamps` | boolean | `true` | Show timestamps on chat messages |

### Debug Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `openspec.debug.enabled` | boolean | `false` | Enable debug mode for detailed logging |
| `openspec.debug.structuredLogging` | boolean | `true` | Use structured JSON format when exporting logs |

### Offline Mode Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `openspec.offlineMode.enabled` | boolean | `true` | Enable offline mode to queue messages when server is unavailable |
| `openspec.offlineMode.maxQueueSize` | number | `50` | Maximum number of messages to queue when offline (10-100) |
| `openspec.offlineMode.retryInterval` | number | `30` | Interval in seconds between offline retry attempts (10-300) |

### Settings.json Example

```json
{
  "openspec.chat.enabled": true,
  "openspec.chat.autoStartServer": true,
  "openspec.chat.maxMessages": 100,
  "openspec.chat.streamingEnabled": true,
  "openspec.debug.enabled": false,
  "openspec.offlineMode.enabled": true
}
```

## Known limitations / bugs

- Multi-root / multiple projects: not supported. OpenCode `serve` is tied to a single folder. If you use this extension across multiple projects in parallel, it may spawn/attach OpenCode in the first project and then fail to find specs in the other workspace.

## Help / troubleshooting

- Logs: VS Code Output panel -> `OpenSpec Extension` or run `OpenSpec: Show Output`.
- If the server is not responding, check the `OpenCode Server` terminal and verify port 4099 is free.
- Verify your workspace has `openspec/` at the root and that `openspec` + `opencode` resolve in the integrated terminal.
- OpenSpec/OpenCode tooling reference: https://github.com/sst/opencode

## Development

Install deps and build:

```bash
npm install
npm run compile
```

Package a VSIX:

```bash
npm run vscode:prepublish
npx vsce package
```

More:

- Release notes: `CHANGELOG.md`
- Contributing: `CONTRIBUTING.md`
- License: `LICENSE`

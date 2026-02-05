# Chat: New Session + OpenCode ACP Spawn/Auto-Start

## 1) Objective
Identify where the extension:

- Handles "New Chat" (starting a fresh chat/session from the UI)
- Handles OpenCode ACP (`opencode acp`) lifecycle (spawning the process and auto-starting it at startup / chat open)

## 2) Intended To Be Achieved
Trace the full request/flow from UI -> extension -> ACP process:

- Webview triggers a new chat session (`newSession` message)
- Extension resets local + persisted chat session state and creates a fresh ACP session
- Extension can auto-start ACP on activation and/or when the chat view is opened/visible
- ACP runs as a child process and communicates via JSON-RPC over stdio

## 2.1) OpenCode Config Requirement

opencode acp should load config from OpenCode is located at ~/.config/opencode/opencode.json (or opencode.jsonc) on macOS and Linux, and %USERPROFILE%\\.config\\opencode\\opencode.json on Windows | pass a full OpenCode config blob via OPENCODE_CONFIG_CONTENT | example: OPENCODE_CONFIG_CONTENT='{"model":"anthropic/claude-3-7-sonnet"}' opencode-acp

## 3) Files Involved

- `media/chat.js`
  - Webview UI: emits `vscode.postMessage({ type: 'newSession' })` when the "New Chat" button is clicked.

- `src/providers/chatViewProvider.ts`
  - WebviewView provider: receives webview messages (`onDidReceiveMessage`) and routes them.
  - Owns "new session" behavior (`_handleNewSession`).
  - Triggers ACP auto-start when the chat view is opened or becomes visible (`resolveWebviewView` -> `maybeAutoStart`).

- `src/services/acpClient.ts`
  - Core ACP client: connects/spawns `opencode acp`, chooses ports, manages reconnects.
  - Creates ACP sessions (`createSession`) after connecting.
  - Spawns the underlying process (`startAcpProcess`) and hooks up transport.

- `src/services/acpTransport.ts`
  - JSON-RPC transport over process stdio.
  - Parses line-delimited JSON on stdout and routes responses/requests/notifications.

- `src/extension/activate.ts`
  - Extension runtime activation: auto-starts ACP on activation if enabled.

- `src/extension.ts`
  - VS Code extension entrypoint: registers the chat view provider and sets context keys.

## 4) Lines Of Code (Key Anchors)

New chat button -> webview message:

- `media/chat.js:98-104`
  - `clearBtn.addEventListener('click', ...)`
  - `vscode.postMessage({ type: 'newSession' })`

Webview message routing -> new session handler:

- `src/providers/chatViewProvider.ts:439-494`
  - `_setupMessageHandling()`
  - `case 'newSession': await this._handleNewSession();`

New session behavior (reset local + persisted + ACP session):

- `src/providers/chatViewProvider.ts:721-770`
  - `_handleNewSession()`
  - `await this._acpClient.connect()`
  - `const newAcpSessionId = await this._acpClient.createSession()`
  - local state reset: `this._session = this._createNewSession()` + `postMessage({ type: 'clearChat' })`
  - persisted reset: `await this._sessionManager.clearCurrentSession()` + `await this._sessionManager.createSession(undefined, 'New chat')`
  - ACP session reset: `clearAcpSessionId()` + `setAcpSessionId(newAcpSessionId)`

Chat view auto-starts ACP when opened/visible:

- `src/providers/chatViewProvider.ts:90-142`
  - `resolveWebviewView()`
  - `maybeAutoStart()` checks `openspec.chat.autoStartServer`
  - If disconnected -> `this._acpClient.connect()`

Extension activation auto-starts ACP:

- `src/extension/activate.ts:22-31`
  - `autoStartEnabled = config.get('chat.autoStartServer', true)`
  - If enabled and workspace open and not connected -> `acpClient.connect()`

ACP connect orchestration (port candidates + retries):

- `src/services/acpClient.ts:436-531`
  - `connect()`
  - `buildPortCandidates()` -> iterate ports
  - `isPortInUse(port)` -> skip busy ports
  - `tryConnect(port)` -> spawns process + waits for initialize

ACP process spawn (`opencode acp`) + transport hookup:

- `src/services/acpClient.ts:642-743`
  - `startAcpProcess(port, cwd)`
  - Builds args: `['acp', '--port', String(port), '--hostname', '127.0.0.1']`
  - `spawn(command, args, { cwd, stdio: ['pipe','pipe','pipe'], shell, env, windowsHide })`
  - `this.transport = new AcpTransport(...)`
  - `await this.transport.connect(this.acpProcess)`

ACP session creation:

- `src/services/acpClient.ts:976-1010`
  - `createSession()` calls `ACP_METHODS.sessionNew` and returns `sessionId`
  - emits `session_created` message to listeners

Transport behavior (JSON-RPC over stdout lines):

- `src/services/acpTransport.ts:75-145`
  - `connect(process)` attaches stdout/stderr handlers and manages disconnect

- `src/services/acpTransport.ts:147-201`
  - `handleStdoutData()` splits on `\n` and parses JSON per line
  - `handleLine()` routes to pending request resolver or agent request/notification handlers

Extension wires chat provider on activation:

- `src/extension.ts:31-73`
  - `registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider, ...)`
  - sets context keys like `openspec:chatEnabled`, `openspec:chatFocus`, `openspec:inputEmpty`

## 5) Relationships Between Files

- `media/chat.js` (webview) communicates with `ChatViewProvider` using `vscode.postMessage(...)`.
- `ChatViewProvider` is the central controller for chat UI events and uses:
  - `AcpClient` for ACP connectivity/session/model/mode operations
  - `SessionManager` for persisted chat session state and ACP session ID storage
- `AcpClient` spawns and owns the `opencode acp` child process, and delegates JSON-RPC framing/parsing to `AcpTransport`.
- `activateExtension` (`src/extension/activate.ts`) can proactively call `AcpClient.connect()` on extension startup (config-gated).

## 6) Relationships Between Functions

- "New Chat" button click
  - `media/chat.js` -> `vscode.postMessage({ type: 'newSession' })`
  - `ChatViewProvider._setupMessageHandling()` receives message
  - Routes to `ChatViewProvider._handleNewSession()`

- `ChatViewProvider._handleNewSession()`
  - cancels any current ACP turn (best-effort)
  - ensures `AcpClient.connect()` (spawns ACP if needed)
  - creates a fresh ACP model context via `AcpClient.createSession()`
  - resets local UI state and persisted session state via `SessionManager`

- ACP connect/spawn path
  - `AcpClient.connect()`
    - computes candidate ports (`buildPortCandidates()`)
    - checks each port (`isPortInUse()`)
    - attempts connection (`tryConnect(port)`)
      - `startAcpProcess(port, cwd)` -> `spawn('opencode', ['acp', ...])`
      - `AcpTransport.connect(childProcess)` sets up stdio listeners
      - `waitForAcpStdioReady()` repeatedly calls initialize until ready

- Auto-start triggers (two call sites)
  - `activateExtension()` may call `AcpClient.connect()` during extension activation
  - `ChatViewProvider.resolveWebviewView()` may call `AcpClient.connect()` when chat UI is shown

## 7) Mermaid Diagram

```mermaid
flowchart TD
  %% Activation
  A[vscode activates extension] --> B[src/extension.ts: activate()]
  B --> C[src/extension/activate.ts: activateExtension()]
  B --> D[src/providers/chatViewProvider.ts: new ChatViewProvider()]
  B --> E[registerWebviewViewProvider(openspecChat)]

  %% Auto-start on activation
  C -->|openspec.chat.autoStartServer| F[AcpClient.connect()]

  %% Chat view open/visible auto-start
  E --> G[Chat view resolves]
  G --> H[src/providers/chatViewProvider.ts: resolveWebviewView()]
  H -->|maybeAutoStart()| F

  %% ACP connect details
  F --> I[src/services/acpClient.ts: buildPortCandidates()]
  F --> J[src/services/acpClient.ts: isPortInUse(port)]
  F --> K[src/services/acpClient.ts: tryConnect(port)]
  K --> L[src/services/acpClient.ts: startAcpProcess()]
  L --> M[spawn: opencode acp --port N --hostname 127.0.0.1]
  L --> N[src/services/acpTransport.ts: new AcpTransport()]
  L --> O[src/services/acpTransport.ts: transport.connect(childProcess)]
  K --> P[src/services/acpClient.ts: waitForAcpStdioReady()]

  %% New chat action
  Q[User clicks New Chat button] --> R[media/chat.js: postMessage type=newSession]
  R --> S[src/providers/chatViewProvider.ts: onDidReceiveMessage]
  S --> T[src/providers/chatViewProvider.ts: _handleNewSession()]
  T --> F
  T --> U[src/services/acpClient.ts: createSession()]
  U --> V[ACP JSON-RPC: session/new]
  T --> W[SessionManager: clearCurrentSession + createSession]
  T --> X[SessionManager: setAcpSessionId(newAcpSessionId)]
  T --> Y[postMessage clearChat -> webview]
```

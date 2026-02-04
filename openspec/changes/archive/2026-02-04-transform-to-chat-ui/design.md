# Design: Transform to Chat UI

## Context

The OpenSpec VS Code extension currently uses a static tree view for browsing changes and specs, with a detail webview that displays markdown content. Users interact with OpenCode AI through terminal commands, which requires manual context switching between VS Code and terminal windows.

This design introduces a conversational Chat UI that integrates directly into VS Code, enabling users to interact with OpenCode AI through a natural chat interface. The Chat UI will support real-time messaging, artifact visualization, and workflow management—all within the editor.

Current architecture limitations:
- Terminal-based OpenCode interaction breaks flow
- No persistent conversation history
- Static webview doesn't support streaming responses
- Tool calls are invisible to users
- Phase transitions require manual command execution

## Goals / Non-Goals

**Goals:**
- Create a responsive Chat UI webview panel with message history
- Implement real-time communication with OpenCode via ACP (Agent Client Protocol)
- Auto-start and manage OpenCode server lifecycle
- Support streaming AI responses with incremental UI updates
- Display tool calls in an expandable panel
- Visualize OpenSpec artifacts (proposal, design, tasks, specs) within chat context
- Track and display workflow phases with progress indicators
- Maintain conversation sessions across extension reloads
- Support all existing OpenSpec commands through chat interface

**Non-Goals:**
- Replace the tree view explorer (it remains as secondary navigation)
- Modify OpenCode server behavior (we use it as-is)
- Support non-OpenCode AI providers
- Implement voice/chat input beyond text
- Create a standalone application (stays within VS Code)
- Real-time collaborative editing

## Decisions

### Decision: Use VS Code Webview API for Chat UI

**Rationale:** VS Code's Webview API provides the most flexibility for building custom UI while maintaining VS Code's look and feel. Webviews can use any HTML/CSS/JS and communicate bidirectionally with the extension.

**Alternatives considered:**
- **VS Code Chat API (proposed)**: Not yet stable/available for general use
- **Custom Sidebar View**: Limited to simple tree/list structures, not suitable for chat
- **Terminal-based TUI**: Loses rich UI capabilities (markdown rendering, tool visualization)

### Decision: Communicate with OpenCode via HTTP JSON-RPC

**Rationale:** OpenCode exposes an ACP (Agent Client Protocol) server via HTTP. Using HTTP fetch/SSE (Server-Sent Events) provides the best compatibility and allows streaming responses.

**Implementation:**
- Server runs via `opencode serve --port <port>`
- Client sends JSON-RPC requests to `http://localhost:<port>/`
- Streaming responses use SSE format for real-time updates

**Alternatives considered:**
- **stdio**: Would require spawning OpenCode as child process with stdio communication
- **WebSocket**: OpenCode doesn't expose WebSocket endpoint; HTTP SSE is the supported streaming method

### Decision: Auto-start OpenCode on port 4xxx range

**Rationale:** Using a predictable port range (4000-4999) makes debugging easier while allowing multiple VS Code windows to use different ports. The extension scans for an available port starting from 4000.

**Port selection algorithm:**
1. Check if port 4099 is available (backward compatibility with existing behavior)
2. If not, scan 4000-4999 sequentially
3. First available port is used
4. Port stored in extension state for session persistence

**Alternatives considered:**
- **Random high port**: Harder to debug and document
- **Fixed port 4099**: Causes conflicts when multiple workspaces are open
- **Let user configure**: Adds friction to initial setup

### Decision: Use VS Code GlobalStorage for Session Persistence

**Rationale:** VS Code's `ExtensionContext.globalState` and `workspaceState` provide reliable storage for conversation history and session data that persists across reloads.

**Data stored:**
- Conversation messages (limited to last N messages to prevent bloat)
- Current workflow phase
- OpenCode server port
- Active change ID
- Session metadata

**Alternatives considered:**
- **File-based storage**: More complex, requires file I/O handling
- **In-memory only**: Lost on reload
- **Custom database**: Overkill for this use case

### Decision: Separate ChatProvider from existing WebviewProvider

**Rationale:** Creating a new `ChatProvider` allows clean separation of concerns. The existing `webviewProvider.ts` can remain for backward compatibility or be gradually deprecated.

**Architecture:**
```
src/
  providers/
    chatProvider.ts          # New: Chat webview provider
    webviewProvider.ts       # Existing: Detail webview (kept for now)
    explorerProvider.ts      # Existing: Tree view
  services/
    acpClient.ts             # New: JSON-RPC client for OpenCode
    sessionManager.ts        # New: Conversation state management
    serverLifecycle.ts       # New: OpenCode server management
    portManager.ts           # New: Port allocation
```

**Alternatives considered:**
- **Extend existing webviewProvider.ts**: Would create messy code mixing static and dynamic content
- **Replace webviewProvider entirely**: Breaks existing functionality immediately

### Decision: Tool Calls Display in Collapsible Panel

**Rationale:** Tool calls provide transparency into what OpenCode is doing but shouldn't clutter the main chat. A collapsible panel (similar to Traycer) shows tool activity when needed.

**UI Design:**
- Fixed panel at top or bottom of chat
- Shows count of recent tool calls
- Expandable to see details: tool name, parameters, duration, result
- Auto-expands when tools are actively running

**Alternatives considered:**
- **Inline with messages**: Too verbose for long conversations
- **Separate tab**: Requires too much context switching
- **Notification toasts**: Easy to miss, no history

### Decision: Phase Breakdown as Sidebar Component

**Rationale:** Users need to understand where they are in the workflow (New Change → Drafting → Implementation). A visual phase tracker provides orientation.

**UI Design:**
- Vertical or horizontal progress indicator
- Three phases: New Change, Drafting, Implementation
- Each phase shows: name, status (pending/active/completed), quick actions
- Clicking completed phases shows phase artifacts

**Alternatives considered:**
- **Text-only status**: Less visual, harder to scan
- **Wizard/stepper UI**: Too rigid for conversational flow
- **No phase indicator**: Users lose context

### Decision: Artifact Rendering Within Chat Context

**Rationale:** OpenSpec artifacts (proposal, design, tasks, specs) should be viewable without leaving the chat context. This keeps the conversation flow intact.

**Implementation:**
- Special message type for artifacts
- Collapsible sections within chat messages
- Markdown rendering with syntax highlighting
- Links to open files in editor when needed

**Alternatives considered:**
- **Separate webview for artifacts**: Breaks chat context
- **Tree view only**: Requires switching views
- **Read-only display**: No interaction

### Decision: ACP Workflow for Change Creation

**Rationale:** Using ACP (Agent Client Protocol) in plan mode allows for interactive change creation where OpenCode can ask clarifying questions before proceeding. This creates a more guided workflow than executing commands directly.

**Implementation:**
1. Extension connects to `opencode acp` (ACP server in plan mode)
2. Sends initial prompt: "use openspec skill to create new change, always use questions tool if need to answer user questions"
3. OpenCode loads the OpenSpec skill and responds
4. User can then type requirements/requests
5. AI may use questions tool to ask clarifications
6. User responds to questions within the chat interface
7. Eventually OpenCode creates the change folder using the openspec skill

**Key Considerations:**
- Questions tool responses flow through the same chat interface
- Session ID is captured after successful change creation
- This session ID is reused for Fast Forward to maintain context

**Alternatives considered:**
- **Direct command execution**: Less interactive, can't ask clarifying questions
- **Static forms**: Too rigid for AI-driven workflow

### Decision: Session Continuity Across Phases

**Rationale:** The workflow has three distinct phases (New Change → Fast Forward → Apply) that need to share context. Maintaining session continuity ensures the AI remembers previous decisions and requirements.

**Implementation:**

**New Change Phase:**
- Connect to ACP in plan mode
- Send initial prompt with OpenSpec skill
- Capture session ID after change creation
- Store session ID in workspace state

**Fast Forward Phase:**
- Reuse the session ID from New Change phase
- Continue the same ACP session (no context reset)
- Openspec generates design.md, proposal.md, tasks.md, specs/

**Apply Phase:**
- Attach to the main OpenCode server (`opencode serve`)
- Execute ralph_opencode.mjs script
- Allow user to add extra prompts for additional context
- Session context informs ralph about the change

**Session Storage:**
```typescript
interface SessionData {
  sessionId: string;
  changeId: string;
  phase: 'new' | 'drafting' | 'implementation';
  createdAt: number;
  acpPort?: number;
  serverPort?: number;
}
```

**Alternatives considered:**
- **Independent sessions per phase**: Loses context between phases
- **Single session for everything**: Too complex, phases have different needs

### Decision: Ralph Integration for Apply Phase

**Rationale:** The Apply phase requires executing the `ralph_opencode.mjs` script to implement the changes. This needs to happen within the chat context so users can monitor progress and add extra context.

**Implementation:**
1. User triggers Apply phase (via button or `/apply` command)
2. Extension attaches to main OpenCode server (`opencode serve`)
3. Executes: `node ralph_opencode.mjs` (or via OpenCode run command)
4. Streams script output to chat UI in real-time
5. User can send additional prompts during execution
6. Script output is parsed for progress indicators

**Script Resolution:**
- Check workspace root for `ralph_opencode.mjs`
- Allow user to configure path in settings
- Provide error if script not found

**Extra Prompts:**
- Input field remains active during ralph execution
- Additional prompts are sent as follow-up messages
- Useful for clarifying requirements or course-correcting

**Alternatives considered:**
- **Run ralph in terminal**: Breaks chat context
- **Embed ralph logic in extension**: Duplicates existing script

### Decision: Chat Commands (Slash Commands)

**Rationale:** Power users need quick access to workflow phases. Slash commands provide familiar chat-style shortcuts for common actions.

**Commands:**
- `/new` - Start New Change flow (equivalent to "Propose New Change")
- `/ff` or `/fastforward` - Run Fast Forward on current change
- `/apply` - Execute Apply phase with ralph
- `/archive` - Archive completed change
- `/status` - Show current phase and session info
- `/clear` - Clear chat history

**Implementation:**
- Parse messages starting with `/`
- Route to appropriate workflow handler
- Show help text with `/help`

**Alternatives considered:**
- **Buttons only**: Less efficient for keyboard users
- **VS Code command palette**: Requires switching contexts

## Risks / Trade-offs

**[Risk] Large conversation history impacts performance** → **Mitigation:** Limit stored messages to last 100, compress old sessions, provide "clear history" button

**[Risk] OpenCode server crashes or becomes unresponsive** → **Mitigation:** Implement health checks, auto-restart with exponential backoff, clear error messages in UI

**[Risk] Port conflicts on multi-workspace setups** → **Mitigation:** Dynamic port allocation per workspace, store port in workspace state, user can configure preferred port

**[Risk] Chat UI becomes cluttered with long conversations** → **Mitigation:** Implement message folding, clear history button, session management (start new conversation)

**[Risk] Tool call panel becomes overwhelming** → **Mitigation:** Collapse by default, show count badge, filter options (show only errors, only file operations)

**[Risk] Streaming responses cause UI jank** → **Mitigation:** Virtual scrolling for long conversations

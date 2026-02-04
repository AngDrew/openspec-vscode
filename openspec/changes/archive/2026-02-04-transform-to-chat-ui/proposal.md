# Transform to Chat UI

## Why

The current OpenSpec VS Code extension uses a static tree view and detail webview pattern that doesn't leverage the full potential of conversational AI. Users must manually execute commands and navigate through multiple views to create changes, draft artifacts, and implement tasks. By transforming the extension into a Chat UI similar to Traycer, we enable seamless spec-driven development where users can have natural conversations with OpenCode AI to create changes, draft artifacts, and implement code—all within an integrated chat interface. This reduces context switching, provides better guidance through AI-driven conversations, and creates a more intuitive developer experience.

## What Changes

- **Add Chat Webview Panel**: Replace the static detail webview with a full-featured chat interface showing message history, input field, and action buttons
- **Integrate OpenCode ACP Client**: Create a service to communicate with OpenCode via JSON-RPC over HTTP for real-time chat interactions
- **Implement Session Management**: Track conversation state across multiple phases (new change creation, artifact drafting, implementation with Ralph)
- **Auto-start OpenCode Server**: Automatically launch `opencode serve` on a random available 4xxx port when the extension activates
- **Port Management System**: Dynamically find and allocate unused ports in the 4000-4999 range
- **Chat Message Flow**: Support streaming responses from OpenCode with proper message handling and UI updates
- **Artifact Visualization**: Display OpenSpec artifacts (proposal, design, tasks, specs) within the chat context as collapsible sections
- **Tool Call Display**: Show tool calls (like file reads, searches) in an expandable panel within the chat interface
- **Phase Breakdown UI**: Visual progress tracking showing current implementation phase and status
- **Command Migration**: Move existing commands (New Change, Fast-Forward, Apply, Archive) into the chat flow as conversational actions
- **Persistent Chat History**: Maintain conversation context across extension reloads
- **Better Spec Display**: Render specs with syntax highlighting and collapsible sections directly in the chat panel
- **ACP Workflow Integration**: Connect to OpenCode via ACP in plan mode for interactive change creation
- **Questions Tool Support**: Handle AI-initiated questions and user responses within the chat flow
- **Session Continuity**: Maintain session context across New Change, Fast Forward, and Apply phases
- **Ralph Integration**: Execute ralph_opencode.mjs script during Apply phase with real-time output streaming
- **Chat Commands**: Slash commands (/new, /ff, /apply, /archive) for quick workflow access

## Capabilities

### New Capabilities

- `chat-interface`: Main chat UI with message history, input field, and send functionality
- `acp-client`: JSON-RPC client for communicating with OpenCode ACP server
- `session-manager`: Track and persist conversation sessions and state across phases
- `server-lifecycle`: Auto-start, monitor, and manage OpenCode server processes
- `port-manager`: Dynamic port allocation in 4xxx range with conflict detection
- `artifact-renderer`: Display OpenSpec artifacts (proposal/design/tasks/specs) within chat context
- `tool-call-visualizer`: Show expandable tool execution details in chat UI
- `phase-tracker`: Visual progress indication for multi-phase workflows
- `message-streaming`: Real-time streaming of AI responses with typing indicators
- `spec-syntax-highlight`: Markdown rendering with code highlighting for spec files
- `acp-workflow`: Plan mode ACP integration for interactive change creation
- `questions-tool`: Handle AI questions and user responses within chat
- `session-continuity`: Maintain session context across New Change, Fast Forward, and Apply phases
- `ralph-integration`: Execute ralph_opencode.mjs script during Apply phase with output streaming
- `chat-commands`: Slash commands (/new, /ff, /apply, /archive) for quick workflow access

## Impact

- **Extension Architecture**: New providers (`ChatProvider`, `AcpClient`, `SessionManager`) added to `src/providers/`
- **Services Layer**: New `src/services/` directory for ACP client, port management, and server lifecycle
- **Webview Changes**: Significant refactoring of `webviewProvider.ts` to support chat UI instead of static content
- **Commands**: Existing commands remain but are now accessible through chat interface; terminal-based workflows still supported
- **Dependencies**: May need additional npm packages for WebSocket/real-time communication if not using stdio
- **Media Files**: New `media/chat.html`, `media/chat.css`, `media/chat.js` for chat-specific UI
- **Backward Compatibility**: Tree view explorer remains functional; chat is an alternative/additional interface
- **Configuration**: New settings for chat behavior, port preferences, and auto-start options
- **Performance**: WebSocket or polling for real-time updates; careful memory management for chat history

## Notes

- ACP (Agent Client Protocol) uses JSON-RPC for communication with OpenCode
- Server runs via `opencode serve --port <port>` and accepts connections on localhost
- Sessions persist using VS Code's global storage API
- Chat UI follows VS Code's Webview UI Toolkit patterns for consistency
- All existing OpenSpec functionality (changes, specs, archive) remains accessible through chat commands

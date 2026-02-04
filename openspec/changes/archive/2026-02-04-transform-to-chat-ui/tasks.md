# Implementation Tasks

## 1. Core Infrastructure - Port Management

- [x] 1.1 Create PortManager service class in `src/services/portManager.ts`
- [x] 1.2 Implement port scanning algorithm (4000-4999 range)
- [x] 1.3 Add port availability validation using net.createServer
- [x] 1.4 Store selected port in extension workspace state
- [x] 1.5 Add port conflict resolution logic

## 2. Core Infrastructure - Server Lifecycle

- [x] 2.1 Create ServerLifecycle service in `src/services/serverLifecycle.ts`
- [x] 2.2 Implement OpenCode server detection (check if running)
- [x] 2.3 Add auto-start functionality using VS Code terminal API
- [x] 2.4 Implement server health monitoring with polling
- [x] 2.5 Add server crash detection and auto-restart logic
- [x] 2.6 Create server status indicator in UI

## 3. Core Infrastructure - ACP Client

- [x] 3.1 Create AcpClient service in `src/services/acpClient.ts`
- [x] 3.2 Implement JSON-RPC request/response handling
- [x] 3.3 Add SSE (Server-Sent Events) streaming support
- [x] 3.4 Implement connection retry with exponential backoff
- [x] 3.5 Add message sending and response parsing

- [x] 3.6 Implement tool call parsing and event emission
## 4. Core Infrastructure - Session Management
- [x] 4.1 Create SessionManager service in `src/services/sessionManager.ts`

- [x] 4.2 Implement conversation history persistence using globalState
- [x] 4.3 Add current workflow phase tracking
- [x] 4.4 Implement session restoration on extension reload
- [x] 4.5 Add conversation context maintenance across commands
- [x] 4.6 Limit stored messages to prevent bloat (max 100)

## 5. Chat UI Foundation - Webview Provider
- [x] 5.1 Create ChatProvider class in `src/providers/chatProvider.ts`

- [x] 5.2 Implement WebviewPanel creation and management
- [x] 5.3 Add message posting between extension and webview
- [x] 5.4 Register ChatProvider in extension activation
- [x] 5.5 Add command to open chat panel

## 6. Chat UI Foundation - HTML/CSS Structure

- [x] 6.1 Create chat.html with basic layout (messages, input, controls)
- [x] 6.2 Implement VS Code theme variable integration
- [x] 6.3 Add message history container with scrolling
- [x] 6.4 Create message input field with send button
- [x] 6.5 Add typing indicator component
- [x] 6.6 Implement CSP-compliant script loading

## 7. Chat UI Foundation - Message Display

- [x] 7.1 Implement message rendering in chat.js
- [x] 7.2 Add user vs AI message styling distinction
- [x] 7.3 Implement auto-scroll to latest message
- [x] 7.4 Add markdown rendering for AI messages
- [x] 7.5 Implement message timestamp display

## 8. Chat UI Foundation - Input Handling

- [x] 8.1 Add input field event listeners
- [x] 8.2 Implement Enter key submission
- [x] 8.3 Add empty message validation
- [x] 8.4 Implement input clearing after send
- [x] 8.5 Add input field focus management

## 9. Chat UI Foundation - Streaming Messages

- [x] 9.1 Implement incremental message updates
- [x] 9.2 Add typing indicator during streaming
- [x] 9.3 Implement streaming cancellation button
- [x] 9.4 Add partial response display on cancel
- [x] 9.5 Optimize rendering performance (throttle updates)

## 10. Enhanced Features - Tool Call Panel

- [x] 10.1 Create tool calls panel HTML structure
- [x] 10.2 Implement collapsible panel behavior
- [x] 10.3 Add tool call list rendering
- [x] 10.4 Implement tool execution status display
- [x] 10.5 Add tool parameters and results display
- [x] 10.6 Implement tool count badge

## 11. Enhanced Features - Phase Tracker

- [x] 11.1 Create phase tracker component in chat UI

- [x] 11.2 Implement phase visualization (New Change, Drafting, Implementation)

- [x] 11.3 Add phase status indicators (pending/active/completed)
- [x] 11.4 Implement phase click to view details

- [x] 11.5 Add phase transition detection
## 12. Enhanced Features - Artifact Renderer

- [x] 12.1 Implement proposal.md rendering in chat context
- [x] 12.2 Add design.md display with collapsible sections
- [x] 12.3 Create tasks.md progress visualization
- [x] 12.4 Implement specs list with expandable items

- [x] 12.5 Add "Open in Editor" links for artifacts
## 13. Enhanced Features - Syntax Highlighting

- [x] 13.1 Add code block syntax highlighting library

- [x] 13.2 Implement language detection from code blocks

- [x] 13.3 Add syntax highlighting for TypeScript, JavaScript, JSON
- [x] 13.4 Implement spec.md formatting with proper headers
- [x] 13.5 Add collapsible sections for long documents

## 14. Integration - Command Migration

- [x] 14.1 Integrate "New Change" command into chat flow
- [x] 14.2 Add "Fast-Forward" action button in chat
- [x] 14.3 Implement "Apply" command through chat interface
- [x] 14.4 Add "Archive" functionality in chat context

- [x] 14.5 Connect existing commands to chat session
## 15. Integration - Package and Commands

- [x] 15.1 Update package.json with new chat view contribution
- [x] 15.2 Add keyboard shortcuts for chat operations
- [x] 15.3 Register new commands (openChat, sendMessage, etc.)
- [x] 15.4 Update activation events if needed

- [x] 15.5 Add configuration settings for chat behavior
## 16. Polish - Error Handling

- [x] 16.1 Add connection error messages in UI
- [x] 16.2 Implement user-friendly error displays
- [x] 16.3 Add retry buttons for failed operations
- [x] 16.4 Implement graceful degradation when server unavailable
- [x] 16.5 Add error logging and debugging support

## 17. Polish - Performance Optimization

- [x] 17.1 Implement virtual scrolling for long conversations

- [x] 17.2 Add message compression for storage

- [x] 17.3 Optimize re-renders during streaming
- [x] 17.4 Add lazy loading for syntax highlighting
- [x] 17.5 Implement memory cleanup for old sessions

## 18. Testing - Unit Tests

- [x] 18.1 Write tests for PortManager service
- [x] 18.2 Add tests for ServerLifecycle service
- [x] 18.3 Test AcpClient JSON-RPC handling
- [x] 18.4 Add SessionManager persistence tests
- [x] 18.5 Test message streaming logic

## 19. Testing - Integration Tests

- [x] 19.1 Test end-to-end chat flow

- [x] 19.2 Add OpenCode server integration tests

- [x] 19.3 Test session persistence across reloads
- [x] 19.4 Add error scenario tests

- [x] 19.5 Test command integration
## 20. Documentation

- [x] 20.1 Update README with Chat UI features
- [x] 20.2 Add usage documentation for chat commands
- [x] 20.3 Document configuration options
- [x] 20.4 Add troubleshooting guide
- [x] 20.5 Update CHANGELOG.md

## 21. ACP Integration - Workflow Phases

- [x] 21.1 Implement ACP server connection for plan mode using `opencode acp` command
- [x] 21.2 Add initial prompt mechanism: "use openspec skill to create new change, always use questions tool if need to answer user questions"
- [x] 21.3 Implement Questions Tool flow: detect when AI asks questions and allow user to respond
- [x] 21.4 Add session ID capture after successful "New Change" creation

- [x] 21.5 Implement session persistence for Fast Forward (reuse same session ID)

- [x] 21.6 Add session attachment for Apply phase (attach to main OpenCode server)
- [x] 21.7 Implement extra prompt handling during Apply phase (user can add additional context)

## 22. Ralph Integration - Apply Phase

- [x] 22.1 Add ralph_opencode.mjs execution during Apply phase
- [x] 22.2 Implement script path resolution (workspace relative or absolute)
- [x] 22.3 Add script output capture and display in chat UI
- [x] 22.4 Implement error handling for ralph execution failures

- [x] 22.5 Add progress indication during ralph execution (streaming output)

- [x] 22.6 Support passing extra prompts/context to ralph as arguments

## 23. Session Management - Enhanced

- [x] 23.1 Implement session ID storage in workspace state after ACP connection
- [x] 23.2 Add session validation (check if session is still active)
- [x] 23.3 Implement session restoration logic on extension reload
- [x] 23.4 Add session cleanup when change is archived
- [x] 23.5 Support multiple concurrent sessions per workspace
- [x] 23.6 Add session metadata tracking (change ID, phase, timestamp)

## 24. Chat Commands - Workflow Integration

- [x] 24.1 Implement `/new` chat command to trigger New Change flow
- [x] 24.2 Add `/ff` or `/fastforward` command for Fast Forward phase
- [x] 24.3 Implement `/apply` command to trigger Apply with ralph
- [x] 24.4 Add `/archive` command for archiving completed changes

- [x] 24.5 Implement `/status` command to show current workflow phase

- [x] 24.6 Add `/clear` command to reset chat history

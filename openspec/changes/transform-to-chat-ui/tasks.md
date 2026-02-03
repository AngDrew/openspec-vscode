# Implementation Tasks

## 1. Core Infrastructure - Port Management

- [ ] 1.1 Create PortManager service class in `src/services/portManager.ts`
- [ ] 1.2 Implement port scanning algorithm (4000-4999 range)
- [ ] 1.3 Add port availability validation using net.createServer
- [ ] 1.4 Store selected port in extension workspace state
- [ ] 1.5 Add port conflict resolution logic

## 2. Core Infrastructure - Server Lifecycle

- [ ] 2.1 Create ServerLifecycle service in `src/services/serverLifecycle.ts`
- [ ] 2.2 Implement OpenCode server detection (check if running)
- [ ] 2.3 Add auto-start functionality using VS Code terminal API
- [ ] 2.4 Implement server health monitoring with polling
- [ ] 2.5 Add server crash detection and auto-restart logic
- [ ] 2.6 Create server status indicator in UI

## 3. Core Infrastructure - ACP Client

- [ ] 3.1 Create AcpClient service in `src/services/acpClient.ts`
- [ ] 3.2 Implement JSON-RPC request/response handling
- [ ] 3.3 Add SSE (Server-Sent Events) streaming support
- [ ] 3.4 Implement connection retry with exponential backoff
- [ ] 3.5 Add message sending and response parsing
- [ ] 3.6 Implement tool call parsing and event emission

## 4. Core Infrastructure - Session Management

- [ ] 4.1 Create SessionManager service in `src/services/sessionManager.ts`
- [ ] 4.2 Implement conversation history persistence using globalState
- [ ] 4.3 Add current workflow phase tracking
- [ ] 4.4 Implement session restoration on extension reload
- [ ] 4.5 Add conversation context maintenance across commands
- [ ] 4.6 Limit stored messages to prevent bloat (max 100)

## 5. Chat UI Foundation - Webview Provider

- [ ] 5.1 Create ChatProvider class in `src/providers/chatProvider.ts`
- [ ] 5.2 Implement WebviewPanel creation and management
- [ ] 5.3 Add message posting between extension and webview
- [ ] 5.4 Register ChatProvider in extension activation
- [ ] 5.5 Add command to open chat panel

## 6. Chat UI Foundation - HTML/CSS Structure

- [ ] 6.1 Create chat.html with basic layout (messages, input, controls)
- [ ] 6.2 Implement VS Code theme variable integration
- [ ] 6.3 Add message history container with scrolling
- [ ] 6.4 Create message input field with send button
- [ ] 6.5 Add typing indicator component
- [ ] 6.6 Implement CSP-compliant script loading

## 7. Chat UI Foundation - Message Display

- [ ] 7.1 Implement message rendering in chat.js
- [ ] 7.2 Add user vs AI message styling distinction
- [ ] 7.3 Implement auto-scroll to latest message
- [ ] 7.4 Add markdown rendering for AI messages
- [ ] 7.5 Implement message timestamp display

## 8. Chat UI Foundation - Input Handling

- [ ] 8.1 Add input field event listeners
- [ ] 8.2 Implement Enter key submission
- [ ] 8.3 Add empty message validation
- [ ] 8.4 Implement input clearing after send
- [ ] 8.5 Add input field focus management

## 9. Chat UI Foundation - Streaming Messages

- [ ] 9.1 Implement incremental message updates
- [ ] 9.2 Add typing indicator during streaming
- [ ] 9.3 Implement streaming cancellation button
- [ ] 9.4 Add partial response display on cancel
- [ ] 9.5 Optimize rendering performance (throttle updates)

## 10. Enhanced Features - Tool Call Panel

- [ ] 10.1 Create tool calls panel HTML structure
- [ ] 10.2 Implement collapsible panel behavior
- [ ] 10.3 Add tool call list rendering
- [ ] 10.4 Implement tool execution status display
- [ ] 10.5 Add tool parameters and results display
- [ ] 10.6 Implement tool count badge

## 11. Enhanced Features - Phase Tracker

- [ ] 11.1 Create phase tracker component in chat UI
- [ ] 11.2 Implement phase visualization (New Change, Drafting, Implementation)
- [ ] 11.3 Add phase status indicators (pending/active/completed)
- [ ] 11.4 Implement phase click to view details
- [ ] 11.5 Add phase transition detection

## 12. Enhanced Features - Artifact Renderer

- [ ] 12.1 Implement proposal.md rendering in chat context
- [ ] 12.2 Add design.md display with collapsible sections
- [ ] 12.3 Create tasks.md progress visualization
- [ ] 12.4 Implement specs list with expandable items
- [ ] 12.5 Add "Open in Editor" links for artifacts

## 13. Enhanced Features - Syntax Highlighting

- [ ] 13.1 Add code block syntax highlighting library
- [ ] 13.2 Implement language detection from code blocks
- [ ] 13.3 Add syntax highlighting for TypeScript, JavaScript, JSON
- [ ] 13.4 Implement spec.md formatting with proper headers
- [ ] 13.5 Add collapsible sections for long documents

## 14. Integration - Command Migration

- [ ] 14.1 Integrate "New Change" command into chat flow
- [ ] 14.2 Add "Fast-Forward" action button in chat
- [ ] 14.3 Implement "Apply" command through chat interface
- [ ] 14.4 Add "Archive" functionality in chat context
- [ ] 14.5 Connect existing commands to chat session

## 15. Integration - Package and Commands

- [ ] 15.1 Update package.json with new chat view contribution
- [ ] 15.2 Add keyboard shortcuts for chat operations
- [ ] 15.3 Register new commands (openChat, sendMessage, etc.)
- [ ] 15.4 Update activation events if needed
- [ ] 15.5 Add configuration settings for chat behavior

## 16. Polish - Error Handling

- [ ] 16.1 Add connection error messages in UI
- [ ] 16.2 Implement user-friendly error displays
- [ ] 16.3 Add retry buttons for failed operations
- [ ] 16.4 Implement graceful degradation when server unavailable
- [ ] 16.5 Add error logging and debugging support

## 17. Polish - Performance Optimization

- [ ] 17.1 Implement virtual scrolling for long conversations
- [ ] 17.2 Add message compression for storage
- [ ] 17.3 Optimize re-renders during streaming
- [ ] 17.4 Add lazy loading for syntax highlighting
- [ ] 17.5 Implement memory cleanup for old sessions

## 18. Testing - Unit Tests

- [ ] 18.1 Write tests for PortManager service
- [ ] 18.2 Add tests for ServerLifecycle service
- [ ] 18.3 Test AcpClient JSON-RPC handling
- [ ] 18.4 Add SessionManager persistence tests
- [ ] 18.5 Test message streaming logic

## 19. Testing - Integration Tests

- [ ] 19.1 Test end-to-end chat flow
- [ ] 19.2 Add OpenCode server integration tests
- [ ] 19.3 Test session persistence across reloads
- [ ] 19.4 Add error scenario tests
- [ ] 19.5 Test command integration

## 20. Documentation

- [ ] 20.1 Update README with Chat UI features
- [ ] 20.2 Add usage documentation for chat commands
- [ ] 20.3 Document configuration options
- [ ] 20.4 Add troubleshooting guide
- [ ] 20.5 Update CHANGELOG.md

## 21. ACP Integration - Workflow Phases

- [ ] 21.1 Implement ACP server connection for plan mode using `opencode acp` command
- [ ] 21.2 Add initial prompt mechanism: "use openspec skill to create new change, always use questions tool if need to answer user questions"
- [ ] 21.3 Implement Questions Tool flow: detect when AI asks questions and allow user to respond
- [ ] 21.4 Add session ID capture after successful "New Change" creation
- [ ] 21.5 Implement session persistence for Fast Forward (reuse same session ID)
- [ ] 21.6 Add session attachment for Apply phase (attach to main OpenCode server)
- [ ] 21.7 Implement extra prompt handling during Apply phase (user can add additional context)

## 22. Ralph Integration - Apply Phase

- [ ] 22.1 Add ralph_opencode.mjs execution during Apply phase
- [ ] 22.2 Implement script path resolution (workspace relative or absolute)
- [ ] 22.3 Add script output capture and display in chat UI
- [ ] 22.4 Implement error handling for ralph execution failures
- [ ] 22.5 Add progress indication during ralph execution (streaming output)
- [ ] 22.6 Support passing extra prompts/context to ralph as arguments

## 23. Session Management - Enhanced

- [ ] 23.1 Implement session ID storage in workspace state after ACP connection
- [ ] 23.2 Add session validation (check if session is still active)
- [ ] 23.3 Implement session restoration logic on extension reload
- [ ] 23.4 Add session cleanup when change is archived
- [ ] 23.5 Support multiple concurrent sessions per workspace
- [ ] 23.6 Add session metadata tracking (change ID, phase, timestamp)

## 24. Chat Commands - Workflow Integration

- [ ] 24.1 Implement `/new` chat command to trigger New Change flow
- [ ] 24.2 Add `/ff` or `/fastforward` command for Fast Forward phase
- [ ] 24.3 Implement `/apply` command to trigger Apply with ralph
- [ ] 24.4 Add `/archive` command for archiving completed changes
- [ ] 24.5 Implement `/status` command to show current workflow phase
- [ ] 24.6 Add `/clear` command to reset chat history

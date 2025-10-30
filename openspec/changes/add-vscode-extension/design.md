## Context

The OpenSpec VS Code extension will integrate the OpenSpec command-line tool into the editor, providing developers with a seamless workflow for spec-driven development. This document outlines the architectural decisions, patterns, and trade-offs for building the extension.

The extension needs to:
- Work with existing OpenSpec directory structures without requiring changes
- Provide real-time updates as files change
- Scale to projects with 100+ changes and specifications
- Follow VS Code extension best practices for performance and UX

## Goals / Non-Goals

### Goals
- Provide a native VS Code experience for OpenSpec workflows
- Enable developers to view and navigate specs/changes without terminal commands
- Automatically reflect file system changes in the UI
- Maintain minimal performance impact on VS Code startup and runtime
- Support future extensibility (e.g., proposal generation, inline CodeLens)

### Non-Goals
- Running OpenSpec CLI commands directly (phase 1 focuses on read-only views)
- Editing specs/proposals within custom UI components (users edit markdown files directly)
- Syncing with remote repositories or version control integration (use existing VS Code Git)
- Creating a standalone spec editor outside VS Code

## Decisions

### Decision 1: Tree View vs Custom Webview for Explorer
**What:** Use VS Code's native TreeView API for the OpenSpec Explorer instead of a custom webview.

**Why:**
- TreeView provides built-in keyboard navigation, accessibility, and theme support
- Better performance for large datasets with lazy loading
- Consistent UX with other VS Code extensions (file explorer, outline view)
- Simpler state management compared to webview communication

**Alternatives Considered:**
- Custom webview: More flexibility but higher complexity, performance overhead, and accessibility challenges
- Quick Pick UI: Too transient, doesn't provide persistent navigation

### Decision 2: File System Watcher Strategy
**What:** Use VS Code's `FileSystemWatcher` API with glob patterns to monitor `openspec/**` directory.

**Why:**
- Built-in VS Code API with platform-optimized performance
- Automatic handling of file create/update/delete events
- No need for polling or external file system libraries

**Implementation Details:**
- Watch pattern: `**/openspec/{changes,specs}/**/*.md`
- Debounce refresh by 500ms to avoid excessive updates during rapid changes
- Dispose watcher on extension deactivation

**Alternatives Considered:**
- Node.js `chokidar`: External dependency, less integrated with VS Code
- Polling: Inefficient, higher resource usage

### Decision 3: Webview Architecture for Detailed View
**What:** Use a single webview panel that updates content based on selected change.

**Why:**
- Webviews allow rich HTML/CSS rendering mimicking `openspec view` output
- Can render markdown with proper formatting and syntax highlighting
- Single panel approach reduces resource usage vs. multiple panels

**Implementation Details:**
- Use `vscode.WebviewPanel` with `retainContextWhenHidden: true` for state preservation
- Communicate between extension and webview using message passing
- Load CSS/JS resources from extension's `media/` directory
- Use Content Security Policy to restrict script execution

**Alternatives Considered:**
- Native editor preview: Limited formatting capabilities
- Multiple webview panels: Higher memory usage
- Custom editor: Overkill for read-only view

### Decision 4: Data Parsing Strategy
**What:** Parse OpenSpec directory structure directly from file system using Node.js `fs` APIs.

**Why:**
- OpenSpec has well-defined directory structure (`changes/`, `specs/`, `archive/`)
- No need for OpenSpec CLI dependency for read operations
- Faster startup and refresh (no subprocess spawning)

**Implementation Details:**
- Use `fs.promises` for async/await file operations
- Parse markdown headers with regex for requirement counting
- Cache parsed data with invalidation on file changes

**Alternatives Considered:**
- Invoke `openspec` CLI with `--json` flag: Slower, requires CLI installation, subprocess overhead
- Use markdown parsing library: Overkill for simple header extraction

### Decision 5: Extension Activation Strategy
**What:** Activate on `onStartupFinished` plus custom `onView:openspecExplorer` activation event.

**Why:**
- `onStartupFinished`: Minimal startup impact, extension loads after VS Code is ready
- `onView:openspecExplorer`: Lazy activation when user clicks Activity Bar icon
- Combined approach balances discoverability and performance

**Implementation Details:**
```json
"activationEvents": [
  "onStartupFinished",
  "onView:openspecExplorer"
]
```

**Alternatives Considered:**
- `*` (always activate): Poor performance impact
- `workspaceContains:**/openspec`: Good but may miss late-initialized projects
- Only `onView`: Better performance but less discoverable

### Decision 6: Technology Stack
**What:** TypeScript + VS Code Extension API (no additional frameworks)

**Why:**
- TypeScript is standard for VS Code extensions (type safety, VS Code API typings)
- No need for React/Vue for simple tree views and webviews
- Minimal bundle size and dependencies
- Easier debugging and maintenance

**Dependencies:**
- VS Code Extension API (`vscode`)
- Markdown rendering library for webview (e.g., `marked` or `markdown-it`)
- Optional: `gray-matter` for frontmatter parsing if needed

## Risks / Trade-offs

### Risk 1: OpenSpec Directory Structure Changes
**Risk:** If OpenSpec CLI changes its directory structure or file formats, the extension will break.

**Mitigation:**
- Follow OpenSpec's documented directory structure conventions
- Add validation checks to detect unexpected structures
- Display user-friendly error messages with guidance
- Version the extension to match OpenSpec CLI versions

### Risk 2: Performance with Large Projects
**Risk:** Projects with 1000+ changes or specs may cause UI lag.

**Mitigation:**
- Implement lazy loading in tree view (load children on expand)
- Cache parsed data with smart invalidation
- Profile performance with large test projects
- Consider pagination or virtual scrolling if needed

### Risk 3: Webview Security
**Risk:** Loading external content or user-controlled markdown could introduce XSS vulnerabilities.

**Mitigation:**
- Use strict Content Security Policy
- Sanitize markdown rendering (disable inline HTML/scripts)
- Only load resources from extension's bundled media directory
- Validate all file paths before loading

### Risk 4: Cross-Platform Compatibility
**Risk:** File system operations may behave differently on Windows/Mac/Linux.

**Mitigation:**
- Use `path.join()` and `path.resolve()` for all paths
- Test on Windows, macOS, and Linux
- Use VS Code's URI APIs for file references
- Handle case-sensitive vs case-insensitive file systems

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────┐         ┌─────────────────────┐   │
│  │ Extension Entry │────────▶│  OpenSpec Explorer  │   │
│  │   (extension.ts)│         │  TreeDataProvider   │   │
│  └─────────────────┘         └─────────────────────┘   │
│           │                            │                │
│           │                            ▼                │
│           │                  ┌─────────────────────┐   │
│           │                  │  File System        │   │
│           │                  │  Watcher            │   │
│           │                  └─────────────────────┘   │
│           │                            │                │
│           │                            ▼                │
│           │                  ┌─────────────────────┐   │
│           ├─────────────────▶│  OpenSpec Parser    │   │
│           │                  │  (reads changes/    │   │
│           │                  │   specs directories)│   │
│           │                  └─────────────────────┘   │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐         ┌─────────────────────┐   │
│  │ Command Handlers│────────▶│  Webview Provider   │   │
│  │                 │         │  (detailed view)    │   │
│  └─────────────────┘         └─────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  openspec/ Directory │
          │  ├─ changes/         │
          │  │  ├─ active/       │
          │  │  └─ archive/      │
          │  ├─ specs/           │
          │  └─ project.md       │
          └──────────────────────┘
```

## Migration Plan

N/A - This is a new extension with no migration required.

## Open Questions

1. **Proposal Generation Workflow**: How should the "Generate Proposal" command work? Should it:
   - Open a multi-step wizard in a webview?
   - Use VS Code's built-in quick pick/input box prompts?
   - Launch a terminal command with interactive mode?
   
   **Resolution Strategy**: Start with terminal command in phase 1, add UI wizard in phase 2 based on user feedback.

2. **OpenSpec CLI Integration**: Should the extension eventually invoke OpenSpec CLI commands (validate, archive, etc.)?
   
   **Resolution Strategy**: Phase 1 is read-only. Phase 2 can add command execution if users request it.

3. **Multi-Workspace Support**: How should the extension behave in multi-root workspaces?
   
   **Resolution Strategy**: Phase 1 supports single workspace. Detect multiple `openspec/` directories in phase 2.

4. **Offline Documentation**: Should the extension bundle OpenSpec documentation for offline access?
   
   **Resolution Strategy**: Link to online docs initially, add bundled docs if network access is a common issue.

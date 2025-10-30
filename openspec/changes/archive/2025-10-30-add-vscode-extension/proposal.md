## Why

OpenSpec users currently rely solely on the command-line interface to manage specifications and changes. While functional, this creates context switching between the editor and terminal, reducing developer productivity. A VS Code extension that integrates OpenSpec directly into the editor will provide a seamless, Copilot-like experience for spec-driven development.

## What Changes

- Create VS Code extension with OpenSpec Explorer view in Activity Bar
- Add workspace initialization detection and welcome view for non-initialized projects
- Implement tree view displaying Changes (active/completed) and Specifications sections
- Add Command Palette integration for common OpenSpec operations
- Build detailed webview for rich visualization of change proposals (mimicking `openspec view`)
- Implement file system watcher for automatic UI refresh on openspec/ directory changes
- Provide performance-optimized extension with minimal startup impact

## Impact

- Affected specs: New capability - `vscode-extension`
- Affected code: New VS Code extension project structure
  - Extension entry point (extension.ts)
  - Tree view providers for Changes and Specifications
  - Webview panel for detailed change visualization
  - Command handlers and file system watchers
  - Extension manifest (package.json)
- User experience: Developers can manage OpenSpec workflow without leaving VS Code

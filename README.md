# OpenSpec VS Code Extension

A VS Code extension that integrates OpenSpec spec-driven development workflow directly into the editor.

## Features

- **OpenSpec Explorer**: Tree view in Activity Bar to browse changes and specifications
- **Workspace Detection**: Automatically detects OpenSpec-initialized workspaces
- **Real-time Updates**: File system watcher for automatic UI refresh
- **Detailed View**: Rich webview for viewing change proposals and tasks
- **Command Palette Integration**: Quick access to OpenSpec commands
- **Performance Optimized**: Minimal startup impact and lazy loading

## Requirements

- VS Code 1.74.0 or higher
- OpenSpec CLI tool (for workspace initialization)

## Extension Settings

This extension contributes the following settings:

* `openspec.path`: Path to the OpenSpec CLI executable (optional)

## Known Issues

None currently

## Release Notes

### 0.0.1

Initial release with core functionality:
- OpenSpec Explorer view
- Workspace initialization detection
- File system watching
- Detailed view webview
- Command palette integration

## Working with this Extension

1. **Open a workspace with OpenSpec**: The extension will automatically activate and show the OpenSpec Explorer
2. **Initialize a new workspace**: If no `openspec/` directory is found, use the welcome view to initialize
3. **Browse changes and specs**: Use the tree view to navigate your OpenSpec project
4. **View details**: Click on any change to see detailed information in the webview

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

```bash
npm run pretest
npm run test
```

### Publishing

```bash
npm install -g @vscode/vsce
vsce package
vsce publish
```
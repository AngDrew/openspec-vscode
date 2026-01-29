# OpenSpec VS Code Extension Changelog

All notable changes to the OpenSpec VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of OpenSpec VS Code extension
- OpenSpec Explorer tree view in Activity Bar
- Workspace initialization detection
- File system watcher for automatic UI refresh
- Detailed view webview for change proposals
- Command Palette integration with OpenSpec commands
- Performance optimizations with caching
- Comprehensive error handling and user feedback
- Basic test suite

### Changed
- Nothing yet

### Fixed
- Nothing yet

## [0.0.1] - 2024-01-XX

### Added
- **OpenSpec Explorer**: Tree view displaying Changes and Specifications sections
- **Workspace Detection**: Automatic detection of OpenSpec-initialized workspaces
- **Welcome View**: Guidance for uninitialized workspaces
- **File System Watching**: Real-time UI updates on openspec/ directory changes
- **Detailed View**: Rich webview for viewing change proposals and tasks
- **Command Palette Integration**: Commands for viewing details, listing changes, and generating proposals
- **Performance Optimizations**: Caching system and lazy loading for large projects
- **Error Handling**: Comprehensive error reporting with output channel
- **Theme Support**: Respects VS Code's light/dark theme preferences
- **Keyboard Shortcuts**: Ctrl+Shift+O (Cmd+Shift+O) for listing changes

### Features
- Browse active and completed changes
- View specifications with requirement counts
- Open spec files directly from the explorer
- View detailed change information in a dedicated webview
- Automatic refresh when files change
- Minimal startup impact with async initialization

### Technical Details
- Built with TypeScript for type safety
- Uses VS Code Extension API for native integration
- Implements proper caching strategies for performance
- Includes comprehensive error handling and logging
- Follows VS Code extension best practices

### Known Limitations
- Read-only view (does not modify OpenSpec files)
- Single workspace support (multi-root workspaces not supported)
- No direct OpenSpec CLI integration (phase 2 feature)
- No proposal generation UI (terminal-based only in phase 1)
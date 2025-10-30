# Project Context

## Purpose
OpenSpec VS Code Extension is a Visual Studio Code extension that integrates OpenSpec spec-driven development workflow directly into the editor. It provides a tree view interface to browse changes and specifications, automatically detects OpenSpec-initialized workspaces, and offers real-time updates through file system watching. The extension aims to streamline the spec-driven development process by bringing OpenSpec functionality directly into the developer's IDE.

## Tech Stack
- **TypeScript**: Primary language for the extension development
- **VS Code Extension API**: Core framework for building VS Code extensions
- **Node.js**: Runtime environment
- **Marked**: Markdown parsing library for rendering spec content
- **Mocha**: Testing framework
- **ESLint**: Code linting with TypeScript-specific rules

## Project Conventions

### Code Style
- TypeScript with strict mode enabled
- ESLint configuration with TypeScript-specific rules
- ES2020 target with CommonJS modules
- Consistent casing for file names
- Unused variables prefixed with underscore (_)
- Explicit 'any' types are discouraged (marked as warnings)

### Architecture Patterns
- **Provider Pattern**: Tree data providers for VS Code explorer views
- **Command Pattern**: Centralized command registration and handling
- **Observer Pattern**: File system watchers for automatic UI updates
- **Singleton Pattern**: Cache manager for performance optimization
- **Error Handling**: Centralized error handling with output channel
- **Separation of Concerns**: Organized into providers, utils, and types directories

### Testing Strategy
- Mocha testing framework for unit tests
- Test files located in test/suite/ directory
- Tests cover extension activation, command registration, and core functionality
- Pre-test compilation with TypeScript
- Tests run against the compiled JavaScript output

### Git Workflow
- No specific branching strategy documented in the project
- Commits should follow conventional commit format (implied by changelog structure)
- Version follows semantic versioning (currently at 0.0.4)

## Domain Context
OpenSpec is a spec-driven development workflow tool that helps teams:
- Create and manage change proposals with detailed specifications
- Track implementation tasks related to specifications
- Maintain a structured approach to feature development
- Bridge the gap between specification and implementation

The extension integrates with OpenSpec's file structure:
- `openspec/changes/`: Directory for change proposals
- `openspec/specs/`: Directory for specifications
- `openspec/project.md`: Project context and configuration

## Important Constraints
- VS Code 1.74.0 or higher required
- Extension must have minimal startup impact
- File system operations should be debounced to prevent excessive refreshes
- Cache invalidation required when files change
- Extension must handle cases where OpenSpec CLI is not installed

## External Dependencies
- **VS Code Extension API**: Core dependency for extension functionality
- **OpenSpec CLI**: External tool for workspace initialization (optional dependency)
- **Marked library**: For parsing and rendering markdown content in specifications
- **Node.js APIs**: For file system operations and utilities

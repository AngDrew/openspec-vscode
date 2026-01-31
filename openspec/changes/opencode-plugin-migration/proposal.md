# Proposal: OpenSpec OpenCode Plugin

## Overview

Port the OpenSpec VS Code extension functionality into an OpenCode plugin that provides agent skills and custom tools for spec-driven development workflows.

## Current State

The openspec-vscode extension provides:
- Tree view explorer for changes/specs in Activity Bar
- Webview details panel for viewing change artifacts
- Commands for: init, new change, fast-forward, apply (Ralph loop), archive
- File system watcher for auto-refresh
- Integration with OpenCode server on port 4099

## Problem

Users must use VS Code to access OpenSpec features. There's no native OpenCode integration for:
- Listing and viewing OpenSpec changes from within OpenCode
- Running the Ralph loop without VS Code
- Managing the OpenSpec workflow from the terminal/TUI

## Solution

Create `opencode-openspec` - an npm package plugin that:
1. Exposes 7 agent skills for different OpenSpec workflows
2. Provides 7 custom tools for programmatic access
3. Works entirely within OpenCode (no external server management)
4. Uses on-demand scanning (no file watching)
5. Runs the Ralph loop as a plugin tool

## Goals

1. **Feature Parity**: Match all VS Code extension functionality
2. **Native Integration**: Feel like a native OpenCode feature
3. **Agent-First**: Designed for AI agent interaction via skills
4. **Tool Access**: Also available as custom tools for scripts/automation
5. **No Dependencies**: Works with existing OpenCode session (no port 4099 checks)

## Success Criteria

- [ ] Can list all changes and specs via skill or tool
- [ ] Can view change details (proposal, design, tasks)
- [ ] Can initialize new OpenSpec workspace
- [ ] Can create new change with proper scaffolding
- [ ] Can fast-forward scaffold-only changes
- [ ] Can apply changes via Ralph loop with batching
- [ ] Can archive completed changes
- [ ] Published to npm as `opencode-openspec`
- [ ] Comprehensive README with examples

## Out of Scope

- File system watching (not needed, on-demand scanning)
- OpenCode server management (plugin runs inside OpenCode)
- VS Code extension features (this is the replacement)
- GUI/webview interface (TUI-based only)

## Timeline

Estimated 3-4 days of focused development work.

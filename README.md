# OpenSpec VS Code Extension

A VS Code extension that integrates the OpenSpec spec‑driven development workflow into the editor, with a strong focus on CLI workflows over GUI automation.

## Overview

This extension adds an **OpenSpec** view to the VS Code Activity Bar so you can:

- Browse active and completed OpenSpec changes
- Browse capabilities/specifications
- Open a rich detail view for a selected change
- Trigger CLI‑driven workflows (Apply, Archive) from the explorer

The extension intentionally favors the CLI (via `opencode` and `openspec`) rather than re‑implementing those flows in a GUI. When you press Apply or Archive, it shells out to your configured command templates.

## Prerequisites

You should have the following installed and available on your `PATH`:

- **VS Code** `1.74.0` or higher
- **OpenSpec CLI** (for initializing and managing OpenSpec workspaces)
- **opencode CLI** (for handling `/openspec-apply` and `/openspec-archive` prompts)

The extension assumes:

- `openspec` can be run in a VS Code integrated terminal
- `opencode` can be run in a VS Code integrated terminal

## Installation

You can use this extension in two ways:

### From Marketplace (when published)

- Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
- Search for `OpenSpec VSCode`
- Install the extension and reload VS Code

### From VSIX

If you have a `.vsix` file (for example, `openspec-vscode-0.0.5.vsix` in this repo):

1. In VS Code, open the command palette: `Ctrl+Shift+P` / `Cmd+Shift+P`
2. Run `Extensions: Install from VSIX...`
3. Select the `openspec-vscode-0.0.x.vsix` file
4. Reload VS Code when prompted

## Setting Up an OpenSpec Workspace

1. **Open a folder** that either:
   - Already contains an `openspec/` directory  
   - Or is where you want to initialize OpenSpec

2. If OpenSpec is **not** initialized:
   - The **OpenSpec** view will show a welcome message
   - Click the "Initialize OpenSpec" link or run the command:
     - `OpenSpec: Initialize Workspace` (runs `openspec init` in a terminal)

3. Once initialized, the extension will:
   - Detect the `openspec/` directory
   - Set the `openspec:initialized` context
   - Show the **OpenSpec Explorer** tree

## Using the Extension

### OpenSpec Explorer

In the Activity Bar, select the **OpenSpec** icon to open the OpenSpec Explorer.

The explorer shows:

- **Changes**
  - `Active Changes (N)` – current change directories under `openspec/changes/` (excluding `archive/`)
  - `Completed Changes (M)` – archived change directories under `openspec/changes/archive/`
- **Specifications**
  - Each capability under `openspec/specs/[capability]/spec.md`
  - Labels include the number of requirements per spec

Selecting items:

- **Change item** (active or completed)
  - Single‑click: opens a rich detail webview showing proposal, tasks, and files
- **Spec item**
  - Single‑click: opens `spec.md` in the editor

### Change Detail View

When you click an individual change, the extension opens a **detail webview** that:

- Displays `proposal.md` (if present) as rendered markdown
- Displays `tasks.md` (if present) as rendered markdown
- Lists other files under the change folder with collapsible previews
- Supports markdown rendering for `.md` files, and code‑block display for non‑markdown files

The detail view is for **inspection and navigation only**. It does not perform Apply/Archive operations itself. Those actions are intentionally kept in the explorer to keep the workflow CLI‑driven.

### Apply and Archive (CLI‑first behavior)

Apply and Archive actions live in the **side menu** (OpenSpec Explorer), not in the detail view.

For each **active change** item, you'll see inline icons:

- **Apply Change** (check icon)
- **Archive Change** (archive icon)

When you click:

- **Apply Change**
  - Runs the `openspec.applyCommandTemplate` in a VS Code terminal
  - By default:
    - `opencode --prompt "/openspec-apply"`
- **Archive Change**
  - Runs the `openspec.archiveCommandTemplate` in a VS Code terminal
  - The `$changes` placeholder is replaced with the change ID (folder name)
  - By default:
    - `opencode --prompt "/openspec-archive $changes"`

Example for a change with ID `horizontal-summary-layout`:

- Apply:
  - `opencode --prompt "/openspec-apply"`
- Archive:
  - `opencode --prompt "/openspec-archive horizontal-summary-layout"`

This design means:

- The extension **does not** implement apply/archive logic itself
- It **delegates** to your CLI tools (`opencode` + `openspec`), so you keep full control over prompts, flows, and behavior
- You can customize the templates to fit your own scripts or aliases

## Configuration

This extension contributes the following settings (in VS Code Settings under "OpenSpec"):

### `openspec.applyCommandTemplate`

- **Type**: `string`
- **Default**: `opencode --prompt "/openspec-apply"`
- **Description**:  
  Command template to run when **Apply** is pressed in the OpenSpec Explorer.

The special placeholder:

- `$changes` – replaced with the selected change ID (e.g., `horizontal-summary-layout`)

Although the default does not include `$changes`, you can add it if your `/openspec-apply` prompt expects it. For example:

```jsonc
"openspec.applyCommandTemplate": "opencode --prompt \"/openspec-apply $changes\""
```

### `openspec.archiveCommandTemplate`

- **Type**: `string`
- **Default**: `opencode --prompt "/openspec-archive $changes"`
- **Description**:  
  Command template to run when **Archive** is pressed in the OpenSpec Explorer.

This default is equivalent to:

```bash
opencode --prompt "/openspec-archive horizontal-summary-layout"
```

for a change named `horizontal-summary-layout`.

You can customize it to match your own workflow, for example:

```jsonc
"openspec.archiveCommandTemplate": "opencode --prompt \"my-custom-archive-prompt $changes\""
```

## Known Issues and Limitations

- The extension is intentionally **CLI‑first**:
  - It does not provide GUI wizards for applying or archiving changes.
  - It assumes your CLI tooling (`opencode`, `openspec`) is installed and working.
- Large files in the detail view are truncated or rejected to keep the webview responsive.

See `CHANGELOG.md` for detailed version‑by‑version changes.

## Working with this Extension

1. Open a workspace containing an `openspec/` directory, or initialize one.
2. Open the **OpenSpec** view in the Activity Bar.
3. Browse **Active Changes** and **Completed Changes**.
4. Click a change to open its detail view with proposal, tasks, and file previews.
5. Use the inline icons on an active change to:
   - **Apply** (runs `opencode --prompt "/openspec-apply"` by default)
   - **Archive** (runs `opencode --prompt "/openspec-archive $changes"` by default)

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

### Packaging / Publishing

```bash
npm install -g @vscode/vsce

# Package
vsce package

# Publish (requires publisher and token configured)
vsce publish
```

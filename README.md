# OpenSpec VS Code Extension

[![Version](https://img.shields.io/badge/version-1.0.0-informational.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/vscode-%5E1.74.0-007ACC.svg)](https://code.visualstudio.com/)

A VS Code extension that brings an OpenSpec-style, spec-driven workflow into the editor: browse changes/specs, inspect artifacts in a rich webview, and trigger CLI-first automation through OpenSpec + OpenCode.

## IMPORTANT: OpenCode-only (Currently no support for all other agentic tools like claude code / codex / gemini cli)

### THIS PROJECT IS BUILT FOR OPENCODE ONLY.

- Not supported: Claude Code, Codex CLI, Gemini CLI, or other “agentic” CLIs/runners.
- The `Apply Change` action is wired to the built-in `ralph_opencode.mjs` task loop automatically and efficiently and improved accuracy to 90% (tested and proven)
  - It iterates `openspec/changes/<changeId>/tasks.md` one task at a time using OpenCode skills.
  - If you are not using OpenCode, the apply workflow in this extension is not expected to work.

## What the project does

This extension contributes an **OpenSpec** Activity Bar container with:

- **OpenSpec Explorer** tree: active changes, archived changes, and workspace specs.
- **Change details webview**: renders `proposal.md`, `design.md`, `tasks.md`, and previews other files in a change folder.
- **CLI-first actions**: start an OpenCode server, fast-forward scaffold-only changes, and apply a change using a bundled runner script.

The extension is intentionally not a GUI "wizard" for the workflow. Instead, it makes the OpenSpec/OpenCode loop convenient from inside VS Code while keeping the source of truth in your repository and CLI tools.

## Why the project is useful

- **Faster navigation**: jump between changes and specs without hunting through folders.
- **Artifact visibility**: read proposals/tasks/spec deltas in a focused, rendered view.
- **Automation without lock-in**: actions run in the integrated terminal, so you can see logs and tweak your CLI setup.
- **Safer by default**: the extension itself does not directly edit your OpenSpec files; it delegates changes to your tooling.

## How users can get started

### Prerequisites

- VS Code `^1.74.0`
- An OpenSpec-initialized workspace (or the ability to run `openspec init`)
- CLI tools available in your terminal:
  - `openspec` (workspace initialization, listing changes)
  - `opencode` (OpenCode server + skills-based task execution)

Note: the bundled runner script can fall back to `npx -y opencode-ai@1.1.40` if `opencode` is not on your PATH (see `ralph_opencode.mjs`).

### Install (from source / local development)

```bash
npm install
npm run compile
```

Then open this repo in VS Code and run the extension in an Extension Development Host (typically `F5`).

### Package a VSIX

```bash
npm install
npm run vscode:prepublish
npx vsce package
```

Install the resulting `.vsix` via `Extensions: Install from VSIX...`.

### Usage

1. Open a folder that contains `openspec/` at the workspace root.
   - If the workspace is not initialized yet, run `OpenSpec: Initialize` (runs `openspec init` in a terminal).
2. Open the **OpenSpec** view from the Activity Bar.
3. Browse:
   - `openspec/changes/<changeId>/` (active)
   - `openspec/changes/archive/<changeId>/` (completed)
   - `openspec/specs/<capability>/spec.md` (workspace specs)
4. Click a change to open the **details webview**.

#### Start OpenCode (optional but recommended)

Run the command `OpenSpec: Start OpenCode Server`.

This starts:

```bash
opencode serve --port 4099 --print-logs
```

You can open the UI in your browser with `OpenSpec: Open OpenCode UI`.

#### Apply a change (task loop)

In the **OpenSpec Explorer** view, use the inline **Apply Change** action on an active change. This runs the bundled task runner `ralph_opencode.mjs` in a dedicated terminal and iterates through `openspec/changes/<changeId>/tasks.md` one task at a time using the `openspec-apply-change` skill.

If you want to run it manually:

```bash
node ralph_opencode.mjs --attach http://localhost:4099 --change your-change-id
```

#### Fast-forward scaffold-only changes

If a change folder contains only `.openspec.yaml` (and optionally an empty `specs/`), the explorer shows a **Fast-Forward Change** action. It runs a prompt like:

```bash
opencode --prompt "use openspec ff skill to populate your-change-id"
```

#### Archive a change

Use the inline **Archive Change** action. The extension will best-effort check whether `tasks.md` has any unchecked items and then delegates the archive flow to OpenCode.

### Configuration

- Port: the OpenCode server integration assumes `http://localhost:4099`.
- Settings in `package.json` include `openspec.applyCommandTemplate` and `openspec.archiveCommandTemplate`, but the current implementation primarily uses the built-in OpenCode runner/skill prompts rather than templated shell commands.

## Roadmap

- Support running more tasks per `ralph_opencode.mjs` loop.

## Where users can get help

- [`CHANGELOG.md`](CHANGELOG.md) for notable changes and release notes.
- VS Code Output panel: the extension logs to the `OpenSpec Extension` output channel.
- Command: `OpenSpec: Show Output` (command id: `openspec.showOutput`).
- Open an issue in this repository for bugs/feature requests.
- OpenCode/OpenSpec tooling reference: https://github.com/sst/opencode
- If something fails, check that:
  - your workspace has `openspec/` at the root
  - `openspec` and `opencode` resolve in the integrated terminal
  - the OpenCode server is listening on port `4099`

## Who maintains and contributes

- Maintainer: `AngDrew` (publisher listed in `package.json`).
- Contributions: see [`CONTRIBUTING.md`](CONTRIBUTING.md).
- License: MIT (see [`LICENSE`](LICENSE)).

import * as vscode from 'vscode';
import * as path from 'path';

import { Commands } from '../constants/commands';
import { WorkspaceUtils } from '../utils/workspace';
import { ErrorHandler } from '../utils/errorHandler';
import { ExtensionRuntimeState } from './runtime';

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureLocalOpenCodeServerReady(timeoutMs: number = 15000): Promise<boolean> {
  try {
    const alreadyListening = await WorkspaceUtils.isOpenCodeServerListening();
    if (alreadyListening) {
      return true;
    }

    // Use the same behavior as the explicit start button.
    await vscode.commands.executeCommand(Commands.opencodeStartServer);

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await WorkspaceUtils.isOpenCodeServerListening(500)) {
        return true;
      }
      await sleep(500);
    }

    return false;
  } catch {
    return false;
  }
}

function pickNodeCommand(): string {
  const base = path.basename(process.execPath).toLowerCase();
  if (base === 'node' || base === 'node.exe') {
    return process.execPath;
  }
  // Fallback to PATH resolution (eg. user shell / remote environment).
  return 'node';
}

export function registerCommands(context: vscode.ExtensionContext, runtime: ExtensionRuntimeState): void {
  // View details command
  const viewDetailsCommand = vscode.commands.registerCommand(Commands.viewDetails, (item) => {
    if (!runtime.webviewProvider) {
      vscode.window.showErrorMessage('OpenSpec details panel is not available yet');
      return;
    }

    if (item && item.path) {
      runtime.webviewProvider.showDetails(item);
    } else {
      vscode.window.showWarningMessage('No change selected');
    }
  });

  // List changes command (refresh)
  const listChangesCommand = vscode.commands.registerCommand(Commands.listChanges, () => {
    runtime.explorerProvider?.refresh();
    vscode.commands.executeCommand(Commands.explorerFocus);
  });

  // Apply change command
  const applyChangeCommand = vscode.commands.registerCommand(Commands.applyChange, async (item) => {
    if (!item || !item.label) {
      vscode.window.showWarningMessage('No change selected');
      return;
    }

    // Check tasks.md format before proceeding
    if (typeof item.path === 'string') {
      try {
        const validation = await WorkspaceUtils.validateTasksFormat(item.path);

        if (!validation.isValid) {
          // Tasks file exists but format is invalid or has no valid tasks
          const changeId = item.label;
          const terminalName = `OpenSpec Fix Format: ${changeId}`;
          const terminal = vscode.window.createTerminal({ name: terminalName });
          terminal.show(true);

          const fixPrompt =
            `The tasks.md file at openspec/changes/${changeId}/tasks.md has an incompatible format or contains no valid tasks. ` +
            'Please convert it to the OpenSpec standard format:\n\n' +
            'FORMAT TEMPLATE:\n' +
            '## 1. [Section Title]\n\n' +
            '- [x] 1.1 [First task description]\n' +
            '- [ ] 1.2 [Second task description]\n' +
            '- [ ] 1.3 [Completed task description]\n\n' +
            '## 2. [Another Section]\n\n' +
            '- [ ] 2.1 [Task description]\n' +
            '- [ ] 2.2 [Task description]\n\n' +
            'RULES:\n' +
            '- Use section headers: "## [number]. [Title]" (e.g., "## 1. Runner CLI")\n' +
            '- Use checkbox format: "- [ ] [id] [description]" for pending, "- [x] [id] [description]" for completed\n' +
            '- Task IDs must follow hierarchical numbering: 1.1, 1.2, 2.1, 2.2, etc.\n' +
            '- One blank line between sections\n' +
            '- Preserve ALL original task content and meaning—only restructure the format\n' +
            '- Do not add, remove, or modify the substance of any task\n\n' +
            `Please read the file at openspec/changes/${changeId}/tasks.md and rewrite it in this format.`;

          terminal.sendText(`opencode --prompt ${JSON.stringify(fixPrompt)}`, true);
          return; // Exit without proceeding to ralph_opencode.mjs
        }
      } catch (error) {
        ErrorHandler.handle(error as Error, 'Failed to validate tasks format', true);
        // Continue anyway - let the runner handle any issues
      }
    }

    try {
      const tasksPerRun = await vscode.window.showInputBox({
        title: 'OpenSpec: Apply Change',
        prompt: 'Tasks to include per OpenCode run (batch size)',
        value: '1',
        placeHolder: '1',
        validateInput: (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            return 'Enter an integer >= 1';
          }
          if (!/^\d+$/.test(trimmed)) {
            return 'Enter an integer >= 1';
          }
          const n = Number(trimmed);
          if (!Number.isSafeInteger(n) || n < 1) {
            return 'Enter an integer >= 1';
          }
          return null;
        }
      });

      // User cancelled (ESC) or dismissed the input.
      if (!tasksPerRun) {
        return;
      }

      const count = Number(tasksPerRun.trim());

      const ready = await ensureLocalOpenCodeServerReady();
      if (!ready) {
        vscode.window.showErrorMessage(
          'OpenCode server is not responding on port 4099. It may still be starting; check the "OpenCode Server" terminal.'
        );
        return;
      }

      // Apply is the Ralph loop: generate runner and run attached.
      // This mirrors the spec behavior (task loop parity) using the cross-platform script.
      await vscode.commands.executeCommand(Commands.opencodeRunRunnerAttached, {
        url: 'http://localhost:4099',
        changeId: item.label,
        count
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start Ralph runner: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Fast-forward scaffold-only change (create artifacts)
  const fastForwardChangeCommand = vscode.commands.registerCommand(Commands.ffChange, async (item) => {
    if (!item || !item.label || typeof item.path !== 'string') {
      vscode.window.showWarningMessage('No change selected');
      return;
    }

    const changeId = item.label;
    const isActive = item?.metadata?.isActive === true;
    if (!isActive) {
      vscode.window.showWarningMessage('Fast-forward only applies to active changes');
      return;
    }

    const hasNoTasks = item?.metadata?.hasNoTasks === true;
    if (!hasNoTasks) {
      vscode.window.showWarningMessage('Fast-forward is only available when there are no tasks yet');
      return;
    }

    try {
      const ready = await ensureLocalOpenCodeServerReady();
      if (!ready) {
        vscode.window.showErrorMessage(
          'OpenCode server is not responding on port 4099. It may still be starting; check the "OpenCode Server" terminal.'
        );
        return;
      }

      const terminalName = `OpenSpec FF: ${changeId}`;
      const terminal = vscode.window.createTerminal({ name: terminalName });
      terminal.show(true);

      const prompt = `use openspec ff skill to populate ${changeId}`;
      terminal.sendText(`opencode run --attach localhost:4099 --continue ${JSON.stringify(prompt)}`, true);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start fast-forward flow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Archive change command
  const archiveChangeCommand = vscode.commands.registerCommand(Commands.archiveChange, async (item) => {
    if (!item || !item.label) {
      vscode.window.showWarningMessage('No change selected');
      return;
    }

    // Extract the change ID from the label (folder name in kebab case)
    const changeId = item.label;

    try {
      const terminalName = `OpenSpec Archive: ${changeId}`;
      const terminal = vscode.window.createTerminal({ name: terminalName });
      terminal.show(true);

      let tasksStatusLine = 'Tasks: unknown';
      try {
        const tasksPath = typeof item.path === 'string' ? path.join(item.path, 'tasks.md') : '';
        if (tasksPath && await WorkspaceUtils.fileExists(tasksPath)) {
          const content = await WorkspaceUtils.readFile(tasksPath);
          const unchecked = (content.match(/^- \[ \] /gm) || []).length;
          tasksStatusLine = unchecked === 0
            ? 'Tasks: completed'
            : `Tasks: NOT completed (${unchecked} unchecked)`;
          if (unchecked > 0) {
            vscode.window.showWarningMessage(`${changeId}: ${tasksStatusLine}`);
          } else {
            vscode.window.showInformationMessage(`${changeId}: ${tasksStatusLine}`);
          }
        }
      } catch {
        // best-effort
      }

      // User-requested archive prompt content (delegated to opencode).
      const prompt =
        'use openspec skill to archive the changes, use question tools when there is multiple spec. let the user know if the tasks is completed or not. '
        + `Change: ${changeId}. ${tasksStatusLine}.`;

      // Feed opencode a direct prompt. (Matches existing extension pattern of delegating workflows to opencode.)
      terminal.sendText(`opencode --prompt ${JSON.stringify(prompt)}`, true);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start archive flow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Start OpenCode server command
  const startOpenCodeServerCommand = vscode.commands.registerCommand(Commands.opencodeStartServer, async () => {
    try {
      const alreadyListening = await WorkspaceUtils.isOpenCodeServerListening();
      if (alreadyListening) {
        // If we have (or can find) the terminal, reveal it for convenience.
        const existing = vscode.window.terminals.find(t => t.name === 'OpenCode Server');
        existing?.show(true);
        vscode.window.showInformationMessage('OpenCode server already running on port 4099');
        return;
      }

      // Reuse an existing terminal if it still exists; otherwise create a new one.
      if (runtime.openCodeServerTerminal && !vscode.window.terminals.includes(runtime.openCodeServerTerminal)) {
        runtime.openCodeServerTerminal = undefined;
      }

      if (!runtime.openCodeServerTerminal) {
        runtime.openCodeServerTerminal = vscode.window.terminals.find(t => t.name === 'OpenCode Server')
          ?? vscode.window.createTerminal({ name: 'OpenCode Server' });
      }

      runtime.openCodeServerTerminal.show(true);
      // `--print-logs` makes failures visible in the terminal.
      runtime.openCodeServerTerminal.sendText('opencode serve --port 4099 --print-logs', true);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start OpenCode server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Open OpenCode UI (http://localhost:4099) in default browser
  const openOpenCodeUiCommand = vscode.commands.registerCommand(Commands.opencodeOpenUi, async () => {
    try {
      const url = vscode.Uri.parse('http://localhost:4099');
      await vscode.env.openExternal(url);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to open OpenCode UI: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // OpenCode: load "openspec new change" skill prompt
  const newChangeCommand = vscode.commands.registerCommand(Commands.opencodeNewChange, async () => {
    try {
      const prompt = 'load openspec new change skill';

      const terminalName = 'OpenSpec New Change';
      const terminal = vscode.window.createTerminal({ name: terminalName });
      terminal.show(true);
      terminal.sendText(
        `opencode --agent plan --prompt ${JSON.stringify(prompt)}`,
        true
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start new change flow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Runner script is bundled with the extension (no workspace writes)
  const generateRunnerScriptCommand = vscode.commands.registerCommand(Commands.opencodeGenerateRunnerScript, async () => {
    const sourceUri = vscode.Uri.joinPath(context.extensionUri, 'ralph_opencode.mjs');

    try {
      await vscode.workspace.fs.stat(sourceUri);

      const selection = await vscode.window.showInformationMessage(
        'Ralph runner is bundled with the extension (no workspace files created).',
        'Open Bundled File',
        'Reveal in Explorer'
      );

      if (selection === 'Open Bundled File') {
        await vscode.window.showTextDocument(sourceUri, { preview: false });
      } else if (selection === 'Reveal in Explorer') {
        await vscode.commands.executeCommand('revealFileInOS', sourceUri);
      }
    } catch (error) {
      ErrorHandler.handle(error as Error, 'Failed to locate bundled runner script');
      vscode.window.showErrorMessage(
        `Failed to generate runner script: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Generate runner script and run it attached to OpenCode
  const runRunnerAttachedCommand = vscode.commands.registerCommand(
    Commands.opencodeRunRunnerAttached,
    async (attachUrl?: unknown) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder found');
        return;
      }

      let url = 'http://localhost:4099';
      let changeId = '';
      let count: number | undefined;
      if (typeof attachUrl === 'string' && attachUrl.trim().length > 0) {
        url = attachUrl.trim();
      } else if (attachUrl && typeof attachUrl === 'object') {
        const payload = attachUrl as Record<string, unknown>;
        const maybeUrl = payload.url;
        const maybeChangeId = payload.changeId;
        const maybeCount = payload.count;
        if (typeof maybeUrl === 'string' && maybeUrl.trim().length > 0) {
          url = maybeUrl.trim();
        }
        if (typeof maybeChangeId === 'string' && maybeChangeId.trim().length > 0) {
          changeId = maybeChangeId.trim();
        }

        if (typeof maybeCount === 'number') {
          count = maybeCount;
        } else if (typeof maybeCount === 'string') {
          const trimmed = maybeCount.trim();
          if (/^\d+$/.test(trimmed)) {
            count = Number(trimmed);
          }
        }

        if (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) {
          count = undefined;
        }
      }

      // If we're attaching to the local default server, ensure it's actually running first.
      try {
        const parsed = new URL(url);
        const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
        const isDefaultPort = (parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80)) === 4099;
        if (isLocalHost && isDefaultPort) {
          const ready = await ensureLocalOpenCodeServerReady();
          if (!ready) {
            vscode.window.showErrorMessage(
              'OpenCode server is not responding on port 4099. It may still be starting; check the "OpenCode Server" terminal.'
            );
            return;
          }
        }
      } catch {
        // If URL parsing fails, proceed without auto-starting.
      }

      const workspaceRoot = workspaceFolders[0].uri;
      const runnerUri = vscode.Uri.joinPath(context.extensionUri, 'ralph_opencode.mjs');

      try {
        await vscode.workspace.fs.stat(runnerUri);

        // Create a dedicated terminal that directly executes Node with args.
        // This avoids shell-specific quoting issues across cmd.exe / PowerShell / bash.
        if (runtime.openCodeRunnerTerminal) {
          runtime.openCodeRunnerTerminal.dispose();
        }

        const nodeCmd = pickNodeCommand();
        const args: string[] = [runnerUri.fsPath, '--attach', url];
        if (changeId) {
          args.push('--change', changeId);
        }
        if (count !== undefined) {
          args.push('--count', String(count));
        }

        // Provide a sane default for environments where `opencode` isn't on PATH.
        // The runner will attempt direct `opencode` first, then fall back to `npx -y opencode-ai@1.1.44`.
        const env = {
          ...process.env,
          OPENCODE_NPX_PKG: process.env.OPENCODE_NPX_PKG || 'opencode-ai@1.1.44'
        };

        runtime.openCodeRunnerTerminal = vscode.window.createTerminal({
          name: 'OpenCode Runner',
          cwd: workspaceRoot.fsPath,
          shellPath: nodeCmd,
          shellArgs: args,
          env
        });

        runtime.openCodeRunnerTerminal.show(true);
      } catch (error) {
        ErrorHandler.handle(error as Error, 'Failed to run runner script');
        vscode.window.showErrorMessage(
          `Failed to run runner script: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );

  // Generate proposal command
  const generateProposalCommand = vscode.commands.registerCommand(Commands.generateProposal, async () => {
    const changeId = await vscode.window.showInputBox({
      prompt: 'Enter a change ID (kebab-case, verb-led)',
      placeHolder: 'add-new-feature',
      validateInput: (value) => {
        if (!value) return 'Change ID is required';
        if (!/^[a-z][a-z0-9-]+$/.test(value)) {
          return 'Use kebab-case, starting with a letter';
        }
        return null;
      }
    });

    if (!changeId) {
      return;
    }

    const commandText = `openspec create-proposal ${changeId}`;
    const choice = await vscode.window.showInformationMessage(
      `Ready to run: ${commandText}`,
      'Run in Terminal',
      'Copy Command'
    );

    if (choice === 'Run in Terminal') {
      const terminal = vscode.window.createTerminal({ name: 'OpenSpec' });
      terminal.show(true);
      terminal.sendText(commandText, true);
    } else if (choice === 'Copy Command') {
      await vscode.env.clipboard.writeText(commandText);
      vscode.window.showInformationMessage('Command copied to clipboard');
    }
  });

  // Initialize workspace command
  const initCommand = vscode.commands.registerCommand(Commands.init, async () => {
    const terminal = vscode.window.createTerminal({ name: 'OpenSpec Init' });
    terminal.show(true);
    terminal.sendText('openspec init', true);
    vscode.window.showInformationMessage('Initialized terminal with `openspec init`');
  });

  // Show output command
  const showOutputCommand = vscode.commands.registerCommand(Commands.showOutput, () => {
    ErrorHandler.showOutputChannel();
  });

  context.subscriptions.push(
    viewDetailsCommand,
    listChangesCommand,
    applyChangeCommand,
    fastForwardChangeCommand,
    archiveChangeCommand,
    startOpenCodeServerCommand,
    openOpenCodeUiCommand,
    newChangeCommand,
    generateRunnerScriptCommand,
    runRunnerAttachedCommand,
    generateProposalCommand,
    initCommand,
    showOutputCommand
  );
}

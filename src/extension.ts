import * as vscode from 'vscode';
import * as path from 'path';
import { OpenSpecExplorerProvider } from './providers/explorerProvider';
import { OpenSpecWebviewProvider } from './providers/webviewProvider';
import { WorkspaceUtils } from './utils/workspace';
import { ErrorHandler } from './utils/errorHandler';
import { CacheManager } from './utils/cache';

let explorerProvider: OpenSpecExplorerProvider;
let webviewProvider: OpenSpecWebviewProvider;
let fileWatcher: vscode.FileSystemWatcher;
let cacheManager: CacheManager;
let openCodeServerTerminal: vscode.Terminal | undefined;
let openCodeRunnerTerminal: vscode.Terminal | undefined;

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
    await vscode.commands.executeCommand('openspec.opencode.startServer');

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

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenSpec extension is now active!');
  
  // Initialize error handling and cache
  ErrorHandler.initialize();
  cacheManager = CacheManager.getInstance();

  // Register the tree data provider
  explorerProvider = new OpenSpecExplorerProvider();
  vscode.window.registerTreeDataProvider('openspecExplorer', explorerProvider);
  vscode.window.registerTreeDataProvider('openspecWelcome', explorerProvider);

  // Register the webview provider
  webviewProvider = new OpenSpecWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('openspec.details', webviewProvider)
  );

  // Register commands
  registerCommands(context);

  // Keep terminal refs accurate when users close terminals.
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (openCodeServerTerminal && terminal === openCodeServerTerminal) {
        openCodeServerTerminal = undefined;
      }
      if (openCodeRunnerTerminal && terminal === openCodeRunnerTerminal) {
        openCodeRunnerTerminal = undefined;
      }
    })
  );

  // Set up file system watcher
  setupFileWatcher(context);

  // Check workspace initialization
  checkWorkspaceInitialization();

  // Log activation success
  ErrorHandler.info('Extension activated successfully', false);
}

function registerCommands(context: vscode.ExtensionContext) {
  // View details command
  const viewDetailsCommand = vscode.commands.registerCommand('openspec.viewDetails', (item) => {
    if (item && item.path) {
      webviewProvider.showDetails(item);
    } else {
      vscode.window.showWarningMessage('No change selected');
    }
  });

  // List changes command (refresh)
  const listChangesCommand = vscode.commands.registerCommand('openspec.listChanges', () => {
    explorerProvider.refresh();
    vscode.commands.executeCommand('openspecExplorer.focus');
  });

  // Apply change command
  const applyChangeCommand = vscode.commands.registerCommand('openspec.applyChange', async (item) => {
    if (!item || !item.label) {
      vscode.window.showWarningMessage('No change selected');
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

      // Apply is the Ralph loop: generate runner and run attached.
      // This mirrors the spec behavior (task loop parity) using the cross-platform script.
      await vscode.commands.executeCommand('openspec.opencode.runRunnerAttached', {
        url: 'http://localhost:4099',
        changeId: item.label
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start Ralph runner: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Fast-forward scaffold-only change (create artifacts)
  const fastForwardChangeCommand = vscode.commands.registerCommand('openspec.ffChange', async (item) => {
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

    const isScaffoldOnly = await WorkspaceUtils.isScaffoldOnlyActiveChange(item.path);
    if (!isScaffoldOnly) {
      vscode.window.showWarningMessage('Fast-forward is only available when the change contains only .openspec.yaml');
      return;
    }

    try {
      const terminalName = `OpenSpec FF: ${changeId}`;
      const terminal = vscode.window.createTerminal({ name: terminalName });
      terminal.show(true);

      const prompt = `use openspec ff skill to populate ${changeId}`;
      terminal.sendText(`opencode --continue --prompt ${JSON.stringify(prompt)}`, true);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start fast-forward flow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Archive change command
  const archiveChangeCommand = vscode.commands.registerCommand('openspec.archiveChange', async (item) => {
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
  const startOpenCodeServerCommand = vscode.commands.registerCommand('openspec.opencode.startServer', async () => {
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
      if (openCodeServerTerminal && !vscode.window.terminals.includes(openCodeServerTerminal)) {
        openCodeServerTerminal = undefined;
      }

      if (!openCodeServerTerminal) {
        openCodeServerTerminal = vscode.window.terminals.find(t => t.name === 'OpenCode Server')
          ?? vscode.window.createTerminal({ name: 'OpenCode Server' });
      }

      openCodeServerTerminal.show(true);
      // `--print-logs` makes failures visible in the terminal.
      openCodeServerTerminal.sendText('opencode serve --port 4099 --print-logs', true);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start OpenCode server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Open OpenCode UI (http://localhost:4099) in default browser
  const openOpenCodeUiCommand = vscode.commands.registerCommand('openspec.opencode.openUi', async () => {
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
  const newChangeCommand = vscode.commands.registerCommand('openspec.opencode.newChange', async () => {
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
  const generateRunnerScriptCommand = vscode.commands.registerCommand('openspec.opencode.generateRunnerScript', async () => {
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
    'openspec.opencode.runRunnerAttached',
    async (attachUrl?: unknown) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder found');
        return;
      }

      let url = 'http://localhost:4099';
      let changeId = '';
      if (typeof attachUrl === 'string' && attachUrl.trim().length > 0) {
        url = attachUrl.trim();
      } else if (attachUrl && typeof attachUrl === 'object') {
        const payload = attachUrl as Record<string, unknown>;
        const maybeUrl = payload.url;
        const maybeChangeId = payload.changeId;
        if (typeof maybeUrl === 'string' && maybeUrl.trim().length > 0) {
          url = maybeUrl.trim();
        }
        if (typeof maybeChangeId === 'string' && maybeChangeId.trim().length > 0) {
          changeId = maybeChangeId.trim();
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
        if (openCodeRunnerTerminal) {
          openCodeRunnerTerminal.dispose();
        }

        const nodeCmd = pickNodeCommand();
        const args: string[] = [runnerUri.fsPath, '--attach', url];
        if (changeId) {
          args.push('--change', changeId);
        }

        // Provide a sane default for environments where `opencode` isn't on PATH.
        // The runner will attempt direct `opencode` first, then fall back to `npx -y opencode-ai@1.1.40`.
        const env = {
          ...process.env,
          OPENCODE_NPX_PKG: process.env.OPENCODE_NPX_PKG || 'opencode-ai@1.1.40'
        };

        openCodeRunnerTerminal = vscode.window.createTerminal({
          name: 'OpenCode Runner',
          cwd: workspaceRoot.fsPath,
          shellPath: nodeCmd,
          shellArgs: args,
          env
        });

        openCodeRunnerTerminal.show(true);
      } catch (error) {
        ErrorHandler.handle(error as Error, 'Failed to run runner script');
        vscode.window.showErrorMessage(
          `Failed to run runner script: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );

  // Generate proposal command
  const generateProposalCommand = vscode.commands.registerCommand('openspec.generateProposal', async () => {
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
  const initCommand = vscode.commands.registerCommand('openspec.init', async () => {
    const terminal = vscode.window.createTerminal({ name: 'OpenSpec Init' });
    terminal.show(true);
    terminal.sendText('openspec init', true);
    vscode.window.showInformationMessage('Initialized terminal with `openspec init`');
  });

  // Show output command
  const showOutputCommand = vscode.commands.registerCommand('openspec.showOutput', () => {
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

function setupFileWatcher(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    ErrorHandler.warning('No workspace folder found', false);
    return;
  }

  const workspaceFolder = workspaceFolders[0];
  // Only watch the workspace-root openspec folder.
  // This avoids accidentally binding to nested examples (e.g. testingproject/openspec).
  const openspecGlob = new vscode.RelativePattern(workspaceFolder, 'openspec/**');
  
  try {
    fileWatcher = vscode.workspace.createFileSystemWatcher(openspecGlob);

    fileWatcher.onDidCreate(() => {
      debounce(() => {
        WorkspaceUtils.invalidateCache(); // Clear cache on file changes
        explorerProvider.refresh();
        checkWorkspaceInitialization();
      }, 500);
    });

    fileWatcher.onDidChange(() => {
      debounce(() => {
        WorkspaceUtils.invalidateCache(); // Clear cache on file changes
        explorerProvider.refresh();
      }, 500);
    });

    fileWatcher.onDidDelete(() => {
      debounce(() => {
        WorkspaceUtils.invalidateCache(); // Clear cache on file changes
        explorerProvider.refresh();
        checkWorkspaceInitialization();
      }, 500);
    });

    context.subscriptions.push(fileWatcher);
    ErrorHandler.info('File system watcher initialized', false);
  } catch (error) {
    ErrorHandler.handle(error as Error, 'Failed to setup file system watcher');
  }
}

function checkWorkspaceInitialization() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    ErrorHandler.warning('No workspace folder found', false);
    return;
  }

  const workspaceFolder = workspaceFolders[0];
  
  WorkspaceUtils.isOpenSpecInitialized(workspaceFolder).then(isInitialized => {
    vscode.commands.executeCommand('setContext', 'openspec:initialized', isInitialized);
    explorerProvider.refresh();
    ErrorHandler.info(`Workspace initialization status: ${isInitialized}`, false);
  }).catch(error => {
    ErrorHandler.handle(error, 'Failed to check workspace initialization');
  });
}

// Simple debounce utility
const debounceMap = new Map<string, NodeJS.Timeout>();

function debounce(func: () => void, delay: number, key: string = 'default') {
  if (debounceMap.has(key)) {
    clearTimeout(debounceMap.get(key)!);
  }
  
  const timeout = setTimeout(func, delay);
  debounceMap.set(key, timeout);
}

export function deactivate() {
  try {
    if (fileWatcher) {
      fileWatcher.dispose();
    }
    if (cacheManager) {
      cacheManager.dispose();
    }
    ErrorHandler.dispose();
    debounceMap.forEach(timeout => clearTimeout(timeout));
    debounceMap.clear();
    ErrorHandler.info('Extension deactivated successfully', false);
  } catch (error) {
    ErrorHandler.handle(error as Error, 'Error during extension deactivation', false);
  }
}

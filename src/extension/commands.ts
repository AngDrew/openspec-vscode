import * as vscode from 'vscode';
import * as path from 'path';

import { Commands } from '../constants/commands';
import { WorkspaceUtils } from '../utils/workspace';
import { ErrorHandler } from '../utils/errorHandler';
import { ExtensionRuntimeState } from './runtime';
import { ServerLifecycle } from '../services/serverLifecycle';
import { SessionManager } from '../services/sessionManager';
import { AcpClient } from '../services/acpClient';

import { PortManager } from '../services/portManager';
import { ChatMessage } from '../providers/chatViewProvider';

/**
 * Ensures ACP client is connected and has an active session.
 * This is the central helper for all chat commands.
 */
async function ensureAcpReady(
  chatProvider?: typeof import('../providers/chatViewProvider').ChatViewProvider.prototype
): Promise<{ success: boolean; error?: string }> {
  const acpClient = AcpClient.getInstance();
  const sessionManager = SessionManager.getInstance();

  // Step 1: Ensure connection
  if (!acpClient.isClientConnected()) {
    if (chatProvider) {
      chatProvider.addMessage({
        id: `msg_${Date.now()}`,
        role: 'system',
        content: 'Connecting to OpenCode ACP server...',
        timestamp: Date.now()
      });
    }

    const connected = await acpClient.connect();
    if (!connected) {
      const errorMsg = 'Failed to connect to OpenCode ACP server. Please ensure opencode is installed and try again.';
      if (chatProvider) {
        chatProvider.addMessage({
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Error: ${errorMsg}`,
          timestamp: Date.now(),
          metadata: { isError: true }
        });
      }
      return { success: false, error: errorMsg };
    }
  }

  // Step 2: Check for existing session
  let sessionId = await sessionManager.getAcpSessionId();

  if (sessionId) {
    // Try to load existing session
    const loaded = await acpClient.loadSession(sessionId);
    if (!loaded) {
      // Session expired, create new one
      ErrorHandler.debug(`ACP session ${sessionId} expired, creating new session`);
      sessionId = await acpClient.createSession();
      if (sessionId) {
        await sessionManager.setAcpSessionId(sessionId);
      }
    }
  } else {
    // No session, create new one
    sessionId = await acpClient.createSession();
    if (sessionId) {
      await sessionManager.setAcpSessionId(sessionId);
    }
  }

  if (!sessionId) {
    const errorMsg = 'Failed to create ACP session. Please try again.';
    if (chatProvider) {
      chatProvider.addMessage({
        id: `error_${Date.now()}`,
        role: 'system',
        content: `Error: ${errorMsg}`,
        timestamp: Date.now(),
        metadata: { isError: true }
      });
    }
    return { success: false, error: errorMsg };
  }

  return { success: true };
}

async function ensureLocalOpenCodeServerReady(_timeoutMs?: number): Promise<boolean> {
  // Delegate to ACP client connection check
  const acpClient = AcpClient.getInstance();
  if (acpClient.isClientConnected()) {
    return true;
  }

  const result = await ensureAcpReady();
  return result.success;
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
  const viewDetailsCommand = vscode.commands.registerCommand(Commands.viewDetails, async (item) => {
    if (!runtime.webviewProvider) {
      vscode.window.showErrorMessage('OpenSpec details panel is not available yet');
      return;
    }

    if (item && item.path) {
      runtime.webviewProvider.showDetails(item);
      
      // Connect to chat session - update context
      const sessionManager = SessionManager.getInstance();
      const changeId = item.label || item.changeId;
      if (changeId) {
        await sessionManager.setChangeId(changeId);
        await sessionManager.addMessage({
          role: 'system',
          content: `Viewing details for change: ${changeId}`,
          metadata: { changeId }
        });
      }
    } else {
      vscode.window.showWarningMessage('No change selected');
    }
  });

  // List changes command (refresh)
  const listChangesCommand = vscode.commands.registerCommand(Commands.listChanges, async () => {
    runtime.explorerProvider?.refresh();
    vscode.commands.executeCommand(Commands.explorerFocus);
    
    // Connect to chat session
    const sessionManager = SessionManager.getInstance();
    await sessionManager.addMessage({
      role: 'system',
      content: 'Refreshed OpenSpec changes list',
      metadata: {}
    });
  });

  // Apply change command
  const applyChangeCommand = vscode.commands.registerCommand(Commands.applyChange, async (item) => {
    if (!item || !item.label) {
      vscode.window.showWarningMessage('No change selected');
      return;
    }

    const sessionManager = SessionManager.getInstance();
    const changeId = item.label;

    // Maintain conversation context - set change ID and phase
    await sessionManager.setChangeId(changeId);
    await sessionManager.setPhase('implementation');
    await sessionManager.addMessage({
      role: 'system',
      content: `Starting Apply phase for change: ${changeId}`,
      metadata: { changeId, phase: 'implementation' }
    });

    // Notify chat UI
    if (runtime.chatProvider) {
      runtime.chatProvider.addMessage({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'system',
        content: `Applying change "${changeId}". Opening terminal to run tasks...`,
        timestamp: Date.now()
      });
      runtime.chatProvider.updatePhaseTracker([
        { id: 'new', name: 'New Change', status: 'completed' },
        { id: 'drafting', name: 'Drafting', status: 'completed' },
        { id: 'implementation', name: 'Implementation', status: 'active' }
      ]);
      runtime.chatProvider.setCurrentPhase('implementation');
    }

    // Check tasks.md format before proceeding
    if (typeof item.path === 'string') {
      try {
        const validation = await WorkspaceUtils.validateTasksFormat(item.path);

        if (!validation.isValid) {
          // Tasks file exists but format is invalid or has no valid tasks
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
      // Retrieve the ACP session ID for attachment
      const acpSessionId = await sessionManager.getAcpSessionId();

      await vscode.commands.executeCommand(Commands.opencodeRunRunnerAttached, {
        url: 'http://localhost:4099',
        changeId: changeId,
        count,
        sessionId: acpSessionId
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

    // Maintain conversation context - set change ID and phase
    const sessionManager = SessionManager.getInstance();
    await sessionManager.setChangeId(changeId);
    await sessionManager.setPhase('drafting');
    await sessionManager.addMessage({
      role: 'system',
      content: `Starting Fast Forward phase for change: ${changeId}`,
      metadata: { changeId, phase: 'drafting' }
    });

    // Notify chat UI
    if (runtime.chatProvider) {
      runtime.chatProvider.addMessage({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'system',
        content: `Fast-forwarding change "${changeId}". Opening terminal to generate artifacts...`,
        timestamp: Date.now()
      });
      runtime.chatProvider.updatePhaseTracker([
        { id: 'new', name: 'New Change', status: 'completed' },
        { id: 'drafting', name: 'Drafting', status: 'active' },
        { id: 'implementation', name: 'Implementation', status: 'pending' }
      ]);
      runtime.chatProvider.setCurrentPhase('drafting');
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

      // Retrieve the ACP session ID for persistence
      const acpSessionId = await sessionManager.getAcpSessionId();

      const prompt = `use openspec ff skill to populate ${changeId}`;
      const sessionIdArg = acpSessionId ? ` --session-id ${acpSessionId}` : '';
      terminal.sendText(`opencode run --attach localhost:4099${sessionIdArg} --continue ${JSON.stringify(prompt)}`, true);
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

    // Maintain conversation context - set change ID and phase
    const sessionManager = SessionManager.getInstance();
    await sessionManager.setChangeId(changeId);
    await sessionManager.setPhase('completed');
    await sessionManager.addMessage({
      role: 'system',
      content: `Archiving change: ${changeId}`,
      metadata: { changeId, phase: 'completed' }
    });

    // Notify chat UI
    if (runtime.chatProvider) {
      runtime.chatProvider.addMessage({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'system',
        content: `Archiving change "${changeId}". Opening terminal to archive...`,
        timestamp: Date.now()
      });
      runtime.chatProvider.updatePhaseTracker([
        { id: 'new', name: 'New Change', status: 'completed' },
        { id: 'drafting', name: 'Drafting', status: 'completed' },
        { id: 'implementation', name: 'Implementation', status: 'completed' }
      ]);
      runtime.chatProvider.setCurrentPhase('implementation');
    }

    try {
      // Use ACP instead of starting a terminal
      const acpClient = AcpClient.getInstance();
      
      // Ensure ACP is connected
      const connected = await acpClient.connect();
      if (!connected) {
        vscode.window.showErrorMessage(
          'Failed to connect to OpenCode ACP server. Please ensure opencode is installed.'
        );
        return;
      }

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

      // Build the archive prompt
      const prompt =
        'use openspec skill to archive the changes. let the user know if the tasks is completed or not. '
        + `Change: ${changeId}. ${tasksStatusLine}.`;

      // Send the prompt via ACP
      const sessionId = await sessionManager.getAcpSessionId();
      if (sessionId) {
        await acpClient.sendMessage(prompt);
      } else {
        // Create a new session if none exists
        const newSessionId = await acpClient.createSession();
        if (newSessionId) {
          await sessionManager.setAcpSessionId(newSessionId);
          await acpClient.sendMessage(prompt);
        }
      }

      // Clean up sessions associated with this change after archiving
      await sessionManager.cleanupSessionsForChange(changeId);
      ErrorHandler.debug(`Cleaned up sessions for archived change: ${changeId}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start archive flow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Start OpenCode server command - now connects via ACP client
  const startOpenCodeServerCommand = vscode.commands.registerCommand(Commands.opencodeStartServer, async () => {
    try {
      const acpClient = AcpClient.getInstance();
      
      if (acpClient.isClientConnected()) {
        vscode.window.showInformationMessage('OpenCode ACP server is already connected');
        return;
      }

      vscode.window.showInformationMessage('Connecting to OpenCode ACP server...');
      
      const connected = await acpClient.connect();
      
      if (connected) {
        vscode.window.showInformationMessage('Successfully connected to OpenCode ACP server');
        
        // Create a session if needed
        const sessionManager = SessionManager.getInstance();
        let sessionId = await sessionManager.getAcpSessionId();
        
        if (!sessionId) {
          sessionId = await acpClient.createSession();
          if (sessionId) {
            await sessionManager.setAcpSessionId(sessionId);
            vscode.window.showInformationMessage('ACP session created successfully');
          }
        }
      } else {
        vscode.window.showErrorMessage(
          'Failed to connect to OpenCode ACP server. Please ensure opencode is installed and try again.'
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start OpenCode server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Open OpenCode UI in default browser
  const openOpenCodeUiCommand = vscode.commands.registerCommand(Commands.opencodeOpenUi, async () => {
    try {
      const portManager = PortManager.getInstance();
      const port = portManager.getSelectedPort() || 4099;
      const url = vscode.Uri.parse(`http://localhost:${port}`);
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
      // Maintain conversation context - set phase to 'new' for new change flow
      const sessionManager = SessionManager.getInstance();
      await sessionManager.setPhase('new');
      await sessionManager.addMessage({
        role: 'system',
        content: 'Starting New Change flow',
        metadata: { phase: 'new' }
      });

      // Notify chat UI
      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: 'system',
          content: 'Creating a new OpenSpec change. Opening terminal to start the process...',
          timestamp: Date.now()
        });
        runtime.chatProvider.updatePhaseTracker([
          { id: 'new', name: 'New Change', status: 'active' },
          { id: 'drafting', name: 'Drafting', status: 'pending' },
          { id: 'implementation', name: 'Implementation', status: 'pending' }
        ]);
        runtime.chatProvider.setCurrentPhase('new');
      }

      // Use ACP instead of starting a terminal
      const acpClient = AcpClient.getInstance();
      
      // Ensure ACP is connected
      const connected = await acpClient.connect();
      if (!connected) {
        vscode.window.showErrorMessage(
          'Failed to connect to OpenCode ACP server. Please ensure opencode is installed.'
        );
        return;
      }

      // Create a session
      const sessionId = await acpClient.createSession();
      if (sessionId) {
        await sessionManager.setAcpSessionId(sessionId);
        // Send the new change prompt via ACP
        await acpClient.sendMessage('load openspec new change skill');
      } else {
        vscode.window.showErrorMessage(
          'Failed to create ACP session'
        );
      }
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
      let sessionId: string | undefined;
      let extraPrompt: string | undefined;
      if (typeof attachUrl === 'string' && attachUrl.trim().length > 0) {
        url = attachUrl.trim();
      } else if (attachUrl && typeof attachUrl === 'object') {
        const payload = attachUrl as Record<string, unknown>;
        const maybeUrl = payload.url;
        const maybeChangeId = payload.changeId;
        const maybeCount = payload.count;
        const maybeSessionId = payload.sessionId;
        const maybeExtraPrompt = payload.extraPrompt;
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

        if (typeof maybeSessionId === 'string' && maybeSessionId.trim().length > 0) {
          sessionId = maybeSessionId.trim();
        }

        if (typeof maybeExtraPrompt === 'string' && maybeExtraPrompt.trim().length > 0) {
          extraPrompt = maybeExtraPrompt.trim();
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
        if (sessionId) {
          args.push('--session-id', sessionId);
        }

        // Provide a sane default for environments where `opencode` isn't on PATH.
        // The runner will attempt direct `opencode` first, then fall back to `npx -y opencode-ai@1.1.44`.
        // Pass extra prompt via environment variable for the runner to include in its prompt.
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          OPENCODE_NPX_PKG: process.env.OPENCODE_NPX_PKG || 'opencode-ai@1.1.44'
        };
        if (extraPrompt) {
          env.OPENSPEC_EXTRA_PROMPT = extraPrompt;
        }

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

  // Show server status command (status bar click)
  const showServerStatusCommand = vscode.commands.registerCommand(Commands.showServerStatus, async () => {
    const serverLifecycle = ServerLifecycle.getInstance();
    const health = serverLifecycle.getLastHealth();
    const status = health?.status || 'unknown';
    const port = health?.port;

    const items: vscode.QuickPickItem[] = [
      {
        label: `Status: ${status}${port ? ` (port ${port})` : ''}`,
        description: 'Current server status',
        picked: true
      },
      { label: '$(play) Start Server', description: 'Start the OpenCode server' },
      { label: '$(refresh) Restart Server', description: 'Restart the OpenCode server' },
      { label: '$(debug-console) View Server Terminal', description: 'Show the server terminal' },
      { label: '$(output) View Output Channel', description: 'Show extension logs' }
    ];

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select an action'
    });

    if (!selection) {
      return;
    }

    if (selection.label.includes('Start Server')) {
      await vscode.commands.executeCommand(Commands.opencodeStartServer);
    } else if (selection.label.includes('Restart Server')) {
      await serverLifecycle.autoStartServer();
    } else if (selection.label.includes('View Server Terminal')) {
      const terminal = vscode.window.terminals.find(t => t.name === 'OpenCode Server');
      terminal?.show(true);
    } else if (selection.label.includes('View Output Channel')) {
      ErrorHandler.showOutputChannel();
    }
  });

  // Open chat panel command
  const openChatCommand = vscode.commands.registerCommand(Commands.openChat, async () => {
    if (!runtime.chatProvider) {
      vscode.window.showErrorMessage('Chat provider is not available');
      return;
    }
    await runtime.chatProvider.showChatPanel();
  });

  // Chat message sent command - handles streaming responses from ACP
  const chatMessageSentCommand = vscode.commands.registerCommand(Commands.chatMessageSent, async (userMessage: ChatMessage) => {
    if (!runtime.chatProvider) {
      return;
    }

    const acpClient = AcpClient.getInstance();
    const chatProvider = runtime.chatProvider;

    try {
      // Ensure connection to ACP server
    if (!acpClient.isClientConnected()) {
      chatProvider.setConnectionState(false, PortManager.getInstance().getSelectedPort());
      const connected = await acpClient.connect();
        if (!connected) {
          // Check if offline mode is enabled
          const config = vscode.workspace.getConfiguration('openspec');
          const offlineModeEnabled = config.get('offlineMode.enabled', true);
          
          if (offlineModeEnabled) {
            // Queue the message for later delivery
            chatProvider.addMessage({
              id: `system_${Date.now()}`,
              role: 'system',
              content: 'Server unavailable. Your message has been queued and will be sent when the connection is restored.',
              timestamp: Date.now()
            });
            
            // Show offline indicator in UI
            const offlineState = acpClient.getOfflineState();
            chatProvider.updateOfflineState({
              isOffline: true,
              pendingMessageCount: offlineState.pendingMessageCount,
              offlineSince: offlineState.offlineSince
            });
            
            ErrorHandler.debug('Message queued due to server unavailability', 'chatMessageSent', {
              messagePreview: userMessage.content.substring(0, 50),
              queueSize: offlineState.pendingMessageCount
            });
          } else {
            chatProvider.addMessage({
              id: `error_${Date.now()}`,
              role: 'system',
              content: 'Failed to connect to OpenCode server. Please start the server first.',
              timestamp: Date.now()
            });
          }
          return;
        } else {
          // Connection restored - update offline state
          const offlineState = acpClient.getOfflineState();
          chatProvider.updateOfflineState({
            isOffline: offlineState.isOffline,
            pendingMessageCount: offlineState.pendingMessageCount,
            lastConnectedAt: Date.now()
          });
          chatProvider.setConnectionState(true, PortManager.getInstance().getSelectedPort());
        }
      }
      
      // Set up offline state listener for real-time updates
      const offlineDisposable = acpClient.onOfflineChange((state) => {
        chatProvider.updateOfflineState({
          isOffline: state.isOffline,
          pendingMessageCount: state.pendingMessageCount,
          offlineSince: state.offlineSince,
          lastConnectedAt: state.lastConnectedAt
        });
      });
      
      // Add to disposables for cleanup
      context.subscriptions.push(offlineDisposable);

      // Create placeholder message for AI response
      const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      chatProvider.addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: { isStreaming: true }
      });

      // Show typing indicator
      chatProvider.postMessage({
        type: 'showTypingIndicator'
      });

      // Set up message listener for streaming updates
      let accumulatedContent = '';
      const messageDisposable = acpClient.onMessage((message) => {
        switch (message.type) {
          case 'text_delta':
            accumulatedContent += message.delta;
            chatProvider.updateMessage(assistantMessageId, accumulatedContent, true);
            break;
          case 'streaming_end':
            chatProvider.updateMessage(assistantMessageId, accumulatedContent, false);
            chatProvider.postMessage({
              type: 'hideTypingIndicator'
            });
            messageDisposable.dispose();
            break;
          case 'error':
            chatProvider.updateMessage(assistantMessageId, `Error: ${message.message}`, false);
            chatProvider.postMessage({
              type: 'hideTypingIndicator'
            });
            messageDisposable.dispose();
            break;
        }
      });

      // Set up session created listener to capture session ID
      const sessionCreatedDisposable = acpClient.onSessionCreated((sessionId, changeId) => {
        if (changeId) {
          const sessionManager = SessionManager.getInstance();
          sessionManager.setChangeId(changeId);
          sessionManager.setAcpSessionId(sessionId);
          chatProvider.addMessage({
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            role: 'system',
            content: `Change created: ${changeId}`,
            timestamp: Date.now(),
            metadata: { changeId }
          });
        }
      });

      context.subscriptions.push(sessionCreatedDisposable);

      // Send message to ACP server
      await acpClient.sendMessage(userMessage.content);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'sending chat message', false);
      chatProvider.addMessage({
        id: `error_${Date.now()}`,
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: Date.now()
      });
      chatProvider.postMessage({
        type: 'hideTypingIndicator'
      });
    }
  });

  // Cancel streaming command
  const chatCancelStreamingCommand = vscode.commands.registerCommand(Commands.chatCancelStreaming, async () => {
    const acpClient = AcpClient.getInstance();
    const cancelledResponse = acpClient.cancelStreaming();

    if (runtime.chatProvider && cancelledResponse) {
      runtime.chatProvider.postMessage({
        type: 'streamingCancelled',
        messageId: cancelledResponse.messageId,
        partialContent: cancelledResponse.content
      });
    }

    ErrorHandler.debug('Streaming cancelled by user');
  });

  // Chat: New Change command - triggered from chat interface
  const chatNewChangeCommand = vscode.commands.registerCommand(Commands.chatNewChange, async () => {
    try {
      const description = await vscode.window.showInputBox({
        title: 'New Change Description',
        prompt: 'Describe the change you want to make',
        placeHolder: 'e.g., add connection status indicator to chat panel',
        ignoreFocusOut: true
      });

      if (!description) {
        return;
      }

      const sessionManager = SessionManager.getInstance();
      await sessionManager.setPhase('new');
      await sessionManager.addMessage({
        role: 'system',
        content: 'Starting New Change flow from chat',
        metadata: { phase: 'new' }
      });

      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: 'system',
          content: `Creating a new OpenSpec change: ${description.trim()}`,
          timestamp: Date.now()
        });
        runtime.chatProvider.updatePhaseTracker([
          { id: 'new', name: 'New Change', status: 'active' },
          { id: 'drafting', name: 'Drafting', status: 'pending' },
          { id: 'implementation', name: 'Implementation', status: 'pending' }
        ]);
        runtime.chatProvider.setCurrentPhase('new');
      }

      // Ensure ACP is connected and has a session
      const acpReady = await ensureAcpReady(runtime.chatProvider);
      
      if (!acpReady.success) {
        throw new Error(acpReady.error || 'Failed to connect to ACP');
      }

      const acpClient = AcpClient.getInstance();

      // Send the prompt to OpenCode via ACP
      await acpClient.sendMessage(`load openspec new change skill. ${description.trim()}`);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'starting new change from chat', true);
      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Failed to start new change flow: ${err.message}`,
          timestamp: Date.now()
        });
      }
    }
  });

  // Chat: Fast Forward command - triggered from chat interface
  const chatFastForwardCommand = vscode.commands.registerCommand(Commands.chatFastForward, async (changeId?: string) => {
    try {
      if (!changeId) {
        const sessionManager = SessionManager.getInstance();
        const session = await sessionManager.getCurrentSession();
        changeId = session?.changeId;

        if (!changeId) {
          if (runtime.chatProvider) {
            runtime.chatProvider.addMessage({
              id: `error_${Date.now()}`,
              role: 'system',
              content: 'No change selected. Please select a change first or use the command from the OpenSpec explorer.',
              timestamp: Date.now()
            });
          }
          return;
        }
      }

      const sessionManager = SessionManager.getInstance();
      await sessionManager.setChangeId(changeId);
      await sessionManager.setPhase('drafting');
      await sessionManager.addMessage({
        role: 'system',
        content: `Starting Fast Forward phase for change: ${changeId}`,
        metadata: { changeId, phase: 'drafting' }
      });

      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: 'system',
          content: `Fast-forwarding change "${changeId}" via ACP...`,
          timestamp: Date.now()
        });
        runtime.chatProvider.updatePhaseTracker([
          { id: 'new', name: 'New Change', status: 'completed' },
          { id: 'drafting', name: 'Drafting', status: 'active' },
          { id: 'implementation', name: 'Implementation', status: 'pending' }
        ]);
        runtime.chatProvider.setCurrentPhase('drafting');
      }

      // Ensure ACP is connected and has a session
      const acpReady = await ensureAcpReady(runtime.chatProvider);
      
      if (!acpReady.success) {
        throw new Error(acpReady.error || 'Failed to connect to ACP');
      }

      const acpClient = AcpClient.getInstance();

      // Send the fast-forward prompt via ACP
      await acpClient.sendMessage(`use openspec ff skill to populate ${changeId}`);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'starting fast forward from chat', true);
      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Failed to start fast-forward flow: ${err.message}`,
          timestamp: Date.now()
        });
      }
    }
  });

  // Chat: Apply command - triggered from chat interface
  const chatApplyCommand = vscode.commands.registerCommand(Commands.chatApply, async (changeId?: string, count?: number, extraPrompt?: string) => {
    try {
      if (!changeId) {
        const sessionManager = SessionManager.getInstance();
        const session = await sessionManager.getCurrentSession();
        changeId = session?.changeId;

        if (!changeId) {
          if (runtime.chatProvider) {
            runtime.chatProvider.addMessage({
              id: `error_${Date.now()}`,
              role: 'system',
              content: 'No change selected. Please select a change first or use the command from the OpenSpec explorer.',
              timestamp: Date.now()
            });
          }
          return;
        }
      }

      const sessionManager = SessionManager.getInstance();
      await sessionManager.setChangeId(changeId);
      await sessionManager.setPhase('implementation');
      await sessionManager.addMessage({
        role: 'system',
        content: `Starting Apply phase for change: ${changeId}`,
        metadata: { changeId, phase: 'implementation' }
      });

      // Prompt for extra context if not already provided
      let userExtraPrompt = extraPrompt;
      if (userExtraPrompt === undefined) {
        userExtraPrompt = await vscode.window.showInputBox({
          title: 'Additional Context for Apply (Optional)',
          prompt: 'Add any extra context, requirements, or constraints for this apply phase (optional)',
          placeHolder: 'e.g., "Focus on error handling", "Use existing patterns", "Check for lint errors"...',
          ignoreFocusOut: true
        });
        // User cancelled - still proceed but without extra context
      }

      if (runtime.chatProvider) {
        let systemMessage = `Applying change "${changeId}". Opening terminal to run tasks...`;
        if (userExtraPrompt && userExtraPrompt.trim()) {
          systemMessage += `\n\nAdditional context: ${userExtraPrompt.trim()}`;
        }
        runtime.chatProvider.addMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: 'system',
          content: systemMessage,
          timestamp: Date.now()
        });
        runtime.chatProvider.updatePhaseTracker([
          { id: 'new', name: 'New Change', status: 'completed' },
          { id: 'drafting', name: 'Drafting', status: 'completed' },
          { id: 'implementation', name: 'Implementation', status: 'active' }
        ]);
        runtime.chatProvider.setCurrentPhase('implementation');
      }

      // Ensure ACP is connected and has a session
      const acpReady = await ensureAcpReady(runtime.chatProvider);
      
      if (!acpReady.success) {
        throw new Error(acpReady.error || 'Failed to connect to ACP');
      }

      const acpClient = AcpClient.getInstance();

      // Build the apply prompt
      let prompt = `use openspec apply-change skill to implement tasks for ${changeId}`;
      if (count && count > 1) {
        prompt += ` --count ${count}`;
      }
      if (userExtraPrompt && userExtraPrompt.trim()) {
        prompt += `. Additional context: ${userExtraPrompt.trim()}`;
        // Store extra prompt in session for potential reuse
        await sessionManager.setExtraPrompt(userExtraPrompt.trim());
      }

      // Send the apply prompt via ACP
      await acpClient.sendMessage(prompt);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'applying change from chat', true);
      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Failed to apply change: ${err.message}`,
          timestamp: Date.now()
        });
      }
    }
  });

  // Chat: Archive command - triggered from chat interface
  const chatArchiveCommand = vscode.commands.registerCommand(Commands.chatArchive, async (changeId?: string) => {
    try {
      if (!changeId) {
        const sessionManager = SessionManager.getInstance();
        const session = await sessionManager.getCurrentSession();
        changeId = session?.changeId;
        
        if (!changeId) {
          if (runtime.chatProvider) {
            runtime.chatProvider.addMessage({
              id: `error_${Date.now()}`,
              role: 'system',
              content: 'No change selected. Please select a change first or use the command from the OpenSpec explorer.',
              timestamp: Date.now()
            });
          }
          return;
        }
      }

      const sessionManager = SessionManager.getInstance();
      await sessionManager.setChangeId(changeId);
      await sessionManager.setPhase('completed');
      await sessionManager.addMessage({
        role: 'system',
        content: `Archiving change: ${changeId}`,
        metadata: { changeId, phase: 'completed' }
      });

      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: 'system',
          content: `Archiving change "${changeId}". Opening terminal to archive...`,
          timestamp: Date.now()
        });
        runtime.chatProvider.updatePhaseTracker([
          { id: 'new', name: 'New Change', status: 'completed' },
          { id: 'drafting', name: 'Drafting', status: 'completed' },
          { id: 'implementation', name: 'Implementation', status: 'completed' }
        ]);
        runtime.chatProvider.setCurrentPhase('implementation');
      }

      // Ensure ACP is connected and has a session
      const acpReady = await ensureAcpReady(runtime.chatProvider);
      
      if (!acpReady.success) {
        throw new Error(acpReady.error || 'Failed to connect to ACP');
      }

      const acpClient = AcpClient.getInstance();

      // Build the archive prompt
      let prompt = `use openspec skill to archive the change ${changeId}. Let me know if the tasks are completed.`;

      // Send the archive prompt via ACP
      await acpClient.sendMessage(prompt);

      // Clean up sessions associated with this change after archiving
      await sessionManager.cleanupSessionsForChange(changeId);
      ErrorHandler.debug(`Cleaned up sessions for archived change via chat: ${changeId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'archiving change from chat', true);
      if (runtime.chatProvider) {
        runtime.chatProvider.addMessage({
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Failed to archive change: ${err.message}`,
          timestamp: Date.now()
        });
      }
    }
  });

  // Debug: export logs command
  const exportLogsCommand = vscode.commands.registerCommand('openspec.debug.exportLogs', async () => {
    try {
      await ErrorHandler.exportLogs();
    } catch (error) {
      ErrorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        'exporting debug logs',
        true
      );
    }
  });

  // Debug: toggle debug mode command
  const toggleDebugCommand = vscode.commands.registerCommand('openspec.debug.toggle', async () => {
    const currentState = ErrorHandler.isDebugEnabled();
    const newState = !currentState;
    
    ErrorHandler.setDebugEnabled(newState);
    
    vscode.window.showInformationMessage(
      `Debug mode ${newState ? 'enabled' : 'disabled'}`
    );
    
    ErrorHandler.info(`Debug mode ${newState ? 'enabled' : 'disabled'} by user`, false, 'debug');
  });

  // Debug: show output command
  const showDebugOutputCommand = vscode.commands.registerCommand('openspec.debug.showOutput', () => {
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
    showOutputCommand,
    showServerStatusCommand,
    openChatCommand,
    chatMessageSentCommand,
    chatCancelStreamingCommand,
    chatNewChangeCommand,
    chatFastForwardCommand,
    chatApplyCommand,
    chatArchiveCommand,
    exportLogsCommand,
    toggleDebugCommand,
    showDebugOutputCommand
  );
}

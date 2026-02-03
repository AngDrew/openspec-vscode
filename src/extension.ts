import * as vscode from 'vscode';

import { OpenSpecExplorerProvider } from './providers/explorerProvider';
import { OpenSpecWebviewProvider } from './providers/webviewProvider';
import { ChatViewProvider } from './providers/chatViewProvider';
import { ErrorHandler } from './utils/errorHandler';
import { CacheManager } from './utils/cache';
import { PortManager } from './services/portManager';

import { activateExtension } from './extension/activate';
import { deactivateExtension } from './extension/deactivate';
import { registerCommands } from './extension/commands';
import { checkWorkspaceInitialization, registerOpenSpecWatcher } from './extension/watcher';
import { ExtensionRuntimeState } from './extension/runtime';

let runtime: ExtensionRuntimeState | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('OpenSpec extension is now active!');

  // Initialize error handling and cache
  ErrorHandler.initialize();

  // Initialize PortManager with context
  PortManager.getInstance().initialize(context);

  runtime = await activateExtension(context);
  runtime.cacheManager = CacheManager.getInstance();

  // Register the tree data provider
  runtime.explorerProvider = new OpenSpecExplorerProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('openspecExplorer', runtime.explorerProvider),
    vscode.window.registerTreeDataProvider('openspecWelcome', runtime.explorerProvider)
  );

  // Register the webview provider
  runtime.webviewProvider = new OpenSpecWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('openspec.details', runtime.webviewProvider)
  );

  // Register the chat view provider (sidebar view)
  const chatViewProvider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider)
  );
  runtime.chatProvider = chatViewProvider as unknown as typeof runtime.chatProvider;

  // Set context keys for chat
  const config = vscode.workspace.getConfiguration('openspec');
  vscode.commands.executeCommand('setContext', 'openspec:chatEnabled', config.get('chat.enabled', true));
  vscode.commands.executeCommand('setContext', 'openspec:chatFocus', false);
  vscode.commands.executeCommand('setContext', 'openspec:inputEmpty', true);
  vscode.commands.executeCommand('setContext', 'openspec:streaming', false);

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('openspec.chat.enabled')) {
        const config = vscode.workspace.getConfiguration('openspec');
        vscode.commands.executeCommand('setContext', 'openspec:chatEnabled', config.get('chat.enabled', true));
      }
    })
  );

  // Register commands
  registerCommands(context, runtime);

  // Keep terminal refs accurate when users close terminals.
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (runtime?.openCodeServerTerminal && terminal === runtime.openCodeServerTerminal) {
        runtime.openCodeServerTerminal = undefined;
      }
      if (runtime?.openCodeRunnerTerminal && terminal === runtime.openCodeRunnerTerminal) {
        runtime.openCodeRunnerTerminal = undefined;
      }
    })
  );

  // Set up file system watcher
  registerOpenSpecWatcher(context, runtime);

  // Check workspace initialization
  checkWorkspaceInitialization(runtime);

  // Log activation success
  ErrorHandler.info('Extension activated successfully', false);
}

export function deactivate() {
  deactivateExtension(runtime);
}

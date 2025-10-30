import * as vscode from 'vscode';
import { OpenSpecExplorerProvider } from './providers/explorerProvider';
import { OpenSpecWebviewProvider } from './providers/webviewProvider';
import { WorkspaceUtils } from './utils/workspace';
import { ErrorHandler } from './utils/errorHandler';
import { CacheManager } from './utils/cache';

let explorerProvider: OpenSpecExplorerProvider;
let webviewProvider: OpenSpecWebviewProvider;
let fileWatcher: vscode.FileSystemWatcher;
let cacheManager: CacheManager;

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

  // Generate proposal command
  const generateProposalCommand = vscode.commands.registerCommand('openspec.generateProposal', () => {
    vscode.window.showInformationMessage(
      'Generate Proposal feature coming soon! For now, use `openspec create-proposal` in the terminal.',
      'Open Terminal'
    ).then(selection => {
      if (selection === 'Open Terminal') {
        vscode.commands.executeCommand('workbench.action.terminal.new');
      }
    });
  });

  // Initialize workspace command
  const initCommand = vscode.commands.registerCommand('openspec.init', () => {
    vscode.window.showInformationMessage(
      'To initialize an OpenSpec workspace, run `openspec init` in the terminal.',
      'Open Terminal'
    ).then(selection => {
      if (selection === 'Open Terminal') {
        vscode.commands.executeCommand('workbench.action.terminal.new');
      }
    });
  });

  // Show output command
  const showOutputCommand = vscode.commands.registerCommand('openspec.showOutput', () => {
    ErrorHandler.showOutputChannel();
  });

  context.subscriptions.push(
    viewDetailsCommand,
    listChangesCommand,
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
  const openspecGlob = new vscode.RelativePattern(workspaceFolder, '**/openspec/**');
  
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
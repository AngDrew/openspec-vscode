import * as vscode from 'vscode';

import { ErrorHandler } from '../utils/errorHandler';
import { WorkspaceUtils } from '../utils/workspace';
import { ExtensionRuntimeState } from './runtime';

export function registerOpenSpecWatcher(
  context: vscode.ExtensionContext,
  runtime: ExtensionRuntimeState
): void {
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
    runtime.fileWatcher = vscode.workspace.createFileSystemWatcher(openspecGlob);

    runtime.fileWatcher.onDidCreate(() => {
      debounce(runtime, () => {
        WorkspaceUtils.invalidateCache();
        runtime.explorerProvider?.refresh();
        checkWorkspaceInitialization(runtime);
      }, 500);
    });

    runtime.fileWatcher.onDidChange(() => {
      debounce(runtime, () => {
        WorkspaceUtils.invalidateCache();
        runtime.explorerProvider?.refresh();
      }, 500);
    });

    runtime.fileWatcher.onDidDelete(() => {
      debounce(runtime, () => {
        WorkspaceUtils.invalidateCache();
        runtime.explorerProvider?.refresh();
        checkWorkspaceInitialization(runtime);
      }, 500);
    });

    context.subscriptions.push(runtime.fileWatcher);
    ErrorHandler.info('File system watcher initialized', false);
  } catch (error) {
    ErrorHandler.handle(error as Error, 'Failed to setup file system watcher');
  }
}

export function checkWorkspaceInitialization(runtime: ExtensionRuntimeState): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    ErrorHandler.warning('No workspace folder found', false);
    return;
  }

  const workspaceFolder = workspaceFolders[0];

  WorkspaceUtils.isOpenSpecInitialized(workspaceFolder)
    .then(isInitialized => {
      vscode.commands.executeCommand('setContext', 'openspec:initialized', isInitialized);
      runtime.explorerProvider?.refresh();
      ErrorHandler.info(`Workspace initialization status: ${isInitialized}`, false);
    })
    .catch(error => {
      ErrorHandler.handle(error as Error, 'Failed to check workspace initialization');
    });
}

export function debounce(
  runtime: ExtensionRuntimeState,
  func: () => void,
  delay: number,
  key: string = 'default'
): void {
  if (runtime.debounceMap.has(key)) {
    clearTimeout(runtime.debounceMap.get(key)!);
  }

  const timeout = setTimeout(func, delay);
  runtime.debounceMap.set(key, timeout);
}

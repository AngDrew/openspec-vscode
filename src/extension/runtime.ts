import * as vscode from 'vscode';

import { OpenSpecExplorerProvider } from '../providers/explorerProvider';
import { OpenSpecWebviewProvider } from '../providers/webviewProvider';
import { CacheManager } from '../utils/cache';

export interface ExtensionRuntimeState {
  explorerProvider?: OpenSpecExplorerProvider;
  webviewProvider?: OpenSpecWebviewProvider;
  fileWatcher?: vscode.FileSystemWatcher;
  cacheManager?: CacheManager;
  openCodeServerTerminal?: vscode.Terminal;
  openCodeRunnerTerminal?: vscode.Terminal;
  debounceMap: Map<string, NodeJS.Timeout>;
}

export function createExtensionRuntimeState(): ExtensionRuntimeState {
  return { debounceMap: new Map<string, NodeJS.Timeout>() };
}

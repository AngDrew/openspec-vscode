import * as vscode from 'vscode';

import { OpenSpecExplorerProvider } from '../providers/explorerProvider';
import { OpenSpecWebviewProvider } from '../providers/webviewProvider';
import { ChatViewProvider } from '../providers/chatViewProvider';
import { ServerStatusIndicator } from './serverStatusIndicator';
import { CacheManager } from '../utils/cache';

export interface ExtensionRuntimeState {
  explorerProvider?: OpenSpecExplorerProvider;
  webviewProvider?: OpenSpecWebviewProvider;
  chatProvider?: ChatViewProvider;
  fileWatcher?: vscode.FileSystemWatcher;
  cacheManager?: CacheManager;
  openCodeServerTerminal?: vscode.Terminal;
  openCodeRunnerTerminal?: vscode.Terminal;
  debounceMap: Map<string, NodeJS.Timeout>;
  serverStatusIndicator?: ServerStatusIndicator;
}

export function createExtensionRuntimeState(): ExtensionRuntimeState {
  return { debounceMap: new Map<string, NodeJS.Timeout>() };
}

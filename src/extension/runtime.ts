import * as vscode from 'vscode';

import { ChatViewProvider } from '../providers/chatViewProvider';
import { CacheManager } from '../utils/cache';

export interface ExtensionRuntimeState {
  chatProvider?: ChatViewProvider;
  fileWatcher?: vscode.FileSystemWatcher;
  cacheManager?: CacheManager;
  openCodeRunnerTerminal?: vscode.Terminal;
  debounceMap: Map<string, NodeJS.Timeout>;
}

export function createExtensionRuntimeState(): ExtensionRuntimeState {
  return { debounceMap: new Map<string, NodeJS.Timeout>() };
}

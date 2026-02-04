import * as vscode from 'vscode';

import { ChatViewProvider } from '../providers/chatViewProvider';
import { CacheManager } from '../utils/cache';

export interface ExtensionRuntimeState {
  chatProvider?: ChatViewProvider;
  cacheManager?: CacheManager;
  openCodeRunnerTerminal?: vscode.Terminal;
}

export function createExtensionRuntimeState(): ExtensionRuntimeState {
  return {};
}

import * as vscode from 'vscode';

import { ExtensionRuntimeState } from './runtime';

export function registerOpenSpecWatcher(
  _context: vscode.ExtensionContext,
  _runtime: ExtensionRuntimeState
): void {
  return;
}

export function checkWorkspaceInitialization(_runtime: ExtensionRuntimeState): void {
  vscode.commands.executeCommand('setContext', 'openspec:initialized', false);
  return;
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

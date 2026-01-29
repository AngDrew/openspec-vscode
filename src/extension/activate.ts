import * as vscode from 'vscode';

import { createExtensionRuntimeState, ExtensionRuntimeState } from './runtime';

export function activateExtension(_context: vscode.ExtensionContext): ExtensionRuntimeState {
  return createExtensionRuntimeState();
}

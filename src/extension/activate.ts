import * as vscode from 'vscode';

import { createExtensionRuntimeState, ExtensionRuntimeState } from './runtime';
import { SessionManager } from '../services/sessionManager';
import { AcpClient } from '../services/acpClient';
import { ErrorHandler } from '../utils/errorHandler';

export async function activateExtension(context: vscode.ExtensionContext): Promise<ExtensionRuntimeState> {
  const runtime = createExtensionRuntimeState();

  const sessionManager = SessionManager.getInstance();
  sessionManager.initialize(context);

  await sessionManager.restoreSession();

  const acpRestored = await sessionManager.restoreAcpSession();
  if (acpRestored) {
    const restoredSessionId = await sessionManager.getAcpSessionId();
    ErrorHandler.debug(`[OpenSpec] ACP session restored: ${restoredSessionId}`);
  }

  const config = vscode.workspace.getConfiguration('openspec');
  const autoStartEnabled = config.get('chat.autoStartServer', true);
  if (autoStartEnabled && vscode.workspace.workspaceFolders?.length) {
    const acpClient = AcpClient.getInstance();
    if (!acpClient.isClientConnected()) {
      acpClient.connect().catch((error) => {
        ErrorHandler.handle(error as Error, 'auto-starting ACP on activation', false);
      });
    }
  }

  context.subscriptions.push(
    new vscode.Disposable(() => sessionManager.dispose())
  );

  return runtime;
}

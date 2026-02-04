import * as vscode from 'vscode';

import { createExtensionRuntimeState, ExtensionRuntimeState } from './runtime';
import { SessionManager } from '../services/sessionManager';
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

  context.subscriptions.push(
    new vscode.Disposable(() => sessionManager.dispose())
  );

  return runtime;
}

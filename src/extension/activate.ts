import * as vscode from 'vscode';

import { createExtensionRuntimeState, ExtensionRuntimeState } from './runtime';
import { ServerStatusIndicator } from './serverStatusIndicator';
import { ServerLifecycle } from '../services/serverLifecycle';
import { SessionManager } from '../services/sessionManager';

export async function activateExtension(context: vscode.ExtensionContext): Promise<ExtensionRuntimeState> {
  const runtime = createExtensionRuntimeState();

  const serverLifecycle = ServerLifecycle.getInstance();
  serverLifecycle.initialize(context);

  const sessionManager = SessionManager.getInstance();
  sessionManager.initialize(context);

  runtime.serverStatusIndicator = new ServerStatusIndicator();
  runtime.serverStatusIndicator.initialize();

  // Restore conversation session
  await sessionManager.restoreSession();
  
  // Restore ACP session from workspace state (Task 23.3)
  // This validates and reconnects to the ACP session if still active
  const acpRestored = await sessionManager.restoreAcpSession();
  if (acpRestored) {
    const restoredSessionId = await sessionManager.getAcpSessionId();
    console.log(`[OpenSpec] ACP session restored: ${restoredSessionId}`);
  }

  context.subscriptions.push(
    new vscode.Disposable(() => runtime.serverStatusIndicator?.dispose()),
    new vscode.Disposable(() => serverLifecycle.dispose()),
    new vscode.Disposable(() => sessionManager.dispose())
  );

  return runtime;
}

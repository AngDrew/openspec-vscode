import * as vscode from 'vscode';

import { Commands } from '../constants/commands';
import { ErrorHandler } from '../utils/errorHandler';
import { ExtensionRuntimeState } from './runtime';
import { AcpClient } from '../services/acpClient';

/**
 * Ensures ACP client is connected and has an active session.
 * This is the central helper for all chat commands.
 */

export function registerCommands(context: vscode.ExtensionContext, runtime: ExtensionRuntimeState): void {
  const ensureChatFocused = async (): Promise<boolean> => {
    if (!runtime.chatProvider) {
      vscode.window.showErrorMessage('Chat provider is not available');
      return false;
    }
    runtime.chatProvider.showChatPanel();
    runtime.chatProvider.postMessage({ type: 'focusInput' });
    return true;
  };

  const openChatCommand = vscode.commands.registerCommand(Commands.openChat, async () => {
    await ensureChatFocused();
  });

  // The chat webview owns the input textbox and message send lifecycle.
  // This command exists for contribution/registration parity and to safely focus the chat UI.
  const chatMessageSentCommand = vscode.commands.registerCommand(Commands.chatMessageSent, async (_arg?: unknown) => {
    await ensureChatFocused();
  });

  const chatCancelStreamingCommand = vscode.commands.registerCommand(Commands.chatCancelStreaming, async () => {
    const acpClient = AcpClient.getInstance();
    const cancelledResponse = acpClient.cancelStreaming();

    if (runtime.chatProvider && cancelledResponse) {
      runtime.chatProvider.setStreamingState(false, cancelledResponse.messageId);
      runtime.chatProvider.postMessage({
        type: 'streamingCancelled',
        messageId: cancelledResponse.messageId,
        partialContent: cancelledResponse.content
      });
    } else if (runtime.chatProvider) {
      runtime.chatProvider.setStreamingState(false);
    }

    ErrorHandler.debug('Streaming cancelled by user');
  });

  context.subscriptions.push(
    openChatCommand,
    chatMessageSentCommand,
    chatCancelStreamingCommand
  );
}

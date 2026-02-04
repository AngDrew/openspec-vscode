import * as vscode from 'vscode';

import { Commands } from '../constants/commands';
import { ErrorHandler } from '../utils/errorHandler';
import { ExtensionRuntimeState } from './runtime';
import { SessionManager } from '../services/sessionManager';
import { AcpClient } from '../services/acpClient';
import { ChatMessage } from '../providers/chatViewProvider';

/**
 * Ensures ACP client is connected and has an active session.
 * This is the central helper for all chat commands.
 */

export function registerCommands(context: vscode.ExtensionContext, runtime: ExtensionRuntimeState): void {
  const openChatCommand = vscode.commands.registerCommand(Commands.openChat, async () => {
    if (!runtime.chatProvider) {
      vscode.window.showErrorMessage('Chat provider is not available');
      return;
    }
    await runtime.chatProvider.showChatPanel();
  });

  const chatMessageSentCommand = vscode.commands.registerCommand(Commands.chatMessageSent, async (userMessage: ChatMessage) => {
    if (!runtime.chatProvider) {
      return;
    }

    const acpClient = AcpClient.getInstance();
    const chatProvider = runtime.chatProvider;

    try {
      if (!acpClient.isClientConnected()) {
        chatProvider.setConnectionState(false);
        const connected = await acpClient.connect();
        if (!connected) {
          const config = vscode.workspace.getConfiguration('openspec');
          const offlineModeEnabled = config.get('offlineMode.enabled', true);

          if (offlineModeEnabled) {
            chatProvider.addMessage({
              id: `system_${Date.now()}`,
              role: 'system',
              content: 'Server unavailable. Your message has been queued and will be sent when the connection is restored.',
              timestamp: Date.now()
            });

            const offlineState = acpClient.getOfflineState();
            chatProvider.updateOfflineState({
              isOffline: true,
              pendingMessageCount: offlineState.pendingMessageCount,
              offlineSince: offlineState.offlineSince
            });

            ErrorHandler.debug('Message queued due to server unavailability', 'chatMessageSent', {
              messagePreview: userMessage.content.substring(0, 50),
              queueSize: offlineState.pendingMessageCount
            });
          } else {
            chatProvider.addMessage({
              id: `error_${Date.now()}`,
              role: 'system',
              content: 'Failed to connect to OpenCode server. Please start the server first.',
              timestamp: Date.now()
            });
          }
          return;
        } else {
          const offlineState = acpClient.getOfflineState();
          chatProvider.updateOfflineState({
            isOffline: offlineState.isOffline,
            pendingMessageCount: offlineState.pendingMessageCount,
            lastConnectedAt: Date.now()
          });
          chatProvider.setConnectionState(true);
        }
      }

      const offlineDisposable = acpClient.onOfflineChange((state) => {
        chatProvider.updateOfflineState({
          isOffline: state.isOffline,
          pendingMessageCount: state.pendingMessageCount,
          offlineSince: state.offlineSince,
          lastConnectedAt: state.lastConnectedAt
        });
      });
      context.subscriptions.push(offlineDisposable);

      const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      chatProvider.addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: { isStreaming: true }
      });

      chatProvider.postMessage({
        type: 'showTypingIndicator'
      });

      let accumulatedContent = '';
      const messageDisposable = acpClient.onMessage((message) => {
        switch (message.type) {
          case 'text_delta':
            accumulatedContent += message.delta;
            chatProvider.updateMessage(assistantMessageId, accumulatedContent, true);
            break;
          case 'streaming_end':
            chatProvider.updateMessage(assistantMessageId, accumulatedContent, false);
            chatProvider.postMessage({
              type: 'hideTypingIndicator'
            });
            messageDisposable.dispose();
            break;
          case 'error':
            chatProvider.updateMessage(assistantMessageId, `Error: ${message.message}`, false);
            chatProvider.postMessage({
              type: 'hideTypingIndicator'
            });
            messageDisposable.dispose();
            break;
        }
      });

      const sessionCreatedDisposable = acpClient.onSessionCreated((sessionId) => {
        const sessionManager = SessionManager.getInstance();
        sessionManager.setAcpSessionId(sessionId);
      });
      context.subscriptions.push(sessionCreatedDisposable);

      await acpClient.sendMessage(userMessage.content);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'sending chat message', false);
      chatProvider.addMessage({
        id: `error_${Date.now()}`,
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: Date.now()
      });
      chatProvider.postMessage({
        type: 'hideTypingIndicator'
      });
    }
  });

  const chatCancelStreamingCommand = vscode.commands.registerCommand(Commands.chatCancelStreaming, async () => {
    const acpClient = AcpClient.getInstance();
    const cancelledResponse = acpClient.cancelStreaming();

    if (runtime.chatProvider && cancelledResponse) {
      runtime.chatProvider.postMessage({
        type: 'streamingCancelled',
        messageId: cancelledResponse.messageId,
        partialContent: cancelledResponse.content
      });
    }

    ErrorHandler.debug('Streaming cancelled by user');
  });

  context.subscriptions.push(
    openChatCommand,
    chatMessageSentCommand,
    chatCancelStreamingCommand
  );
}

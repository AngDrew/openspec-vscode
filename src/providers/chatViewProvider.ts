import * as vscode from 'vscode';
import * as path from 'path';
import { ErrorHandler } from '../utils/errorHandler';
import { SessionManager } from '../services/sessionManager';
import { AcpClient } from '../services/acpClient';
import { AcpClientCapabilities } from '../services/acpClientCapabilities';
import { AcpConnectionState, AcpMessage, ToolCall } from '../services/acpTypes';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    isStreaming?: boolean;
    artifact?: ArtifactData;
    questionId?: string;
    changeId?: string;
    isError?: boolean;
    retryAction?: string;
  };
}

export interface ArtifactData {
  type: 'proposal' | 'design' | 'tasks' | 'spec' | 'specs';
  changeId: string;
  title: string;
  content?: string;
  sections?: Array<{ title: string; content: string }>;
  progress?: {
    total: number;
    completed: number;
    pending: number;
  };
  specs?: Array<{
    name: string;
    fileName: string;
    description?: string;
    content?: string;
  }>;
}

export interface ChatSession {
  id: string;
  changeId?: string;
  phase: 'new' | 'drafting' | 'implementation' | 'idle';
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'openspecChat';
  
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _session: ChatSession;
  private _acpClient: AcpClient;
  private _sessionManager: SessionManager;
  private _streamingBuffers = new Map<string, string>();
  private _activeStreamingMessageId: string | undefined;
  private _isWorking = false;

  private _capabilities: AcpClientCapabilities;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    this._session = this._createNewSession();
    this._acpClient = AcpClient.getInstance();
    this._sessionManager = SessionManager.getInstance();
    this._capabilities = new AcpClientCapabilities();
    
    this._setupAcpListeners();
    this._setupAcpCapabilities();
  }

  private _setupAcpCapabilities(): void {
    // Register client capabilities with ACP client
    this._acpClient.setOnReadTextFile(params => this._capabilities.readTextFile(params));
    this._acpClient.setOnWriteTextFile(params => this._capabilities.writeTextFile(params));
    this._acpClient.setOnRequestPermission(params => this._capabilities.requestPermission(params));
    this._acpClient.setOnCreateTerminal(params => this._capabilities.createTerminal(params));
    this._acpClient.setOnTerminalOutput(params => this._capabilities.terminalOutput(params));
    this._acpClient.setOnWaitForTerminalExit(params => this._capabilities.waitForTerminalExit(params));
    this._acpClient.setOnKillTerminal(params => this._capabilities.killTerminal(params));
    this._acpClient.setOnReleaseTerminal(params => this._capabilities.releaseTerminal(params));
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);
    this._setupMessageHandling(webviewView.webview);

    // Restore session data if exists
    this._restoreSession();

    // Send initial session metadata if available
    this._sendSessionMetadata();

    this.setConnectionState(this._acpClient.getConnectionState());

    const maybeAutoStart = () => {
      const config = vscode.workspace.getConfiguration('openspec');
      const autoStartEnabled = config.get('chat.autoStartServer', true);
      if (!autoStartEnabled) {
        return;
      }
      if (this._acpClient.getConnectionState() !== 'disconnected') {
        return;
      }
      this._acpClient.connect().catch((error) => {
        ErrorHandler.handle(error as Error, 'auto-starting ACP on chat open', false);
      });
    };

    maybeAutoStart();
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        vscode.commands.executeCommand('setContext', 'openspec:chatFocus', true);
        maybeAutoStart();
      } else {
        vscode.commands.executeCommand('setContext', 'openspec:chatFocus', false);
      }
    });

    this._disposables.push(
      webviewView.onDidDispose(() => {
        vscode.commands.executeCommand('setContext', 'openspec:chatFocus', false);
      })
    );
  }

  private _setupAcpListeners(): void {
    // Listen for ACP session updates
    this._acpClient.onMessage((message) => {
      this._handleAcpMessage(message);
    });

    this._acpClient.onConnectionChange((state) => {
      this.setConnectionState(state);
      if (state === 'disconnected') {
        this.showConnectionError('Disconnected from OpenCode server', true);
      } else {
        this.hideConnectionError();
      }
    });
  }

  private _handleAcpMessage(message: AcpMessage | { type: 'modeUpdate'; modeId?: string } | { type: 'modelUpdate'; modelId?: string }): void {
    switch (message.type) {
      case 'text':
      case 'text_delta':
        this._handleAssistantStream(message);
        break;
      case 'agent_thought_chunk':
      case 'tool_call':
      case 'tool_call_update':
      case 'plan':
        // Keep the UI in "working" state even when we haven't received text deltas yet.
        if (this._isWorking) {
          this.setStreamingState(true, message.messageId);
        }

        // Surface lightweight progress updates to the webview.
        this._postWorkUpdate(message);
        break;
      case 'streaming_start':
        this.setStreamingState(true, message.messageId);
        break;
      case 'streaming_end':
        if (message.messageId) {
          this._streamingBuffers.delete(message.messageId);
        }
        this.setStreamingState(false, message.messageId);
        break;
      case 'status':
        // Update status if needed
        break;
      case 'error':
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `Error: ${message.message || 'Unknown error'}`,
          timestamp: Date.now(),
          metadata: { isError: true }
        });
        break;
      case 'session_created':
        if (message.sessionId) {
          this._sessionManager.setAcpSessionId(message.sessionId);
        }
        // Send session metadata after session creation
        this._sendSessionMetadata();
        break;
      case 'modeUpdate':
        this.postMessage({
          type: 'modeUpdate',
          modeId: message.modeId
        });
        break;
      case 'modelUpdate':
        this.postMessage({
          type: 'modelUpdate',
          modelId: message.modelId
        });
        break;
    }
  }

  private _sendSessionMetadata(): void {
    const metadata = this._acpClient.getSessionMetadata();
    if (metadata.modes || metadata.models) {
      this.postMessage({
        type: 'sessionMetadata',
        modes: metadata.modes,
        models: metadata.models
      });
    }
  }

  private _updateOrAddAssistantMessage(content: string, messageId?: string, isStreaming?: boolean): void {
    const existingMessage = this._session.messages.find(m => m.id === messageId);
    
    if (existingMessage && existingMessage.role === 'assistant') {
      this.updateMessage(messageId || '', content, isStreaming);
    } else {
      this.addMessage({
        id: messageId || this._generateMessageId(),
        role: 'assistant',
        content: content,
        timestamp: Date.now(),
        metadata: isStreaming !== undefined ? { isStreaming } : undefined
      });
    }
  }

  private _handleAssistantStream(message: { type: string; content?: string; delta?: string; messageId?: string }): void {
    const incomingText = message.content ?? message.delta;
    if (!incomingText) {
      return;
    }

    let bufferKey = this._activeStreamingMessageId;
    if (!bufferKey) {
      bufferKey = this._generateMessageId();
      this._activeStreamingMessageId = bufferKey;
    }

    if (message.type === 'text_delta') {
      const current = this._streamingBuffers.get(bufferKey) || '';
      const next = current + incomingText;
      this._streamingBuffers.set(bufferKey, next);
      this._activeStreamingMessageId = bufferKey;
      this._updateOrAddAssistantMessage(next, bufferKey, true);
      if (this._isWorking) {
        this.setStreamingState(true, bufferKey);
      }
      return;
    }

    this._streamingBuffers.delete(bufferKey);
    if (this._activeStreamingMessageId === bufferKey) {
      this._activeStreamingMessageId = undefined;
    }
    this._updateOrAddAssistantMessage(incomingText, bufferKey, false);
    if (this._isWorking) {
      this.setStreamingState(false, bufferKey);
    }
  }

  private _resolveStreamingMessageId(_messageId?: string): string | undefined {
    return this._activeStreamingMessageId;
  }

  private _createNewSession(): ChatSession {
    return {
      id: this._generateSessionId(),
      phase: 'idle',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  private _generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async _restoreSession(): Promise<void> {
    const session = await this._sessionManager.getCurrentSession();
    if (session && session.messages.length > 0) {
      // Restore messages to UI
      for (const msg of session.messages) {
        this.postMessage({
          type: 'addMessage',
          message: {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            metadata: msg.metadata
          }
        });
      }
    }
  }

  public postMessage(message: unknown): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  public addMessage(message: ChatMessage): void {
    this._session.messages.push(message);
    this._session.updatedAt = Date.now();
    this.postMessage({
      type: 'addMessage',
      message
    });
    
    // Also add to session manager for persistence
    this._sessionManager.addMessage({
      role: message.role,
      content: message.content,
      metadata: message.metadata
    });
  }

  public updateMessage(messageId: string, content: string, isStreaming?: boolean): void {
    const message = this._session.messages.find(m => m.id === messageId);
    if (message) {
      message.content = content;
      if (isStreaming !== undefined) {
        message.metadata = { ...message.metadata, isStreaming };
      }
      this._session.updatedAt = Date.now();
      this.postMessage({
        type: 'updateMessage',
        messageId,
        content,
        isStreaming
      });
    }
  }

  public setStreamingState(isStreaming: boolean, messageId?: string): void {
    vscode.commands.executeCommand('setContext', 'openspec:streaming', isStreaming);
    this.postMessage({
      type: 'streamingState',
      isStreaming,
      messageId
    });
  }

  public updateOfflineState(state: { isOffline: boolean; pendingMessageCount: number; offlineSince?: number; lastConnectedAt?: number }): void {
    this.postMessage({
      type: 'offlineState',
      ...state
    });
  }

  public setConnectionState(state: AcpConnectionState): void {
    this.postMessage({
      type: 'connectionState',
      state
    });
  }

  public showOfflineIndicator(): void {
    this.postMessage({ type: 'showOfflineIndicator' });
  }

  public hideOfflineIndicator(): void {
    this.postMessage({ type: 'hideOfflineIndicator' });
  }

  public showConnectionError(errorMessage: string, canRetry: boolean = true): void {
    this.postMessage({
      type: 'connectionError',
      error: errorMessage,
      canRetry
    });
  }

  public hideConnectionError(): void {
    this.postMessage({ type: 'connectionErrorResolved' });
  }

  public updatePhaseTracker(phases: Array<{ id: string; name: string; status: 'pending' | 'active' | 'completed' }>): void {
    this.postMessage({
      type: 'updatePhaseTracker',
      phases
    });
  }

  public setCurrentPhase(phaseId: string): void {
    this.postMessage({
      type: 'setCurrentPhase',
      phaseId
    });
  }

  public displayArtifact(artifact: ArtifactData): void {
    this.postMessage({
      type: 'displayArtifact',
      artifact
    });
  }

  private _setupMessageHandling(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(
      async (message) => {
        try {
          switch (message.type) {
            case 'sendMessage':
              await this._handleSendMessage(message.content);
              break;
            case 'newSession':
              await this._handleNewSession();
              break;
            case 'getSession':
              this.postMessage({
                type: 'sessionData',
                session: this._session
              });
              break;
            case 'cancelStreaming':
              await this._handleCancelStreaming();
              break;
            case 'phaseClicked':
              await this._handlePhaseClick(message.phaseId);
              break;
            case 'retryConnection':
              await this._handleRetryConnection();
              break;
            case 'inputChanged':
              vscode.commands.executeCommand('setContext', 'openspec:inputEmpty', !message.content || message.content.trim().length === 0);
              break;
            case 'selectMode':
              await this._handleSelectMode(message.modeId);
              break;
            case 'selectModel':
              await this._handleSelectModel(message.modelId);
              break;
            case 'openArtifact':
              await this._handleOpenArtifact(message);
              break;
            default:
              ErrorHandler.debug(`Unknown message type: ${message.type}`);
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          ErrorHandler.handle(err, 'handling chat message', false);
          this.postMessage({
            type: 'error',
            message: err.message
          });
        }
      },
      null,
      this._disposables
    );
  }

  private async _handleOpenArtifact(message: unknown): Promise<void> {
    try {
      if (!message || typeof message !== 'object') {
        return;
      }

      const payload = message as {
        filepath?: unknown;
        preview?: unknown;
        artifactType?: unknown;
        changeId?: unknown;
        fileName?: unknown;
      };

      let filepath = typeof payload.filepath === 'string' ? payload.filepath.trim() : '';

      // Backwards-compatible fallback: accept artifact selectors if a filepath wasn't provided.
      if (!filepath) {
        const artifactType = typeof payload.artifactType === 'string' ? payload.artifactType : '';
        const changeId = typeof payload.changeId === 'string' ? payload.changeId : '';
        const fileName = typeof payload.fileName === 'string' ? payload.fileName : '';

        if (artifactType && changeId) {
          switch (artifactType) {
            case 'proposal':
              filepath = `openspec/changes/${changeId}/proposal.md`;
              break;
            case 'design':
              filepath = `openspec/changes/${changeId}/design.md`;
              break;
            case 'tasks':
              filepath = `openspec/changes/${changeId}/tasks.md`;
              break;
            case 'specs':
            case 'spec':
              if (fileName) {
                filepath = `openspec/changes/${changeId}/specs/${fileName}`;
              }
              break;
            default:
              break;
          }
        }
      }

      if (!filepath) {
        return;
      }

      const preview = payload.preview === true;

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        ErrorHandler.handle(new Error('No workspace folder is open'), 'opening artifact', true);
        return;
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;
      const resolved = path.isAbsolute(filepath)
        ? path.normalize(filepath)
        : path.resolve(workspaceRoot, filepath);

      // Do not allow the webview to open files outside the workspace root.
      const relative = path.relative(workspaceRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        ErrorHandler.handle(
          new Error(`Refusing to open file outside the workspace: ${filepath}`),
          'opening artifact',
          true
        );
        return;
      }

      const uri = vscode.Uri.file(resolved);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'opening artifact', true);
    }
  }

  private async _handleSendMessage(content: string): Promise<void> {
    if (!content || content.trim().length === 0) {
      return;
    }

        const trimmedContent = content.trim();

    const userMessage: ChatMessage = {
      id: this._generateMessageId(),
      role: 'user',
      content: trimmedContent,
      timestamp: Date.now()
    };

    this.addMessage(userMessage);

    // Send to ACP client
    await this._sendToAcp(trimmedContent);
  }

  private async _sendToAcp(content: string): Promise<void> {
    // ACP does not reliably emit streaming_start/streaming_end for OpenCode.
    // Drive the busy indicator ourselves: "working" from prompt send until it resolves.
    this._isWorking = true;
    this.setStreamingState(true);
    try {
      // Ensure connection
      if (!this._acpClient.isClientConnected()) {
        const connected = await this._acpClient.connect();
        if (!connected) {
          const detail = this._acpClient.getLastConnectionError();
          this.showConnectionError(
            detail ? `Failed to connect to OpenCode: ${detail}` : 'Failed to connect to OpenCode server',
            true
          );
          return;
        }
      }

      // Get or create session
      let sessionId = await this._sessionManager.getAcpSessionId();
      if (!sessionId) {
        sessionId = await this._acpClient.createSession();
        if (sessionId) {
          await this._sessionManager.setAcpSessionId(sessionId);
        }
      }

      if (!sessionId) {
        this.showConnectionError('OpenCode connected, but no session could be created. Check OpenCode auth (`opencode auth`) and default model configuration.', true);
        return;
      }

      // Ensure assistant output for this turn uses a stable, per-turn messageId.
      // ACP updates don't provide message IDs, so we generate one per prompt.
      this._activeStreamingMessageId = this._generateMessageId();

      // Send message via ACP
      await this._acpClient.sendPrompt(sessionId, content);
    } catch (error) {
      ErrorHandler.handle(error as Error, 'sending message to ACP', false);
      this.showConnectionError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
    } finally {
      // Finalize any partial assistant message.
      if (this._activeStreamingMessageId) {
        const messageId = this._activeStreamingMessageId;
        const finalContent = this._streamingBuffers.get(messageId);
        if (finalContent !== undefined) {
          this.updateMessage(messageId, finalContent, false);
          this._streamingBuffers.delete(messageId);
        }
        this._activeStreamingMessageId = undefined;
      }
      this._isWorking = false;
      this.setStreamingState(false);
    }
  }

  private _postWorkUpdate(message: AcpMessage): void {
    try {
      switch (message.type) {
        case 'tool_call': {
          const tool = message.tool || 'tool';
          this.postMessage({ type: 'workUpdate', kind: 'tool', text: `Running: ${tool}` });
          break;
        }
        case 'tool_call_update': {
          const toolCall = message.toolCall as ToolCall | undefined;
          if (!toolCall) {
            break;
          }
          this.postMessage({
            type: 'workUpdate',
            kind: 'tool',
            text: `${toolCall.tool}: ${toolCall.status}`
          });
          break;
        }
        case 'agent_thought_chunk': {
          const text = (message.content || '').trim();
          if (!text) {
            break;
          }
          const snippet = text.length > 160 ? text.slice(0, 160) + '...' : text;
          this.postMessage({ type: 'workUpdate', kind: 'thought', text: snippet });
          break;
        }
        case 'plan':
          this.postMessage({ type: 'workUpdate', kind: 'plan', text: 'Plan updated' });
          break;
        default:
          break;
      }
    } catch (error) {
      ErrorHandler.debug(`Failed to post work update: ${error}`);
    }
  }

  private async _handleCancelStreaming(): Promise<void> {
    try {
      const sessionId = await this._sessionManager.getAcpSessionId();
      if (sessionId) {
        await this._acpClient.cancelSession(sessionId);
      }

      const messageId = this._activeStreamingMessageId;
      if (messageId) {
        const partialContent = this._streamingBuffers.get(messageId) || '';
        this.postMessage({
          type: 'streamingCancelled',
          messageId,
          partialContent
        });
        this._streamingBuffers.delete(messageId);
        this._activeStreamingMessageId = undefined;
      }
      this.setStreamingState(false);
    } catch (error) {
      ErrorHandler.handle(error as Error, 'canceling streaming', false);
    }
  }

  private async _handleNewSession(): Promise<void> {
    try {
      // If a turn is currently running, cancel it first.
      try {
        const currentAcpSessionId = await this._sessionManager.getAcpSessionId();
        if (currentAcpSessionId) {
          await this._acpClient.cancelSession(currentAcpSessionId);
        }
      } catch {
        // Ignore
      }

      // Reset local chat state
      this._session = this._createNewSession();
      this._streamingBuffers.clear();
      this._activeStreamingMessageId = undefined;
      this._isWorking = false;
      this.setStreamingState(false);
      this.postMessage({ type: 'clearChat' });
      this._sendSessionMetadata();

      // Reset persisted session and start a fresh one
      await this._sessionManager.clearCurrentSession();
      await this._sessionManager.createSession(undefined, 'New chat');

      // Reset ACP session (fresh model context)
      this._acpClient.clearSession();
      await this._sessionManager.clearAcpSessionId();

      // Best-effort: create a fresh ACP session immediately so selectors reflect it.
      try {
        if (!this._acpClient.isClientConnected()) {
          await this._acpClient.connect();
        }
        const newAcpSessionId = await this._acpClient.createSession();
        if (newAcpSessionId) {
          await this._sessionManager.setAcpSessionId(newAcpSessionId);
        }
      } catch {
        // If session creation fails, we will retry on next message send.
      }

      this._sendSessionMetadata();
    } catch (error) {
      ErrorHandler.handle(error as Error, 'starting new chat session', false);
      this.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async _handlePhaseClick(phaseId: string): Promise<void> {
    ErrorHandler.debug(`Phase clicked: ${phaseId}`);
    // Could trigger specific actions based on phase
  }

  private async _handleRetryConnection(): Promise<void> {
    try {
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: 'Retrying connection to OpenCode server...',
        timestamp: Date.now()
      });

      const connected = await this._acpClient.connect();

      if (connected) {
        this.hideConnectionError();
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: 'Successfully connected to OpenCode server!',
          timestamp: Date.now()
        });
      } else {
        this.showConnectionError('Failed to connect to OpenCode server. The server may not be running or is not responding.', true);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'retrying connection', false);
      this.showConnectionError(`Connection retry failed: ${err.message}`, true);
    }
  }

  private async _handleSelectMode(modeId: string): Promise<void> {
    try {
      const sessionId = await this._sessionManager.getAcpSessionId();
      if (!sessionId) {
        ErrorHandler.debug('Cannot select mode: no active session');
        return;
      }

      await this._acpClient.setMode(sessionId, modeId);
      ErrorHandler.debug(`Mode changed to: ${modeId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'selecting mode', false);
      this.postMessage({
        type: 'error',
        message: `Failed to select mode: ${err.message}`
      });
    }
  }

  private async _handleSelectModel(modelId: string): Promise<void> {
    try {
      const sessionId = await this._sessionManager.getAcpSessionId();
      if (!sessionId) {
        ErrorHandler.debug('Cannot select model: no active session');
        return;
      }

      await this._acpClient.setModel(sessionId, modelId);
      ErrorHandler.debug(`Model changed to: ${modelId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'selecting model', false);
      this.postMessage({
        type: 'error',
        message: `Failed to select model: ${err.message}`
      });
    }
  }

  public clearChat(): void {
    this._session.messages = [];
    this._session.updatedAt = Date.now();
    this.postMessage({
      type: 'clearChat'
    });
  }

  public getSession(): ChatSession {
    return { ...this._session };
  }

  public showChatPanel(): void {
    // Focus the sidebar view
    vscode.commands.executeCommand('openspecChat.focus');
  }

  public cancelStreaming(): void {
    vscode.commands.executeCommand('openspec.chat.cancelStreaming');
  }

  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
    this._capabilities.dispose();
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js')
    );
    const highlightStylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'highlight.css')
    );

    const nonce = this._getNonce();
    const initialConnectionState = this._acpClient.getConnectionState();
    const connectionStateLabel = initialConnectionState === 'connected'
      ? 'Connected'
      : initialConnectionState === 'connecting'
        ? 'Connecting'
        : 'Disconnected';

    // For now, generate HTML inline
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
        <title>OpenSpec Chat</title>
        <link href="${stylesUri}" rel="stylesheet">
        <link href="${highlightStylesUri}" rel="stylesheet">
      </head>
      <body>
        <div class="chat-container">
          <div class="connection-error-banner" id="connectionErrorBanner" style="display: none;">
            <div class="connection-error-content">
              <span class="connection-error-icon">!</span>
              <span class="connection-error-message" id="connectionErrorMessage"></span>
              <button class="connection-error-retry-btn" id="connectionErrorRetryBtn" style="display: none;">
                <span class="retry-icon">↻</span> Retry
              </button>
            </div>
            <button class="connection-error-close" id="connectionErrorCloseBtn" title="Dismiss">×</button>
          </div>
          <div class="offline-indicator-banner" id="offlineIndicatorBanner" style="display: none;">
            <div class="offline-indicator-content">
              <span class="offline-indicator-icon">!</span>
              <span class="offline-indicator-message" id="offlineIndicatorMessage">Server unavailable. Messages will be queued and sent when connection is restored.</span>
              <span class="offline-indicator-count" id="offlineIndicatorCount"></span>
            </div>
            <button class="offline-indicator-close" id="offlineIndicatorCloseBtn" title="Dismiss">×</button>
          </div>
          <div class="chat-header">
            <div class="chat-header-main">
              <h1>OpenSpec Chat</h1>
              <span class="connection-status" id="connectionStatus" data-state="${initialConnectionState}">${connectionStateLabel}</span>
            </div>
            <button class="clear-button" id="clearBtn" title="Start a new chat">New Chat</button>
          </div>
          <!-- Model Selection Dialog -->
          <div id="modelDialog" class="model-dialog" style="display: none;">
            <div class="model-dialog-overlay"></div>
            <div class="model-dialog-content">
              <div class="model-dialog-header">
                <h3>Select Model</h3>
                <button id="modelDialogClose" class="model-dialog-close" title="Close">×</button>
              </div>
              <div class="model-dialog-search">
                <input type="text" id="modelSearchInput" placeholder="Search models..." autocomplete="off">
              </div>
              <div id="modelDialogList" class="model-dialog-list">
                <!-- Models will be populated here -->
              </div>
            </div>
          </div>
          <div class="messages-container" id="messagesContainer">
            <div class="empty-state" id="emptyState">
              <p>Start a conversation or use the workflow buttons above.</p>
            </div>
          </div>
          <div class="typing-indicator" id="typingIndicator" style="display: none;">
            <div class="typing-bubbles">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="typing-text" id="typingText">AI is thinking...</span>
          </div>
          <div class="selectors-bar" id="selectorsBar">
            <div class="selector-group">
              <label class="selector-label">Mode:</label>
              <div id="modeSelectorContainer" class="mode-selector-container">
                <!-- Mode selector will be dynamically inserted here (toggle for 2, dropdown for more) -->
              </div>
            </div>
            <div class="selector-group">
              <label class="selector-label">Model:</label>
              <button id="modelSelectorBtn" class="model-selector-btn" title="Select model" style="display: none;">
                <span id="currentModelLabel">Select Model</span>
                <span class="model-selector-arrow">▼</span>
              </button>
            </div>
          </div>
          <div class="input-container">
            <textarea
              id="messageInput"
              placeholder="Type your message... (Shift+Enter for new line)"
              rows="2"
              aria-label="Message input"
            ></textarea>
            <button id="sendBtn" class="send-button" aria-label="Send message">
              Send
            </button>
          </div>
        </div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

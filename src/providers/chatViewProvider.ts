import * as vscode from 'vscode';
import { ErrorHandler } from '../utils/errorHandler';
import { WorkspaceUtils } from '../utils/workspace';
import { SessionManager } from '../services/sessionManager';
import { AcpClient } from '../services/acpClient';
import { PortManager } from '../services/portManager';
import { AcpClientCapabilities } from '../services/acpClientCapabilities';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    isStreaming?: boolean;
    isToolCall?: boolean;
    toolName?: string;
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
    
    // Auto-start ACP server on first view open
    this._ensureServerRunning();

    // Update context when view is visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        vscode.commands.executeCommand('setContext', 'openspec:chatFocus', true);
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

  private async _ensureServerRunning(): Promise<void> {
    const config = vscode.workspace.getConfiguration('openspec');
    const autoStart = config.get('chat.autoStartServer', true);
    
    if (!autoStart) {
      return;
    }

    try {
      const portManager = PortManager.getInstance();
      const port = portManager.getSelectedPort();
      
      if (!port) {
        // Find available port and start
        const newPort = await portManager.findAvailablePort();
        if (newPort) {
          await this._startAcpServer(newPort);
        }
      } else {
        // Check if already running
        const isRunning = await WorkspaceUtils.isPortOpen('127.0.0.1', port, 500);
        if (!isRunning) {
          await this._startAcpServer(port);
        }
      }
    } catch (error) {
      ErrorHandler.handle(error as Error, 'Failed to auto-start ACP server', false);
    }
  }

  private async _startAcpServer(port: number): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    try {
      // Start ACP server which also starts HTTP server on same port
      const terminal = vscode.window.createTerminal({
        name: 'OpenCode ACP Server',
        cwd: workspaceFolder.uri.fsPath
      });

      terminal.sendText(`opencode acp --port ${port} --hostname 127.0.0.1 --print-logs`, true);
      terminal.show(true);

      // Wait for server to be ready
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await this._delay(500);
        const isRunning = await WorkspaceUtils.isPortOpen('127.0.0.1', port, 500);
        if (isRunning) {
          ErrorHandler.info(`ACP server started on port ${port}`, false);
          return;
        }
        attempts++;
      }

      throw new Error(`Server did not start within ${maxAttempts * 500}ms`);
    } catch (error) {
      ErrorHandler.handle(error as Error, 'Failed to start ACP server', true);
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private _setupAcpListeners(): void {
    // Listen for ACP session updates
    this._acpClient.onMessage((message) => {
      this._handleAcpMessage(message);
    });

    this._acpClient.onToolCall((toolCall) => {
      this.addToolCall({
        id: toolCall.id,
        name: toolCall.tool,
        parameters: toolCall.params,
        status: toolCall.status,
        timestamp: toolCall.startTime
      });
    });

    this._acpClient.onConnectionChange((connected) => {
      if (!connected) {
        this.showConnectionError('Disconnected from OpenCode server', true);
      } else {
        this.hideConnectionError();
      }
    });
  }

  private _handleAcpMessage(message: { type: string; content?: string; messageId?: string; delta?: string; status?: string; sessionId?: string; changeId?: string; message?: string }): void {
    switch (message.type) {
      case 'text':
      case 'text_delta':
        // Handle streaming or complete messages
        if (message.content) {
          this._updateOrAddAssistantMessage(message.content, message.messageId);
        }
        break;
      case 'streaming_start':
        this.setStreamingState(true, message.messageId);
        break;
      case 'streaming_end':
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
        break;
    }
  }

  private _updateOrAddAssistantMessage(content: string, messageId?: string): void {
    const existingMessage = this._session.messages.find(m => m.id === messageId);
    
    if (existingMessage && existingMessage.role === 'assistant') {
      this.updateMessage(messageId || '', content, false);
    } else {
      this.addMessage({
        id: messageId || this._generateMessageId(),
        role: 'assistant',
        content: content,
        timestamp: Date.now()
      });
    }
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

  public addToolCall(toolCall: { id: string; name: string; parameters?: unknown; status?: string; timestamp?: number }): void {
    this.postMessage({
      type: 'addToolCall',
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        parameters: toolCall.parameters,
        status: toolCall.status || 'pending',
        timestamp: toolCall.timestamp || Date.now()
      }
    });
  }

  public updateToolCallStatus(toolCallId: string, status: string, result?: unknown): void {
    this.postMessage({
      type: 'updateToolCall',
      toolCallId,
      status,
      result
    });
  }

  public clearToolCalls(): void {
    this.postMessage({ type: 'clearToolCalls' });
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
            case 'clearChat':
              this.clearChat();
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
            case 'newChange':
              await vscode.commands.executeCommand('openspec.chat.newChange');
              break;
            case 'fastForward':
              await vscode.commands.executeCommand('openspec.chat.fastForward');
              break;
            case 'apply':
              await vscode.commands.executeCommand('openspec.chat.apply');
              break;
            case 'archive':
              await vscode.commands.executeCommand('openspec.chat.archive');
              break;
            case 'retryConnection':
              await this._handleRetryConnection();
              break;
            case 'inputChanged':
              vscode.commands.executeCommand('setContext', 'openspec:inputEmpty', !message.content || message.content.trim().length === 0);
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

  private async _handleSendMessage(content: string): Promise<void> {
    if (!content || content.trim().length === 0) {
      return;
    }

    const trimmedContent = content.trim();
    
    // Check for slash commands
    if (trimmedContent.startsWith('/')) {
      const command = trimmedContent.split(' ')[0].toLowerCase();
      const args = trimmedContent.slice(command.length).trim();
      
      const userMessage: ChatMessage = {
        id: this._generateMessageId(),
        role: 'user',
        content: trimmedContent,
        timestamp: Date.now()
      };
      this.addMessage(userMessage);
      
      switch (command) {
        case '/new':
          await vscode.commands.executeCommand('openspec.chat.newChange');
          return;
        case '/ff':
        case '/fastforward':
          await vscode.commands.executeCommand('openspec.chat.fastForward', args || undefined);
          return;
        case '/apply': {
          const count = args ? parseInt(args, 10) : undefined;
          await vscode.commands.executeCommand('openspec.chat.apply', undefined, count && !isNaN(count) ? count : undefined);
          return;
        }
        case '/archive':
          await vscode.commands.executeCommand('openspec.chat.archive');
          return;
        case '/clear':
          this.clearChat();
          this.addMessage({
            id: this._generateMessageId(),
            role: 'system',
            content: 'Chat history cleared.',
            timestamp: Date.now()
          });
          return;
        case '/status': {
          const phaseDisplay = this._session.phase === 'idle' ? 'No active change' : `Current phase: ${this._session.phase}`;
          const changeDisplay = this._session.changeId ? `Change: ${this._session.changeId}` : 'No change selected';
          this.addMessage({
            id: this._generateMessageId(),
            role: 'system',
            content: `${phaseDisplay}\n${changeDisplay}`,
            timestamp: Date.now()
          });
          return;
        }
        default:
          this.addMessage({
            id: this._generateMessageId(),
            role: 'system',
            content: `Unknown command: ${command}. Available commands: /new, /ff, /apply, /archive, /clear, /status`,
            timestamp: Date.now()
          });
          return;
      }
    }

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
    try {
      // Ensure connection
      if (!this._acpClient.isClientConnected()) {
        const connected = await this._acpClient.connect();
        if (!connected) {
          this.showConnectionError('Failed to connect to OpenCode server', true);
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
        this.showConnectionError('No active ACP session', true);
        return;
      }

      // Send message via ACP
      await this._acpClient.sendPrompt(sessionId, content);
    } catch (error) {
      ErrorHandler.handle(error as Error, 'sending message to ACP', false);
      this.showConnectionError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
    }
  }

  private async _handleCancelStreaming(): Promise<void> {
    try {
      const sessionId = await this._sessionManager.getAcpSessionId();
      if (sessionId) {
        await this._acpClient.cancelSession(sessionId);
      }
      this.setStreamingState(false);
    } catch (error) {
      ErrorHandler.handle(error as Error, 'canceling streaming', false);
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

  public displayQuestion(question: { id: string; question: string; options?: string[]; allowMultiple?: boolean; allowCustom?: boolean }): void {
    this.postMessage({
      type: 'displayQuestion',
      question
    });
  }

  public addScriptOutput(output: { type: string; content: string; timestamp: number }): void {
    this.postMessage({
      type: 'addScriptOutput',
      output
    });
  }

  public updateScriptExecutionStatus(status: string, message?: string): void {
    this.postMessage({
      type: 'updateScriptExecutionStatus',
      status,
      message
    });
  }

  public clearScriptOutput(): void {
    this.postMessage({
      type: 'clearScriptOutput'
    });
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
            <h1>OpenSpec Chat</h1>
            <button class="clear-button" id="clearBtn" title="Clear chat history">Clear</button>
          </div>
          <div class="phase-tracker" id="phaseTracker">
            <div class="phase-tracker-header">
              <span class="phase-tracker-title">Workflow</span>
            </div>
            <div class="phase-tracker-container" id="phaseTrackerContainer">
              <div class="phase-item" data-phase="new" data-status="pending">
                <div class="phase-indicator">
                  <span class="phase-number">1</span>
                  <span class="phase-icon phase-icon-pending">○</span>
                  <span class="phase-icon phase-icon-active">●</span>
                  <span class="phase-icon phase-icon-completed">✓</span>
                </div>
                <span class="phase-name">New Change</span>
              </div>
              <div class="phase-connector"></div>
              <div class="phase-item" data-phase="drafting" data-status="pending">
                <div class="phase-indicator">
                  <span class="phase-number">2</span>
                  <span class="phase-icon phase-icon-pending">○</span>
                  <span class="phase-icon phase-icon-active">●</span>
                  <span class="phase-icon phase-icon-completed">✓</span>
                </div>
                <span class="phase-name">Drafting</span>
              </div>
              <div class="phase-connector"></div>
              <div class="phase-item" data-phase="implementation" data-status="pending">
                <div class="phase-indicator">
                  <span class="phase-number">3</span>
                  <span class="phase-icon phase-icon-pending">○</span>
                  <span class="phase-icon phase-icon-active">●</span>
                  <span class="phase-icon phase-icon-completed">✓</span>
                </div>
                <span class="phase-name">Implementation</span>
              </div>
            </div>
          </div>
          <div class="action-buttons" id="actionButtons">
            <button class="action-btn action-btn-new" data-action="newChange" title="Start a new OpenSpec change">
              <span class="action-btn-icon">+</span>
              <span class="action-btn-text">New Change</span>
            </button>
            <button class="action-btn action-btn-ff" data-action="fastForward" title="Fast-forward change artifacts">
              <span class="action-btn-icon">»</span>
              <span class="action-btn-text">Fast Forward</span>
            </button>
            <button class="action-btn action-btn-apply" data-action="apply" title="Apply change tasks">
              <span class="action-btn-icon">▶</span>
              <span class="action-btn-text">Apply</span>
            </button>
            <button class="action-btn action-btn-archive" data-action="archive" title="Archive completed change">
              <span class="action-btn-icon">[]</span>
              <span class="action-btn-text">Archive</span>
            </button>
          </div>
          <div class="tool-calls-panel collapsed" id="toolCallsPanel">
            <div class="tool-calls-header" id="toolCallsHeader">
              <div class="tool-calls-title">
                <span class="tool-calls-icon">T</span>
                <span>Tool Calls</span>
                <span class="tool-calls-count" id="toolCallsCount" data-count="0"></span>
              </div>
              <span class="tool-calls-toggle" id="toolCallsToggle">▶</span>
            </div>
            <div class="tool-calls-content" id="toolCallsContent">
              <div class="tool-calls-empty" id="toolCallsEmpty">No tool calls yet</div>
              <div class="tool-calls-list" id="toolCallsList"></div>
            </div>
          </div>
          <div class="messages-container" id="messagesContainer">
            <div class="empty-state" id="emptyState">
              <p>Start a conversation to begin working with OpenSpec</p>
              <div class="empty-state-hints">
                <div class="hint-item">
                  <span class="hint-command">/new</span>
                  <span class="hint-desc">Create a new change</span>
                </div>
                <div class="hint-item">
                  <span class="hint-command">/ff</span>
                  <span class="hint-desc">Fast-forward artifacts</span>
                </div>
                <div class="hint-item">
                  <span class="hint-command">/apply</span>
                  <span class="hint-desc">Apply changes</span>
                </div>
                <div class="hint-item">
                  <span class="hint-command">/status</span>
                  <span class="hint-desc">Show current status</span>
                </div>
              </div>
            </div>
          </div>
          <div class="typing-indicator" id="typingIndicator" style="display: none;">
            <div class="typing-bubbles">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="typing-text">AI is thinking...</span>
            <button class="cancel-button" id="cancelBtn" title="Cancel streaming">Cancel</button>
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

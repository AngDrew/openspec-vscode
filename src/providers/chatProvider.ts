import * as vscode from 'vscode';
import * as path from 'path';
import { ErrorHandler } from '../utils/errorHandler';
import { WorkspaceUtils } from '../utils/workspace';

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

export class ChatProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _session: ChatSession;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    this._session = this._createNewSession();
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

  public async showChatPanel(): Promise<void> {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'openspec.chat',
      'OpenSpec Chat',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [this._extensionUri],
        retainContextWhenHidden: true
      }
    );

    this._panel.webview.html = this._getHtmlContent(this._panel.webview);
    this._setupMessageHandling();

    this._panel.onDidDispose(
      () => {
        this._panel = undefined;
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
      },
      null,
      this._disposables
    );
  }

  public postMessage(message: unknown): void {
    if (this._panel) {
      this._panel.webview.postMessage(message);
    }
  }

  public addMessage(message: ChatMessage): void {
    this._session.messages.push(message);
    this._session.updatedAt = Date.now();
    this.postMessage({
      type: 'addMessage',
      message
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
    this.postMessage({
      type: 'streamingState',
      isStreaming,
      messageId
    });
  }

  public updateOfflineState(state: { isOffline: boolean; pendingMessageCount: number; offlineSince?: number; lastConnectedAt?: number }): void {
    this.postMessage({
      type: 'offlineState',
      isOffline: state.isOffline,
      pendingMessageCount: state.pendingMessageCount,
      offlineSince: state.offlineSince,
      lastConnectedAt: state.lastConnectedAt
    });
  }

  public showOfflineIndicator(): void {
    this.postMessage({
      type: 'showOfflineIndicator'
    });
  }

  public hideOfflineIndicator(): void {
    this.postMessage({
      type: 'hideOfflineIndicator'
    });
  }

  public showConnectionError(errorMessage: string, canRetry: boolean = true): void {
    this.postMessage({
      type: 'connectionError',
      error: errorMessage,
      canRetry
    });
  }

  public hideConnectionError(): void {
    this.postMessage({
      type: 'connectionErrorResolved'
    });
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
    this.postMessage({
      type: 'clearToolCalls'
    });
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

  public async renderProposalInChat(changeId: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      const proposalPath = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'proposal.md');
      if (!await WorkspaceUtils.fileExists(proposalPath)) {
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `No proposal.md found for change "${changeId}"`,
          timestamp: Date.now()
        });
        return;
      }

      const content = await WorkspaceUtils.readFile(proposalPath);
      const title = this._extractTitle(content) || 'Proposal';

      this.displayArtifact({
        type: 'proposal',
        changeId,
        title,
        content
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'rendering proposal in chat', false);
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: `Error loading proposal: ${err.message}`,
        timestamp: Date.now()
      });
    }
  }

  public async renderDesignInChat(changeId: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      const designPath = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'design.md');
      if (!await WorkspaceUtils.fileExists(designPath)) {
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `No design.md found for change "${changeId}"`,
          timestamp: Date.now()
        });
        return;
      }

      const content = await WorkspaceUtils.readFile(designPath);
      const title = this._extractTitle(content) || 'Design';
      const sections = this._parseSections(content);

      this.displayArtifact({
        type: 'design',
        changeId,
        title,
        content,
        sections
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'rendering design in chat', false);
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: `Error loading design: ${err.message}`,
        timestamp: Date.now()
      });
    }
  }

  public async renderTasksInChat(changeId: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      const tasksPath = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'tasks.md');
      if (!await WorkspaceUtils.fileExists(tasksPath)) {
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `No tasks.md found for change "${changeId}"`,
          timestamp: Date.now()
        });
        return;
      }

      const content = await WorkspaceUtils.readFile(tasksPath);
      const progress = this._parseTaskProgress(content);

      this.displayArtifact({
        type: 'tasks',
        changeId,
        title: 'Implementation Tasks',
        content,
        progress
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'rendering tasks in chat', false);
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: `Error loading tasks: ${err.message}`,
        timestamp: Date.now()
      });
    }
  }

  public async renderSpecsInChat(changeId: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      const specsDir = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'specs');
      const specsDirExists = await WorkspaceUtils.fileExists(specsDir);
      
      if (!specsDirExists) {
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `No specs directory found for change "${changeId}"`,
          timestamp: Date.now()
        });
        return;
      }

      // Read all spec files from the specs directory
      const specs: Array<{ name: string; fileName: string; description?: string; content?: string }> = [];
      const specFiles = await WorkspaceUtils.listFiles(specsDir, '.md');
      
      for (const file of specFiles) {
        const filePath = path.join(specsDir, file);
        const content = await WorkspaceUtils.readFile(filePath);
        const name = this._extractTitle(content) || file.replace('.md', '');
        const description = this._extractFirstParagraph(content);
        
        specs.push({
          name,
          fileName: file,
          description,
          content
        });
      }

      if (specs.length === 0) {
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `No spec files found for change "${changeId}"`,
          timestamp: Date.now()
        });
        return;
      }

      this.displayArtifact({
        type: 'specs',
        changeId,
        title: 'Specifications',
        specs
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'rendering specs in chat', false);
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: `Error loading specs: ${err.message}`,
        timestamp: Date.now()
      });
    }
  }

  private _extractFirstParagraph(content: string): string | undefined {
    const lines = content.split('\n');
    let foundFirstHeading = false;
    let paragraph: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip the first heading
      if (!foundFirstHeading && trimmed.startsWith('#')) {
        foundFirstHeading = true;
        continue;
      }
      
      // Collect non-empty lines for the first paragraph
      if (foundFirstHeading && trimmed) {
        if (trimmed.startsWith('#')) {
          break; // Stop at next heading
        }
        paragraph.push(trimmed);
      } else if (foundFirstHeading && paragraph.length > 0) {
        break; // Empty line after paragraph
      }
    }
    
    const result = paragraph.join(' ').trim();
    return result.length > 150 ? result.substring(0, 150) + '...' : result || undefined;
  }

  private _extractTitle(content: string): string | undefined {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : undefined;
  }

  private _parseSections(content: string): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    const lines = content.split('\n');
    let currentSection: { title: string; content: string[] } | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{2,3})\s+(.+)$/);
      if (headerMatch) {
        if (currentSection) {
          sections.push({
            title: currentSection.title,
            content: currentSection.content.join('\n').trim()
          });
        }
        currentSection = {
          title: headerMatch[2].trim(),
          content: []
        };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }

    if (currentSection) {
      sections.push({
        title: currentSection.title,
        content: currentSection.content.join('\n').trim()
      });
    }

    return sections;
  }

  private _parseTaskProgress(content: string): { total: number; completed: number; pending: number } {
    const taskRegex = /^\s*-\s*\[([ xX])\]/gm;
    let total = 0;
    let completed = 0;
    let match;

    while ((match = taskRegex.exec(content)) !== null) {
      total++;
      if (match[1] === 'x' || match[1] === 'X') {
        completed++;
      }
    }

    return {
      total,
      completed,
      pending: total - completed
    };
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

  public setSession(session: ChatSession): void {
    this._session = session;
  }

  public dispose(): void {
    if (this._panel) {
      this._panel.dispose();
    }
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  private _setupMessageHandling(): void {
    if (!this._panel) {
      return;
    }

    this._panel.webview.onDidReceiveMessage(
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
            case 'openArtifact':
              await this._handleOpenArtifact(message.artifactType, message.changeId, message.fileName);
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
            case 'retryAction':
              await this._handleRetryAction(message.action);
              break;
            case 'answerQuestion':
              await this._handleAnswerQuestion(message.questionId, message.answers);
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

    await vscode.commands.executeCommand('openspec.chat.messageSent', userMessage);
  }

  private _generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async _handleCancelStreaming(): Promise<void> {
    await vscode.commands.executeCommand('openspec.chat.cancelStreaming');
  }

  private async _handleRetryConnection(): Promise<void> {
    try {
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: 'Retrying connection to OpenCode server...',
        timestamp: Date.now()
      });

      const acpClient = (await import('../services/acpClient')).AcpClient.getInstance();
      const connected = await acpClient.connect();

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

  private async _handleRetryAction(action: string | undefined): Promise<void> {
    if (!action) {
      ErrorHandler.debug('Retry action called without action parameter');
      return;
    }

    try {
      ErrorHandler.debug(`Retrying action: ${action}`);
      
      // Map retry actions to their corresponding commands
      const actionMap: Record<string, string> = {
        'sendMessage': 'openspec.chat.messageSent',
        'newChange': 'openspec.chat.newChange',
        'fastForward': 'openspec.chat.fastForward',
        'apply': 'openspec.chat.apply',
        'archive': 'openspec.chat.archive'
      };

      const command = actionMap[action];
      if (command) {
        await vscode.commands.executeCommand(command);
      } else {
        ErrorHandler.debug(`Unknown retry action: ${action}`);
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `Cannot retry unknown action: ${action}`,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'retrying action', false);
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: `Retry failed: ${err.message}`,
        timestamp: Date.now()
      });
    }
  }

  private async _handlePhaseClick(phaseId: string): Promise<void> {
    ErrorHandler.debug(`Phase clicked: ${phaseId}`);
    
    const phaseDetails: Record<string, { title: string; description: string; actions: string[] }> = {
      new: {
        title: 'New Change Phase',
        description: 'Create a new OpenSpec change to start working on a feature, bug fix, or modification.',
        actions: ['Create new change', 'View existing changes']
      },
      drafting: {
        title: 'Drafting Phase',
        description: 'Draft the proposal, specifications, and design documents for your change.',
        actions: ['Edit proposal', 'View specs', 'Continue drafting']
      },
      implementation: {
        title: 'Implementation Phase',
        description: 'Implement the tasks defined in your change. This is where the actual coding happens.',
        actions: ['View tasks', 'Apply changes', 'Run tests']
      }
    };

    const details = phaseDetails[phaseId];
    if (details) {
      const message: ChatMessage = {
        id: this._generateMessageId(),
        role: 'system',
        content: `**${details.title}**\n\n${details.description}\n\n**Available actions:**\n${details.actions.map(a => `- ${a}`).join('\n')}`,
        timestamp: Date.now()
      };
      this.addMessage(message);
    }

    await vscode.commands.executeCommand('openspec.chat.phaseClicked', phaseId);
  }

  private async _handleOpenArtifact(artifactType: string, changeId: string, fileName?: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      let filePath: string;
      
      switch (artifactType) {
        case 'proposal':
          filePath = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'proposal.md');
          break;
        case 'design':
          filePath = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'design.md');
          break;
        case 'tasks':
          filePath = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'tasks.md');
          break;
        case 'spec':
        case 'specs':
          if (fileName) {
            filePath = path.join(workspaceFolder.uri.fsPath, 'openspec', 'changes', changeId, 'specs', fileName);
          } else {
            throw new Error('Filename required for spec artifacts');
          }
          break;
        default:
          throw new Error(`Unknown artifact type: ${artifactType}`);
      }

      if (!await WorkspaceUtils.fileExists(filePath)) {
        this.addMessage({
          id: this._generateMessageId(),
          role: 'system',
          content: `File not found: ${filePath}`,
          timestamp: Date.now()
        });
        return;
      }

      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'opening artifact in editor', false);
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: `Error opening artifact: ${err.message}`,
        timestamp: Date.now()
      });
    }
  }

  public displayQuestion(question: { id: string; question: string; options?: string[]; allowMultiple?: boolean; allowCustom?: boolean }): void {
    this.postMessage({
      type: 'displayQuestion',
      question
    });
  }

  public addScriptOutput(output: { type: 'stdout' | 'stderr' | 'error' | 'exit' | 'progress'; content: string; timestamp?: number; progress?: { current: number; total: number; message: string } }): void {
    this.postMessage({
      type: 'scriptOutput',
      output: {
        ...output,
        timestamp: output.timestamp || Date.now()
      }
    });
  }

  public updateScriptExecutionStatus(status: 'running' | 'completed' | 'error' | 'cancelled', message?: string): void {
    this.postMessage({
      type: 'scriptExecutionStatus',
      status,
      message
    });
  }

  public clearScriptOutput(): void {
    this.postMessage({
      type: 'clearScriptOutput'
    });
  }

  private async _handleAnswerQuestion(questionId: string, answers: string[]): Promise<void> {
    try {
      const acpClient = (await import('../services/acpClient')).AcpClient.getInstance();
      await acpClient.answerQuestion(questionId, answers);
      
      // Add user answer to chat
      const answerText = answers.join(', ');
      this.addMessage({
        id: this._generateMessageId(),
        role: 'user',
        content: `Answer: ${answerText}`,
        timestamp: Date.now(),
        metadata: { questionId }
      });
      
      // Hide the question UI
      this.postMessage({
        type: 'questionAnswered',
        questionId
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'answering question', false);
      this.addMessage({
        id: this._generateMessageId(),
        role: 'system',
        content: `Error submitting answer: ${err.message}`,
        timestamp: Date.now()
      });
    }
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

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
        <title>OpenSpec Chat</title>
        <link href="${stylesUri}" rel="stylesheet">
        <link href="${highlightStylesUri}" rel="stylesheet">
      </head>
      <body>
        <div class="chat-container">
          <div class="connection-error-banner" id="connectionErrorBanner" style="display: none;">
            <div class="connection-error-content">
              <span class="connection-error-icon">⚠</span>
              <span class="connection-error-message" id="connectionErrorMessage"></span>
              <button class="connection-error-retry-btn" id="connectionErrorRetryBtn" style="display: none;">
                <span class="retry-icon">↻</span> Retry
              </button>
            </div>
            <button class="connection-error-close" id="connectionErrorCloseBtn" title="Dismiss">✕</button>
          </div>
          <div class="offline-indicator-banner" id="offlineIndicatorBanner" style="display: none;">
            <div class="offline-indicator-content">
              <span class="offline-indicator-icon">📴</span>
              <span class="offline-indicator-message" id="offlineIndicatorMessage">Server unavailable. Messages will be queued and sent when connection is restored.</span>
              <span class="offline-indicator-count" id="offlineIndicatorCount"></span>
            </div>
            <button class="offline-indicator-close" id="offlineIndicatorCloseBtn" title="Dismiss">✕</button>
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
              <span class="action-btn-icon">⏭</span>
              <span class="action-btn-text">Fast Forward</span>
            </button>
            <button class="action-btn action-btn-apply" data-action="apply" title="Apply change tasks">
              <span class="action-btn-icon">▶</span>
              <span class="action-btn-text">Apply</span>
            </button>
            <button class="action-btn action-btn-archive" data-action="archive" title="Archive completed change">
              <span class="action-btn-icon">📦</span>
              <span class="action-btn-text">Archive</span>
            </button>
          </div>
          <div class="tool-calls-panel collapsed" id="toolCallsPanel">
            <div class="tool-calls-header" id="toolCallsHeader">
              <div class="tool-calls-title">
                <span class="tool-calls-icon">🔧</span>
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
              placeholder="Type your message..."
              rows="3"
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

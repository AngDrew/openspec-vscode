import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ErrorHandler } from '../utils/errorHandler';
import { PortManager } from './portManager';

// ACP JSON-RPC types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface ToolCall {
  id: string;
  tool: string;
  params: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
  result?: unknown;
  error?: string;
}

export interface ParsedResponse {
  messageId: string;
  content: string;
  toolCalls: ToolCall[];
  isComplete: boolean;
  timestamp: number;
}

export interface QuestionToolRequest {
  id: string;
  question: string;
  options?: string[];
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export type AcpMessage =
  | { type: 'text'; content: string; messageId?: string }
  | { type: 'text_delta'; delta: string; messageId: string }
  | { type: 'tool_call'; tool: string; params: unknown; id: string }
  | { type: 'tool_result'; tool: string; result: unknown; id: string }
  | { type: 'error'; message: string }
  | { type: 'status'; status: string }
  | { type: 'streaming_start'; messageId: string }
  | { type: 'streaming_end'; messageId: string }
  | { type: 'streaming_cancelled'; messageId: string; partialContent: string; isPartial: boolean }
  | { type: 'response_complete'; response: ParsedResponse }
  | { type: 'question_tool'; question: QuestionToolRequest }
  | { type: 'session_created'; sessionId: string; changeId?: string };

export interface AcpConnectionConfig {
  host: string;
  port: number;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface OfflineState {
  isOffline: boolean;
  lastConnectedAt?: number;
  offlineSince?: number;
  pendingMessageCount: number;
}

export class AcpClient {
  private static readonly DEFAULT_TIMEOUT = 30000;
  private static readonly DEFAULT_RETRY_ATTEMPTS = 5;
  private static readonly DEFAULT_RETRY_DELAY = 1000;
  private static readonly DEFAULT_HOST = '127.0.0.1';
  private static readonly MAX_QUEUED_MESSAGES = 50;
  private static readonly OFFLINE_RETRY_INTERVAL = 30000;
  private static instance: AcpClient;
  private portManager: PortManager;
  private config: AcpConnectionConfig;
  private requestId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (reason: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private messageListeners: Array<(message: AcpMessage) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private toolCallListeners: Array<(toolCall: ToolCall) => void> = [];
  private questionToolListeners: Array<(question: QuestionToolRequest) => void> = [];
  private sessionCreatedListeners: Array<(sessionId: string, changeId?: string) => void> = [];
  private isConnected = false;
  private currentSessionId: string | undefined;
  private acpProcess: ChildProcess | undefined;
  private messageQueue: string[] = [];
  private offlineState: OfflineState = { isOffline: false, pendingMessageCount: 0 };
  private offlineListeners: Array<(state: OfflineState) => void> = [];
  private lastSuccessfulConnection: number | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private isConnecting = false;

  private constructor() {
    this.portManager = PortManager.getInstance();
    this.config = {
      host: AcpClient.DEFAULT_HOST,
      port: 4099,
      timeoutMs: AcpClient.DEFAULT_TIMEOUT,
      retryAttempts: AcpClient.DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs: AcpClient.DEFAULT_RETRY_DELAY
    };
  }

  static getInstance(): AcpClient {
    if (!AcpClient.instance) {
      AcpClient.instance = new AcpClient();
    }
    return AcpClient.instance;
  }

  configure(config: Partial<AcpConnectionConfig>): void {
    this.config = { ...this.config, ...config };
    ErrorHandler.debug(`AcpClient configured: ${JSON.stringify(this.config)}`);
  }

  getConfig(): AcpConnectionConfig {
    return { ...this.config };
  }

  isClientConnected(): boolean {
    return this.isConnected && this.acpProcess !== undefined && !this.acpProcess.killed;
  }

  async connect(): Promise<boolean> {
    if (this.isConnecting) {
      ErrorHandler.debug('Connection already in progress, waiting...');
      // Wait for connection to complete
      let attempts = 0;
      while (this.isConnecting && attempts < 20) {
        await this.delay(100);
        attempts++;
      }
      return this.isConnected;
    }

    if (this.isClientConnected()) {
      return true;
    }

    this.isConnecting = true;

    try {
      const port = this.portManager.getSelectedPort() || this.config.port;
      
      for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
        try {
          ErrorHandler.debug(`Connecting to ACP server (attempt ${attempt}/${this.config.retryAttempts})...`);

          const connected = await this.tryConnect(port);

          if (connected) {
            this.isConnected = true;
            this.config.port = port;
            this.lastSuccessfulConnection = Date.now();
            this.updateOfflineState(false);
            this.notifyConnectionListeners(true);
            ErrorHandler.debug(`Successfully connected to ACP server on port ${port}`);
            return true;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          ErrorHandler.debug(`Connection attempt ${attempt} failed: ${errorMessage}`);

          if (attempt < this.config.retryAttempts) {
            const delay = this.calculateBackoffDelay(attempt);
            ErrorHandler.debug(`Retrying in ${delay}ms...`);
            await this.delay(delay);
          }
        }
      }

      this.isConnected = false;
      this.updateOfflineState(true);
      this.notifyConnectionListeners(false);
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = this.config.retryDelayMs;
    const maxDelay = 30000;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async tryConnect(port: number): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    // Check if HTTP server is already running on this port
    try {
      const isRunning = await this.checkHttpServer(port);
      if (isRunning) {
        ErrorHandler.debug(`HTTP server already running on port ${port}`);
        // Start ACP process which will connect to existing server
        await this.startAcpProcess(port, workspaceFolder.uri.fsPath);
        return true;
      }
    } catch {
      // Server not running, we'll start it
    }

    // Start ACP server (which also starts HTTP server)
    await this.startAcpProcess(port, workspaceFolder.uri.fsPath);
    
    // Wait for HTTP server to be ready
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      await this.delay(500);
      const isReady = await this.checkHttpServer(port);
      if (isReady) {
        return true;
      }
      attempts++;
    }

    throw new Error(`ACP server did not start within ${maxAttempts * 500}ms`);
  }

  private async checkHttpServer(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const http = require('http');
      const req = http.get(`http://127.0.0.1:${port}/global/health`, {
        timeout: 1000
      }, (res: { statusCode?: number }) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private async startAcpProcess(port: number, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if we already have a process running
      if (this.acpProcess && !this.acpProcess.killed) {
        ErrorHandler.debug('ACP process already running, reusing');
        resolve();
        return;
      }

      ErrorHandler.debug(`Starting ACP process on port ${port}...`);

      this.acpProcess = spawn('opencode', ['acp', '--port', String(port), '--hostname', '127.0.0.1', '--print-logs'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let buffer = '';

      this.acpProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            this.handleAcpLine(line.trim());
          }
        }
      });

      this.acpProcess.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          ErrorHandler.debug(`ACP stderr: ${message}`);
        }
      });

      this.acpProcess.on('error', (error) => {
        ErrorHandler.handle(error, 'ACP process error', false);
        this.isConnected = false;
        this.notifyConnectionListeners(false);
        reject(error);
      });

      this.acpProcess.on('exit', (code) => {
        ErrorHandler.debug(`ACP process exited with code ${code}`);
        this.isConnected = false;
        this.notifyConnectionListeners(false);
        
        // Schedule reconnect
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this.isClientConnected()) {
              ErrorHandler.debug('Attempting to reconnect ACP...');
              this.connect().catch(() => {});
            }
          }, 5000);
        }
      });

      // Give it a moment to start
      setTimeout(() => {
        if (this.acpProcess && !this.acpProcess.killed) {
          resolve();
        } else {
          reject(new Error('ACP process failed to start'));
        }
      }, 1000);
    });
  }

  private handleAcpLine(line: string): void {
    try {
      const message = JSON.parse(line);
      
      // Check if it's a response to a pending request
      if (message.id !== undefined && this.pendingRequests.has(message.id)) {
        const request = this.pendingRequests.get(message.id);
        if (request) {
          clearTimeout(request.timeout);
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            request.reject(new Error(message.error.message || 'Unknown error'));
          } else {
            request.resolve(message);
          }
        }
        return;
      }

      // Handle notifications/messages
      if (message.method) {
        this.handleNotification(message);
      }
    } catch {
      // Not valid JSON, might be log output
      ErrorHandler.debug(`ACP output: ${line}`);
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case 'sessionUpdate': {
        const params = notification.params as unknown as { update?: unknown };
        if (params?.update) {
          this.handleSessionUpdate(params.update);
        }
        break;
      }
      case 'message':
        this.notifyMessageListeners({
          type: 'text',
          content: (notification.params as unknown as { content?: string })?.content || '',
          messageId: (notification.params as unknown as { messageId?: string })?.messageId
        });
        break;
      case 'message_delta':
        this.notifyMessageListeners({
          type: 'text_delta',
          delta: (notification.params as unknown as { delta?: string })?.delta || '',
          messageId: (notification.params as unknown as { messageId?: string })?.messageId || 'unknown'
        });
        break;
      case 'streaming_start':
        this.notifyMessageListeners({
          type: 'streaming_start',
          messageId: (notification.params as unknown as { messageId?: string })?.messageId || 'unknown'
        });
        break;
      case 'streaming_end':
        this.notifyMessageListeners({
          type: 'streaming_end',
          messageId: (notification.params as unknown as { messageId?: string })?.messageId || 'unknown'
        });
        break;
      case 'tool_call': {
        const toolParams = notification.params as unknown as { id?: string; tool?: string; params?: unknown };
        const toolCall: ToolCall = {
          id: toolParams?.id || `tool_${Date.now()}`,
          tool: toolParams?.tool || 'unknown',
          params: toolParams?.params || {},
          status: 'running',
          startTime: Date.now()
        };
        this.notifyToolCallListeners(toolCall);
        break;
      }
    }
  }

  private handleSessionUpdate(update: unknown): void {
    const u = update as { sessionUpdate?: string; content?: { text?: string }; toolCallId?: string; title?: string; rawInput?: unknown; status?: string };
    switch (u.sessionUpdate) {
      case 'agent_message_chunk':
        if (u.content?.text) {
          this.notifyMessageListeners({
            type: 'text_delta',
            delta: u.content.text,
            messageId: this.currentSessionId || 'unknown'
          });
        }
        break;
      case 'user_message_chunk':
        // User message update, usually from replay
        break;
      case 'tool_call': {
        const toolCall: ToolCall = {
          id: u.toolCallId || `tool_${Date.now()}`,
          tool: u.title || 'unknown',
          params: u.rawInput || {},
          status: u.status === 'pending' ? 'pending' : 'running',
          startTime: Date.now()
        };
        this.notifyToolCallListeners(toolCall);
        break;
      }
      case 'tool_call_update':
        // Tool call status update
        break;
      case 'plan':
        // Plan/todo update
        break;
    }
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.acpProcess || this.acpProcess.killed) {
        reject(new Error('ACP process not running'));
        return;
      }

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request ${request.id} timed out`));
      }, this.config.timeoutMs);

      this.pendingRequests.set(request.id, { resolve, reject, timeout });

      const message = JSON.stringify(request) + '\n';
      this.acpProcess.stdin?.write(message, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(request.id);
          reject(error);
        }
      });
    });
  }

  async createSession(): Promise<string | undefined> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder');
      }

      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'session/new',
        params: {
          cwd: workspaceFolder.uri.fsPath,
          mcpServers: []
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.result as { sessionId?: string } | undefined;
      if (result?.sessionId) {
        this.currentSessionId = result.sessionId;
        this.notifyMessageListeners({
          type: 'session_created',
          sessionId: result.sessionId
        });
        return result.sessionId;
      }

      return undefined;
    } catch (error) {
      ErrorHandler.handle(error as Error, 'creating ACP session', false);
      return undefined;
    }
  }

  async loadSession(sessionId: string): Promise<boolean> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder');
      }

      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'session/load',
        params: {
          sessionId,
          cwd: workspaceFolder.uri.fsPath,
          mcpServers: []
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      this.currentSessionId = sessionId;
      return true;
    } catch (error) {
      ErrorHandler.handle(error as Error, 'loading ACP session', false);
      return false;
    }
  }

  async sendPrompt(sessionId: string, content: string): Promise<void> {
    try {
      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{
            type: 'text',
            text: content
          }]
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      ErrorHandler.handle(error as Error, 'sending prompt to ACP', false);
      throw error;
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    try {
      await this.sendRequest({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'cancel',
        params: { sessionId }
      });
    } catch (error) {
      ErrorHandler.handle(error as Error, 'canceling ACP session', false);
    }
  }

  async answerQuestion(questionId: string, answers: string[]): Promise<void> {
    try {
      // This is handled via prompt - send the answer as a user message
      if (this.currentSessionId) {
        await this.sendPrompt(
          this.currentSessionId,
          `Answer to question ${questionId}: ${answers.join(', ')}`
        );
      }
    } catch (error) {
      ErrorHandler.handle(error as Error, 'answering question via ACP', false);
      throw error;
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('No active ACP session');
    }
    await this.sendPrompt(this.currentSessionId, content);
  }

  cancelStreaming(): { messageId: string; content: string } | undefined {
    if (!this.currentSessionId) {
      return undefined;
    }
    
    // Cancel the current session
    this.cancelSession(this.currentSessionId).catch(() => {});
    
    // Return a cancelled response
    return {
      messageId: this.currentSessionId,
      content: '[Streaming cancelled by user]'
    };
  }

  async startPlanMode(): Promise<boolean> {
    try {
      // In ACP, plan mode is just a regular session
      // The agent will determine the mode based on context
      if (!this.currentSessionId) {
        const sessionId = await this.createSession();
        if (!sessionId) {
          return false;
        }
      }
      return true;
    } catch (error) {
      ErrorHandler.handle(error as Error, 'starting ACP plan mode', false);
      return false;
    }
  }

  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  onMessage(listener: (message: AcpMessage) => void): vscode.Disposable {
    this.messageListeners.push(listener);
    return new vscode.Disposable(() => {
      const index = this.messageListeners.indexOf(listener);
      if (index > -1) {
        this.messageListeners.splice(index, 1);
      }
    });
  }

  onConnectionChange(listener: (connected: boolean) => void): vscode.Disposable {
    this.connectionListeners.push(listener);
    // Call immediately with current state
    listener(this.isClientConnected());
    return new vscode.Disposable(() => {
      const index = this.connectionListeners.indexOf(listener);
      if (index > -1) {
        this.connectionListeners.splice(index, 1);
      }
    });
  }

  onToolCall(listener: (toolCall: ToolCall) => void): vscode.Disposable {
    this.toolCallListeners.push(listener);
    return new vscode.Disposable(() => {
      const index = this.toolCallListeners.indexOf(listener);
      if (index > -1) {
        this.toolCallListeners.splice(index, 1);
      }
    });
  }

  onQuestionTool(listener: (question: QuestionToolRequest) => void): vscode.Disposable {
    this.questionToolListeners.push(listener);
    return new vscode.Disposable(() => {
      const index = this.questionToolListeners.indexOf(listener);
      if (index > -1) {
        this.questionToolListeners.splice(index, 1);
      }
    });
  }

  onSessionCreated(listener: (sessionId: string, changeId?: string) => void): vscode.Disposable {
    this.sessionCreatedListeners.push(listener);
    return new vscode.Disposable(() => {
      const index = this.sessionCreatedListeners.indexOf(listener);
      if (index > -1) {
        this.sessionCreatedListeners.splice(index, 1);
      }
    });
  }

  onOfflineChange(listener: (state: OfflineState) => void): vscode.Disposable {
    this.offlineListeners.push(listener);
    listener(this.offlineState);
    return new vscode.Disposable(() => {
      const index = this.offlineListeners.indexOf(listener);
      if (index > -1) {
        this.offlineListeners.splice(index, 1);
      }
    });
  }

  private notifyMessageListeners(message: AcpMessage): void {
    this.messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        ErrorHandler.debug(`Error in message listener: ${error}`);
      }
    });
  }

  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach(listener => {
      try {
        listener(connected);
      } catch (error) {
        ErrorHandler.debug(`Error in connection listener: ${error}`);
      }
    });
  }

  private notifyToolCallListeners(toolCall: ToolCall): void {
    this.toolCallListeners.forEach(listener => {
      try {
        listener(toolCall);
      } catch (error) {
        ErrorHandler.debug(`Error in tool call listener: ${error}`);
      }
    });
  }

  private notifyQuestionToolListeners(question: QuestionToolRequest): void {
    this.questionToolListeners.forEach(listener => {
      try {
        listener(question);
      } catch (error) {
        ErrorHandler.debug(`Error in question tool listener: ${error}`);
      }
    });
  }

  private notifySessionCreatedListeners(sessionId: string, changeId?: string): void {
    this.sessionCreatedListeners.forEach(listener => {
      try {
        listener(sessionId, changeId);
      } catch (error) {
        ErrorHandler.debug(`Error in session created listener: ${error}`);
      }
    });
  }

  private updateOfflineState(isOffline: boolean): void {
    this.offlineState = {
      isOffline,
      pendingMessageCount: this.messageQueue.length,
      offlineSince: isOffline ? Date.now() : undefined,
      lastConnectedAt: !isOffline ? Date.now() : this.lastSuccessfulConnection
    };

    this.offlineListeners.forEach(listener => {
      try {
        listener(this.offlineState);
      } catch (error) {
        ErrorHandler.debug(`Error in offline listener: ${error}`);
      }
    });
  }

  clearSession(): void {
    this.currentSessionId = undefined;
  }

  getQueuedMessages(): { id: string; content: string; timestamp: number; retryCount: number }[] {
    return this.messageQueue.map((content, index) => ({
      id: `queued_${index}`,
      content,
      timestamp: Date.now(),
      retryCount: 0
    }));
  }

  clearMessageQueue(): void {
    this.messageQueue = [];
    this.updateOfflineState(this.offlineState.isOffline);
  }

  getOfflineState(): OfflineState {
    return { ...this.offlineState };
  }

  dispose(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.pendingRequests.forEach(request => {
      clearTimeout(request.timeout);
      request.reject(new Error('Client disposed'));
    });
    this.pendingRequests.clear();

    if (this.acpProcess && !this.acpProcess.killed) {
      this.acpProcess.kill('SIGTERM');
    }

    this.messageListeners = [];
    this.connectionListeners = [];
    this.toolCallListeners = [];
    this.offlineListeners = [];
  }
}

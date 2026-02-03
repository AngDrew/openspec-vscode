import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { ErrorHandler } from '../utils/errorHandler';
import { PortManager } from './portManager';
import { AcpTransport } from './acpTransport';
import {
  InitializeRequest, InitializeResponse, NewSessionRequest, NewSessionResponse,
  LoadSessionRequest, LoadSessionResponse, PromptRequest, PromptResponse,
  CancelNotification, SetSessionModeRequest, SetSessionModelRequest,
  SessionNotification, ReadTextFileRequest, ReadTextFileResponse,
  WriteTextFileRequest, WriteTextFileResponse, RequestPermissionRequest,
  RequestPermissionResponse, CreateTerminalRequest, CreateTerminalResponse,
  TerminalOutputRequest, TerminalOutputResponse, WaitForTerminalExitRequest,
  WaitForTerminalExitResponse, KillTerminalCommandRequest, KillTerminalCommandResponse,
  ReleaseTerminalRequest, ReleaseTerminalResponse, ToolCall, AcpMessage,
  QuestionToolRequest, AcpConnectionConfig, OfflineState, ACP_METHODS,
  AgentMessageChunkUpdate, ToolCallUpdate, ToolCallUpdateUpdate, PlanUpdate,
  AvailableCommandsUpdate, CurrentModeUpdate, AgentThoughtChunkUpdate,
  SessionModeState, SessionModelState, AvailableCommand
} from './acpTypes';

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
  private transport: AcpTransport | undefined;
  private acpProcess: ChildProcess | undefined;
  
  private isConnected = false;
  private isConnecting = false;
  private currentSessionId: string | undefined;
  private sessionMetadata: {
    modes: SessionModeState | null;
    models: SessionModelState | null;
    commands: AvailableCommand[] | null;
  } = { modes: null, models: null, commands: null };
  
  private messageListeners: Array<(message: AcpMessage) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private toolCallListeners: Array<(toolCall: ToolCall) => void> = [];
  private questionToolListeners: Array<(question: QuestionToolRequest) => void> = [];
  private sessionCreatedListeners: Array<(sessionId: string, changeId?: string) => void> = [];
  private offlineListeners: Array<(state: OfflineState) => void> = [];
  private offlineState: OfflineState = { isOffline: false, pendingMessageCount: 0 };
  private messageQueue: string[] = [];
  private lastSuccessfulConnection: number | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  
  // Client capability handlers
  private readTextFileHandler: ((params: ReadTextFileRequest) => Promise<ReadTextFileResponse>) | null = null;
  private writeTextFileHandler: ((params: WriteTextFileRequest) => Promise<WriteTextFileResponse>) | null = null;
  private requestPermissionHandler: ((params: RequestPermissionRequest) => Promise<RequestPermissionResponse>) | null = null;
  private createTerminalHandler: ((params: CreateTerminalRequest) => Promise<CreateTerminalResponse>) | null = null;
  private terminalOutputHandler: ((params: TerminalOutputRequest) => Promise<TerminalOutputResponse>) | null = null;
  private waitForTerminalExitHandler: ((params: WaitForTerminalExitRequest) => Promise<WaitForTerminalExitResponse>) | null = null;
  private killTerminalHandler: ((params: KillTerminalCommandRequest) => Promise<KillTerminalCommandResponse>) | null = null;
  private releaseTerminalHandler: ((params: ReleaseTerminalRequest) => Promise<ReleaseTerminalResponse>) | null = null;

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
    return this.isConnected && !!this.transport?.isTransportConnected();
  }

  async connect(): Promise<boolean> {
    if (this.isConnecting) {
      ErrorHandler.debug('Connection already in progress, waiting...');
      let attempts = 0;
      while (this.isConnecting && attempts < 50) {
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
    let httpRunning = false;
    try {
      httpRunning = await this.checkHttpServer(port);
      if (httpRunning) {
        ErrorHandler.debug(`HTTP server already running on port ${port}`);
      }
    } catch {
      // Server not running, we'll start it
    }

    // Start ACP process
    await this.startAcpProcess(port, workspaceFolder.uri.fsPath);

    // If HTTP wasn't running, wait for it to be ready
    if (!httpRunning) {
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
      throw new Error(`HTTP server did not start within ${maxAttempts * 500}ms`);
    }

    return true;
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
    // Kill existing process if any
    if (this.acpProcess && !this.acpProcess.killed) {
      ErrorHandler.debug('Killing existing ACP process');
      this.acpProcess.kill('SIGTERM');
      await this.delay(500);
    }

    ErrorHandler.debug(`Starting ACP process on port ${port}...`);

    // Start opencode acp without --print-logs to avoid stdout pollution
    this.acpProcess = spawn('opencode', ['acp', '--port', String(port), '--hostname', '127.0.0.1'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create transport
    this.transport = new AcpTransport(
      (method, params) => this.handleAgentRequest(method, params),
      (method, params) => this.handleAgentNotification(method, params),
      {
        timeoutMs: this.config.timeoutMs,
        onDisconnect: () => {
          this.isConnected = false;
          this.notifyConnectionListeners(false);
          this.scheduleReconnect();
        },
        onError: (error) => {
          ErrorHandler.handle(error, 'ACP transport error', false);
        }
      }
    );

    // Connect transport
    await this.transport.connect(this.acpProcess);

    // Initialize the connection
    const initRequest: InitializeRequest = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true
        },
        terminal: true
      },
      clientInfo: {
        name: 'openspec-vscode',
        version: '2.0.0'
      }
    };

    const initResponse = await this.sendRequest<InitializeResponse>(
      ACP_METHODS.initialize,
      initRequest
    );

    ErrorHandler.debug(`ACP initialized: protocol v${initResponse.protocolVersion}`);
  }

  private async handleAgentRequest(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case ACP_METHODS.fsReadTextFile:
        if (this.readTextFileHandler) {
          return this.readTextFileHandler(params as ReadTextFileRequest);
        }
        throw new Error('readTextFile not implemented');

      case ACP_METHODS.fsWriteTextFile:
        if (this.writeTextFileHandler) {
          return this.writeTextFileHandler(params as WriteTextFileRequest);
        }
        throw new Error('writeTextFile not implemented');

      case ACP_METHODS.sessionRequestPermission:
        if (this.requestPermissionHandler) {
          return this.requestPermissionHandler(params as RequestPermissionRequest);
        }
        // Auto-approve by default
        return {
          outcome: {
            outcome: 'selected',
            optionId: 'allow_once'
          }
        } as RequestPermissionResponse;

      case ACP_METHODS.terminalCreate:
        if (this.createTerminalHandler) {
          return this.createTerminalHandler(params as CreateTerminalRequest);
        }
        throw new Error('terminal/create not implemented');

      case ACP_METHODS.terminalOutput:
        if (this.terminalOutputHandler) {
          return this.terminalOutputHandler(params as TerminalOutputRequest);
        }
        throw new Error('terminal/output not implemented');

      case ACP_METHODS.terminalWaitForExit:
        if (this.waitForTerminalExitHandler) {
          return this.waitForTerminalExitHandler(params as WaitForTerminalExitRequest);
        }
        throw new Error('terminal/wait_for_exit not implemented');

      case ACP_METHODS.terminalKill:
        if (this.killTerminalHandler) {
          return this.killTerminalHandler(params as KillTerminalCommandRequest);
        }
        throw new Error('terminal/kill not implemented');

      case ACP_METHODS.terminalRelease:
        if (this.releaseTerminalHandler) {
          return this.releaseTerminalHandler(params as ReleaseTerminalRequest);
        }
        throw new Error('terminal/release not implemented');

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async handleAgentNotification(method: string, params: unknown): Promise<void> {
    if (method === ACP_METHODS.sessionUpdate) {
      const notification = params as SessionNotification;
      this.handleSessionUpdate(notification.update);
    } else {
      ErrorHandler.debug(`Unknown notification: ${method}`);
    }
  }

  private handleSessionUpdate(update: SessionNotification['update']): void {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const chunk = update as AgentMessageChunkUpdate;
        if (chunk.content?.type === 'text' && chunk.content.text) {
          this.notifyMessageListeners({
            type: 'text_delta',
            delta: chunk.content.text,
            messageId: this.currentSessionId
          });
        }
        break;
      }

      case 'user_message_chunk':
        // User message chunks are usually from replay, can ignore
        break;

      case 'tool_call': {
        const tool = update as ToolCallUpdate;
        const toolCall: ToolCall = {
          id: tool.toolCallId,
          tool: tool.title,
          params: tool.rawInput,
          status: tool.status === 'pending' ? 'pending' : 'running',
          startTime: Date.now()
        };
        this.notifyToolCallListeners(toolCall);
        this.notifyMessageListeners({
          type: 'tool_call',
          tool: tool.title,
          params: tool.rawInput,
          id: tool.toolCallId
        });
        break;
      }

      case 'tool_call_update': {
        const toolUpdate = update as ToolCallUpdateUpdate;
        const toolCall: ToolCall = {
          id: toolUpdate.toolCallId,
          tool: toolUpdate.title || 'unknown',
          params: toolUpdate.rawInput,
          status: toolUpdate.status === 'completed' ? 'completed' : 
                   toolUpdate.status === 'failed' ? 'error' : 'running',
          startTime: Date.now(),
          result: toolUpdate.rawOutput
        };
        this.notifyToolCallListeners(toolCall);
        this.notifyMessageListeners({
          type: 'tool_call_update',
          toolCall
        });
        break;
      }

      case 'available_commands_update': {
        const commandsUpdate = update as AvailableCommandsUpdate;
        this.sessionMetadata.commands = commandsUpdate.availableCommands;
        break;
      }

      case 'current_mode_update': {
        const modeUpdate = update as CurrentModeUpdate;
        if (this.sessionMetadata.modes) {
          this.sessionMetadata.modes.currentModeId = modeUpdate.currentModeId;
        }
        break;
      }

      case 'plan': {
        const planUpdate = update as PlanUpdate;
        this.notifyMessageListeners({
          type: 'plan',
          plan: { entries: planUpdate.entries }
        });
        break;
      }

      case 'agent_thought_chunk': {
        const thought = update as AgentThoughtChunkUpdate;
        if (thought.content?.type === 'text' && thought.content.text) {
          // Could expose this separately if needed
        }
        break;
      }
    }
  }

  private async sendRequest<T>(method: string, params: unknown): Promise<T> {
    if (!this.transport) {
      throw new Error('Transport not initialized');
    }
    const response = await this.transport.sendRequest(method, params);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result as T;
  }

  private async sendNotification(method: string, params: unknown): Promise<void> {
    if (!this.transport) {
      throw new Error('Transport not initialized');
    }
    await this.transport.sendNotification(method, params);
  }

  async initialize(): Promise<InitializeResponse> {
    const request: InitializeRequest = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true
      },
      clientInfo: { name: 'openspec-vscode', version: '2.0.0' }
    };
    return this.sendRequest<InitializeResponse>(ACP_METHODS.initialize, request);
  }

  async createSession(): Promise<string | undefined> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder');
      }

      const request: NewSessionRequest = {
        cwd: workspaceFolder.uri.fsPath,
        mcpServers: []
      };

      const response = await this.sendRequest<NewSessionResponse>(ACP_METHODS.sessionNew, request);

      this.currentSessionId = response.sessionId;
      this.sessionMetadata.modes = response.modes || null;
      this.sessionMetadata.models = response.models || null;

      this.notifyMessageListeners({
        type: 'session_created',
        sessionId: response.sessionId
      });

      this.notifySessionCreatedListeners(response.sessionId);

      return response.sessionId;
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

      const request: LoadSessionRequest = {
        sessionId,
        cwd: workspaceFolder.uri.fsPath,
        mcpServers: []
      };

      const response = await this.sendRequest<LoadSessionResponse>(ACP_METHODS.sessionLoad, request);

      this.currentSessionId = sessionId;
      this.sessionMetadata.modes = response.modes || null;
      this.sessionMetadata.models = response.models || null;

      return true;
    } catch (error) {
      ErrorHandler.handle(error as Error, 'loading ACP session', false);
      return false;
    }
  }

  async sendPrompt(sessionId: string, content: string): Promise<void> {
    const request: PromptRequest = {
      sessionId,
      prompt: [{ type: 'text', text: content }]
    };

    const response = await this.sendRequest<PromptResponse>(ACP_METHODS.sessionPrompt, request);

    // Response comes via session/update notifications, so we just check for errors
    if (response.stopReason === 'error') {
      throw new Error('Prompt processing failed');
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    const notification: CancelNotification = { sessionId };
    await this.sendNotification(ACP_METHODS.sessionCancel, notification);
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    const request: SetSessionModeRequest = { sessionId, modeId };
    await this.sendRequest<void>(ACP_METHODS.sessionSetMode, request);
    
    if (this.sessionMetadata.modes) {
      this.sessionMetadata.modes.currentModeId = modeId;
    }
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    const request: SetSessionModelRequest = { sessionId, modelId };
    await this.sendRequest<void>(ACP_METHODS.sessionSetModel, request);
    
    if (this.sessionMetadata.models) {
      this.sessionMetadata.models.currentModelId = modelId;
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

    this.cancelSession(this.currentSessionId).catch(() => {});

    return {
      messageId: this.currentSessionId,
      content: '[Streaming cancelled by user]'
    };
  }

  async startPlanMode(): Promise<boolean> {
    try {
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

  async answerQuestion(questionId: string, answers: string[]): Promise<void> {
    try {
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

  async validateSession(acpSessionId: string): Promise<boolean> {
    try {
      if (!this.isClientConnected()) {
        ErrorHandler.debug(`Cannot validate session ${acpSessionId}: ACP client not connected`);
        return false;
      }

      // Try to load the session - if it succeeds, the session is valid
      const loaded = await this.loadSession(acpSessionId);
      return loaded;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ErrorHandler.debug(`Error validating session ${acpSessionId}: ${errorMessage}`);
      return false;
    }
  }

  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  getSessionMetadata() {
    return { ...this.sessionMetadata };
  }

  // Client capability setters
  setOnReadTextFile(handler: (params: ReadTextFileRequest) => Promise<ReadTextFileResponse>): void {
    this.readTextFileHandler = handler;
  }

  setOnWriteTextFile(handler: (params: WriteTextFileRequest) => Promise<WriteTextFileResponse>): void {
    this.writeTextFileHandler = handler;
  }

  setOnRequestPermission(handler: (params: RequestPermissionRequest) => Promise<RequestPermissionResponse>): void {
    this.requestPermissionHandler = handler;
  }

  setOnCreateTerminal(handler: (params: CreateTerminalRequest) => Promise<CreateTerminalResponse>): void {
    this.createTerminalHandler = handler;
  }

  setOnTerminalOutput(handler: (params: TerminalOutputRequest) => Promise<TerminalOutputResponse>): void {
    this.terminalOutputHandler = handler;
  }

  setOnWaitForTerminalExit(handler: (params: WaitForTerminalExitRequest) => Promise<WaitForTerminalExitResponse>): void {
    this.waitForTerminalExitHandler = handler;
  }

  setOnKillTerminal(handler: (params: KillTerminalCommandRequest) => Promise<KillTerminalCommandResponse>): void {
    this.killTerminalHandler = handler;
  }

  setOnReleaseTerminal(handler: (params: ReleaseTerminalRequest) => Promise<ReleaseTerminalResponse>): void {
    this.releaseTerminalHandler = handler;
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

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.isClientConnected()) {
        ErrorHandler.debug('Attempting to reconnect ACP...');
        this.connect().catch(() => {});
      }
    }, 5000);
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

    this.transport?.dispose();
    this.transport = undefined;

    if (this.acpProcess && !this.acpProcess.killed) {
      this.acpProcess.kill('SIGTERM');
    }
    this.acpProcess = undefined;

    this.isConnected = false;
    this.messageListeners = [];
    this.connectionListeners = [];
    this.toolCallListeners = [];
    this.offlineListeners = [];
  }
}

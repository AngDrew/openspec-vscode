import * as vscode from 'vscode';
import * as http from 'http';
import { ErrorHandler } from '../utils/errorHandler';
import { PortManager } from './portManager';

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

export interface PlanModeConfig {
  enabled: boolean;
  initialPrompt: string;
  skillName: string;
}

export interface QuestionToolRequest {
  id: string;
  question: string;
  options?: string[];
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export interface QuestionToolResponse {
  questionId: string;
  answers: string[];
}

export interface QueuedMessage {
  id: string;
  content: string;
  timestamp: number;
  retryCount: number;
  abortSignal?: AbortSignal;
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
  private responseListeners: Array<(response: ParsedResponse) => void> = [];
  private questionToolListeners: Array<(question: QuestionToolRequest) => void> = [];
  private sessionCreatedListeners: Array<(sessionId: string, changeId?: string) => void> = [];
  private isConnected = false;
  private planModeConfig: PlanModeConfig = {
    enabled: false,
    initialPrompt: 'use openspec skill to create new change, always use questions tool if need to answer user questions',
    skillName: 'openspec'
  };
  private currentSessionId: string | undefined;
  private pendingQuestions = new Map<string, QuestionToolRequest>();
  private sseConnection: http.ClientRequest | undefined;
  private sseReconnectAttempts = 0;
  private readonly MAX_SSE_RECONNECT_ATTEMPTS = 5;
  private sseReconnectTimer: NodeJS.Timeout | undefined;
  private activeStreamMessageId: string | undefined;
  private activeToolCalls = new Map<string, ToolCall>();
  private currentResponseBuffer = '';
  private currentResponse: Partial<ParsedResponse> | undefined;
  private abortController: AbortController | undefined;
  
  // Graceful degradation - offline mode support
  private messageQueue: QueuedMessage[] = [];
  private offlineState: OfflineState = { isOffline: false, pendingMessageCount: 0 };
  private offlineRetryTimer: NodeJS.Timeout | undefined;
  private offlineListeners: Array<(state: OfflineState) => void> = [];
  private lastSuccessfulConnection: number | undefined;

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

  async connect(): Promise<boolean> {
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

    const shouldStart = await vscode.window.showWarningMessage(
      `Failed to connect to OpenCode server after ${this.config.retryAttempts} attempts. Would you like to start the server?`,
      'Start Server',
      'Cancel'
    );

    if (shouldStart === 'Start Server') {
      vscode.commands.executeCommand('openspec.startServer');
    }

    return false;
  }

  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = this.config.retryDelayMs;
    const maxDelay = 30000;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  private async tryConnect(port: number): Promise<boolean> {
    try {
      const response = await this.httpRequest('GET', '/health', undefined, 5000);
      if (response.statusCode === 200) {
        this.setupSseConnection(port);
        return true;
      }
      throw new Error(`Health check failed with status ${response.statusCode}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Connection failed: ${errorMessage}`);
    }
  }

  private setupSseConnection(port: number): void {
    if (this.sseConnection) {
      this.sseConnection.destroy();
    }

    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = undefined;
    }

    const options: http.RequestOptions = {
      hostname: this.config.host,
      port: port,
      path: '/events',
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    };

    this.sseConnection = http.request(options, (res) => {
      ErrorHandler.debug('SSE connection established');
      this.sseReconnectAttempts = 0;

      let buffer = '';

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as JsonRpcNotification;
              this.handleNotification(data);
            } catch (error) {
              ErrorHandler.debug(`Failed to parse SSE message: ${error}`);
            }
          } else if (line.startsWith('event: ')) {
            // Handle event type if needed
            const eventType = line.slice(7).trim();
            ErrorHandler.debug(`SSE event type: ${eventType}`);
          } else if (line.startsWith('id: ')) {
            // Handle event ID for resuming
            const eventId = line.slice(4).trim();
            ErrorHandler.debug(`SSE event ID: ${eventId}`);
          }
        }
      });

      res.on('end', () => {
        ErrorHandler.debug('SSE connection ended');
        this.handleSseDisconnect(port);
      });

      res.on('error', (error: Error) => {
        ErrorHandler.debug(`SSE connection error: ${error.message}`);
        this.handleSseDisconnect(port);
      });
    });

    this.sseConnection.on('error', (error: Error) => {
      ErrorHandler.debug(`SSE request error: ${error.message}`);
      this.handleSseDisconnect(port);
    });

    this.sseConnection.end();
  }

  private handleSseDisconnect(port: number): void {
    if (!this.isConnected) {
      return;
    }

    this.sseReconnectAttempts++;

    if (this.sseReconnectAttempts > this.MAX_SSE_RECONNECT_ATTEMPTS) {
      ErrorHandler.debug(`SSE reconnection failed after ${this.MAX_SSE_RECONNECT_ATTEMPTS} attempts`);
      this.isConnected = false;
      this.notifyConnectionListeners(false);
      return;
    }

    const backoffDelay = Math.min(
      1000 * Math.pow(2, this.sseReconnectAttempts - 1),
      30000
    );

    ErrorHandler.debug(`SSE reconnecting in ${backoffDelay}ms (attempt ${this.sseReconnectAttempts}/${this.MAX_SSE_RECONNECT_ATTEMPTS})`);

    this.sseReconnectTimer = setTimeout(() => {
      this.setupSseConnection(port);
    }, backoffDelay);
  }

  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case 'message': {
        const params = notification.params as { content?: string; type?: string; messageId?: string };
        if (params.content) {
          this.currentResponseBuffer += params.content;
          this.notifyMessageListeners({
            type: 'text',
            content: params.content,
            messageId: params.messageId
          });
        }
        break;
      }
      case 'message_delta': {
        const params = notification.params as { delta?: string; messageId?: string };
        if (params.delta && params.messageId) {
          this.currentResponseBuffer += params.delta;
          this.notifyMessageListeners({
            type: 'text_delta',
            delta: params.delta,
            messageId: params.messageId
          });
        }
        break;
      }
      case 'streaming_start': {
        const params = notification.params as { messageId?: string };
        if (params.messageId) {
          this.activeStreamMessageId = params.messageId;
          this.notifyMessageListeners({
            type: 'streaming_start',
            messageId: params.messageId
          });
        }
        break;
      }
      case 'streaming_end': {
        const params = notification.params as { messageId?: string };
        if (params.messageId) {
          this.activeStreamMessageId = undefined;
          this.notifyMessageListeners({
            type: 'streaming_end',
            messageId: params.messageId
          });

          if (this.currentResponse && this.currentResponse.messageId === params.messageId) {
            this.currentResponse.isComplete = true;
            this.currentResponse.content = this.currentResponseBuffer;
            const response = this.currentResponse as ParsedResponse;
            this.notifyResponseListeners(response);
            this.notifyMessageListeners({
              type: 'response_complete',
              response
            });
          }
        }
        break;
      }
      case 'tool_call': {
        const params = notification.params as { tool?: string; params?: unknown; id?: string };
        if (params.tool && params.id) {
          const toolCall: ToolCall = {
            id: params.id,
            tool: params.tool,
            params: params.params || {},
            status: 'running',
            startTime: Date.now()
          };

          this.activeToolCalls.set(params.id, toolCall);
          this.notifyToolCallListeners(toolCall);
          this.notifyMessageListeners({
            type: 'tool_call',
            tool: params.tool,
            params: params.params || {},
            id: params.id
          });

          if (this.currentResponse) {
            this.currentResponse.toolCalls = this.currentResponse.toolCalls || [];
            this.currentResponse.toolCalls.push(toolCall);
          }
        }
        break;
      }
      case 'tool_result': {
        const params = notification.params as { tool?: string; result?: unknown; id?: string };
        if (params.tool && params.id) {
          const existingToolCall = this.activeToolCalls.get(params.id);
          if (existingToolCall) {
            existingToolCall.status = 'completed';
            existingToolCall.endTime = Date.now();
            existingToolCall.result = params.result;
            this.notifyToolCallListeners(existingToolCall);
          }

          this.notifyMessageListeners({
            type: 'tool_result',
            tool: params.tool,
            result: params.result,
            id: params.id
          });
        }
        break;
      }
      case 'status': {
        const params = notification.params as { status?: string };
        if (params.status) {
          this.notifyMessageListeners({ type: 'status', status: params.status });
        }
        break;
      }
      case 'question_tool': {
        const params = notification.params as { 
          id?: string; 
          question?: string; 
          options?: string[];
          allowMultiple?: boolean;
          allowCustom?: boolean;
        };
        if (params.id && params.question) {
          const questionRequest: QuestionToolRequest = {
            id: params.id,
            question: params.question,
            options: params.options,
            allowMultiple: params.allowMultiple,
            allowCustom: params.allowCustom
          };
          
          // Store in pending questions
          this.pendingQuestions.set(params.id, questionRequest);
          
          // Notify listeners
          this.notifyQuestionToolListeners(questionRequest);
          this.notifyMessageListeners({
            type: 'question_tool',
            question: questionRequest
          });
          
          ErrorHandler.debug(`Received question tool request: ${params.id}`);
        }
        break;
      }
      case 'session_created': {
        const params = notification.params as { sessionId?: string; changeId?: string };
        if (params.sessionId) {
          this.currentSessionId = params.sessionId;
          this.notifySessionCreatedListeners(params.sessionId, params.changeId);
          this.notifyMessageListeners({
            type: 'session_created',
            sessionId: params.sessionId,
            changeId: params.changeId
          });
          ErrorHandler.debug(`Session created: ${params.sessionId}${params.changeId ? ` (change: ${params.changeId})` : ''}`);
        }
        break;
      }
      default:
        ErrorHandler.debug(`Unknown notification method: ${notification.method}`);
    }
  }

  async sendMessage(content: string, abortSignal?: AbortSignal): Promise<ParsedResponse> {
    if (!this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Not connected to ACP server');
      }
    }

    const messageId = this.generateRequestId();
    this.currentResponse = {
      messageId,
      content: '',
      toolCalls: [],
      isComplete: false,
      timestamp: Date.now()
    };
    this.currentResponseBuffer = '';
    this.abortController = new AbortController();

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        this.cancelStreaming();
      });
    }

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: messageId,
      method: 'send_message',
      params: { content }
    };

    try {
      const response = await this.sendRequest(request);

      if (response.error) {
        throw new Error(response.error.message);
      }

      return await this.waitForResponseComplete(messageId);
    } catch (error) {
      if (error instanceof Error && error.message === 'Streaming cancelled') {
        return this.createCancelledResponse(messageId);
      }
      throw error;
    }
  }

  cancelStreaming(): ParsedResponse | undefined {
    let cancelledResponse: ParsedResponse | undefined;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }

    if (this.activeStreamMessageId) {
      cancelledResponse = this.createCancelledResponse(this.activeStreamMessageId);
      this.notifyMessageListeners({
        type: 'streaming_cancelled',
        messageId: this.activeStreamMessageId,
        partialContent: this.currentResponseBuffer,
        isPartial: true
      } as AcpMessage);
      this.notifyResponseListeners(cancelledResponse);
      this.activeStreamMessageId = undefined;
    }

    ErrorHandler.debug('Streaming cancelled by user');
    return cancelledResponse;
  }

  private createCancelledResponse(messageId: string): ParsedResponse {
    return {
      messageId,
      content: this.currentResponseBuffer,
      toolCalls: Array.from(this.activeToolCalls.values()),
      isComplete: true,
      timestamp: Date.now()
    };
  }

  private async waitForResponseComplete(messageId: string): Promise<ParsedResponse> {
    return new Promise((resolve, reject) => {
      const checkComplete = () => {
        if (this.abortController?.signal.aborted) {
          reject(new Error('Streaming cancelled'));
          return;
        }

        if (this.currentResponse?.messageId === messageId && this.currentResponse.isComplete) {
          const response = this.currentResponse as ParsedResponse;
          this.currentResponse = undefined;
          this.currentResponseBuffer = '';
          this.abortController = undefined;
          resolve(response);
          return;
        }

        setTimeout(checkComplete, 100);
      };

      const timeout = setTimeout(() => {
        reject(new Error('Response timeout'));
      }, this.config.timeoutMs);

      const disposable = this.onResponse((response) => {
        if (response.messageId === messageId && response.isComplete) {
          clearTimeout(timeout);
          disposable.dispose();
          resolve(response);
        }
      });

      checkComplete();
    });
  }

  parseResponse(data: unknown): ParsedResponse {
    const response: ParsedResponse = {
      messageId: this.generateRequestId(),
      content: '',
      toolCalls: [],
      isComplete: true,
      timestamp: Date.now()
    };

    if (typeof data === 'string') {
      response.content = data;
    } else if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;

      if (typeof obj.messageId === 'string') {
        response.messageId = obj.messageId;
      }

      if (typeof obj.content === 'string') {
        response.content = obj.content;
      } else if (typeof obj.message === 'string') {
        response.content = obj.message;
      } else if (typeof obj.text === 'string') {
        response.content = obj.text;
      }

      if (Array.isArray(obj.toolCalls)) {
        response.toolCalls = obj.toolCalls.map((tc: unknown) => this.parseToolCall(tc));
      } else if (Array.isArray(obj.tool_calls)) {
        response.toolCalls = obj.tool_calls.map((tc: unknown) => this.parseToolCall(tc));
      }

      if (typeof obj.isComplete === 'boolean') {
        response.isComplete = obj.isComplete;
      }

      if (typeof obj.timestamp === 'number') {
        response.timestamp = obj.timestamp;
      }
    }

    return response;
  }

  private parseToolCall(data: unknown): ToolCall {
    const toolCall: ToolCall = {
      id: this.generateRequestId(),
      tool: 'unknown',
      params: {},
      status: 'pending',
      startTime: Date.now()
    };

    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;

      if (typeof obj.id === 'string') {
        toolCall.id = obj.id;
      }

      if (typeof obj.tool === 'string') {
        toolCall.tool = obj.tool;
      } else if (typeof obj.name === 'string') {
        toolCall.tool = obj.name;
      } else if (typeof obj.function === 'string') {
        toolCall.tool = obj.function;
      }

      if (obj.params !== undefined) {
        toolCall.params = obj.params;
      } else if (obj.arguments !== undefined) {
        toolCall.params = obj.arguments;
      } else if (obj.parameters !== undefined) {
        toolCall.params = obj.parameters;
      }

      if (typeof obj.status === 'string' && ['pending', 'running', 'completed', 'error'].includes(obj.status)) {
        toolCall.status = obj.status as ToolCall['status'];
      }

      if (typeof obj.startTime === 'number') {
        toolCall.startTime = obj.startTime;
      }

      if (typeof obj.endTime === 'number') {
        toolCall.endTime = obj.endTime;
      }

      if (obj.result !== undefined) {
        toolCall.result = obj.result;
      }

      if (typeof obj.error === 'string') {
        toolCall.error = obj.error;
      }
    }

    return toolCall;
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      this.pendingRequests.set(request.id, { resolve, reject, timeout });

      const body = JSON.stringify(request);

      this.httpRequest('POST', '/', body, this.config.timeoutMs)
        .then((response) => {
          if (response.statusCode !== 200) {
            throw new Error(`HTTP error: ${response.statusCode}`);
          }
          return response.body;
        })
        .then((data) => {
          const parsed = JSON.parse(data) as JsonRpcResponse;
          const pending = this.pendingRequests.get(parsed.id);

          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(parsed.id);

            if (parsed.error) {
              pending.reject(new Error(parsed.error.message));
            } else {
              pending.resolve(parsed);
            }
          }
        })
        .catch((error: Error) => {
          const pending = this.pendingRequests.get(request.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(request.id);
            pending.reject(error);
          }
        });
    });
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    const body = JSON.stringify(notification);
    const response = await this.httpRequest('POST', '/', body, this.config.timeoutMs);

    if (response.statusCode !== 200) {
      throw new Error(`HTTP error: ${response.statusCode}`);
    }
  }

  private httpRequest(
    method: string,
    path: string,
    body: string | undefined,
    timeoutMs: number
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body ? Buffer.byteLength(body) : 0
        },
        timeout: timeoutMs
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: data
          });
        });
      });

      req.on('error', (error: Error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
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

  onResponse(listener: (response: ParsedResponse) => void): vscode.Disposable {
    this.responseListeners.push(listener);

    return new vscode.Disposable(() => {
      const index = this.responseListeners.indexOf(listener);
      if (index > -1) {
        this.responseListeners.splice(index, 1);
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

  getActiveToolCalls(): ToolCall[] {
    return Array.from(this.activeToolCalls.values());
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

  private notifyResponseListeners(response: ParsedResponse): void {
    this.responseListeners.forEach(listener => {
      try {
        listener(response);
      } catch (error) {
        ErrorHandler.debug(`Error in response listener: ${error}`);
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

  disconnect(): void {
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = undefined;
    }

    if (this.sseConnection) {
      this.sseConnection.destroy();
      this.sseConnection = undefined;
    }

    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
    });
    this.pendingRequests.clear();

    this.isConnected = false;
    this.activeStreamMessageId = undefined;
    this.updateOfflineState(true);
    this.notifyConnectionListeners(false);

    ErrorHandler.debug('AcpClient disconnected');
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  private generateRequestId(): string {
    return `req_${++this.requestId}_${Date.now()}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  dispose(): void {
    this.disconnect();
    this.stopOfflineRetry();
    this.messageListeners = [];
    this.connectionListeners = [];
    this.toolCallListeners = [];
    this.responseListeners = [];
    this.offlineListeners = [];
    this.questionToolListeners = [];
    this.sessionCreatedListeners = [];
    this.activeToolCalls.clear();
    this.currentResponse = undefined;
    this.currentResponseBuffer = '';
    this.messageQueue = [];
    this.pendingQuestions.clear();
  }

  // Plan Mode Methods

  configurePlanMode(config: Partial<PlanModeConfig>): void {
    this.planModeConfig = { ...this.planModeConfig, ...config };
    ErrorHandler.debug(`Plan mode configured: ${JSON.stringify(this.planModeConfig)}`);
  }

  getPlanModeConfig(): PlanModeConfig {
    return { ...this.planModeConfig };
  }

  async startPlanMode(): Promise<boolean> {
    if (this.planModeConfig.enabled) {
      ErrorHandler.debug('Plan mode already enabled');
      return true;
    }

    try {
      ErrorHandler.debug('Starting ACP plan mode...');
      
      // Connect to ACP server first
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Failed to connect to ACP server for plan mode');
      }

      // Enable plan mode
      this.planModeConfig.enabled = true;

      // Send initial prompt to load openspec skill
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'start_plan_mode',
        params: {
          skill: this.planModeConfig.skillName,
          initialPrompt: this.planModeConfig.initialPrompt
        }
      };

      const response = await this.sendRequest(request);
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      ErrorHandler.debug('Plan mode started successfully');
      
      // Send the initial prompt as the first message
      await this.sendMessage(this.planModeConfig.initialPrompt);
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ErrorHandler.debug(`Failed to start plan mode: ${errorMessage}`);
      this.planModeConfig.enabled = false;
      return false;
    }
  }

  async stopPlanMode(): Promise<void> {
    if (!this.planModeConfig.enabled) {
      return;
    }

    try {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'stop_plan_mode',
        params: {}
      };

      await this.sendRequest(request);
      ErrorHandler.debug('Plan mode stopped');
    } catch (error) {
      ErrorHandler.debug(`Error stopping plan mode: ${error}`);
    } finally {
      this.planModeConfig.enabled = false;
    }
  }

  isPlanModeEnabled(): boolean {
    return this.planModeConfig.enabled;
  }

  // Question Tool Methods

  async answerQuestion(questionId: string, answers: string[]): Promise<boolean> {
    const question = this.pendingQuestions.get(questionId);
    if (!question) {
      ErrorHandler.debug(`Question ${questionId} not found or already answered`);
      return false;
    }

    try {
      const response: QuestionToolResponse = {
        questionId,
        answers
      };

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'question_tool_response',
        params: response
      };

      const result = await this.sendRequest(request);
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Remove from pending questions
      this.pendingQuestions.delete(questionId);
      
      ErrorHandler.debug(`Question ${questionId} answered with ${answers.length} answer(s)`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ErrorHandler.debug(`Failed to answer question ${questionId}: ${errorMessage}`);
      return false;
    }
  }

  getPendingQuestions(): QuestionToolRequest[] {
    return Array.from(this.pendingQuestions.values());
  }

  hasPendingQuestions(): boolean {
    return this.pendingQuestions.size > 0;
  }

  // Session Management

  getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
    ErrorHandler.debug(`Session ID set: ${sessionId}`);
  }

  clearSession(): void {
    this.currentSessionId = undefined;
    this.pendingQuestions.clear();
    ErrorHandler.debug('Session cleared');
  }

  // Graceful degradation methods - Offline mode support
  
  private updateOfflineState(isOffline: boolean): void {
    if (this.offlineState.isOffline !== isOffline) {
      this.offlineState.isOffline = isOffline;
      
      if (isOffline) {
        this.offlineState.offlineSince = Date.now();
        this.startOfflineRetry();
        ErrorHandler.debug('ACP client entered offline mode', 'acpClient', {
          queuedMessages: this.messageQueue.length,
          offlineSince: this.offlineState.offlineSince
        });
      } else {
        this.offlineState.lastConnectedAt = Date.now();
        this.offlineState.offlineSince = undefined;
        this.stopOfflineRetry();
        ErrorHandler.debug('ACP client left offline mode', 'acpClient', {
          lastConnectedAt: this.offlineState.lastConnectedAt
        });
      }
      
      this.offlineState.pendingMessageCount = this.messageQueue.length;
      this.notifyOfflineListeners();
    }
  }

  private startOfflineRetry(): void {
    if (this.offlineRetryTimer) {
      return;
    }
    
    ErrorHandler.debug('Starting offline retry timer', 'acpClient');
    
    this.offlineRetryTimer = setInterval(async () => {
      if (!this.isConnected && this.messageQueue.length > 0) {
        ErrorHandler.debug(`Attempting to reconnect to send ${this.messageQueue.length} queued messages`, 'acpClient');
        
        try {
          const connected = await this.connect();
          if (connected) {
            await this.processMessageQueue();
          }
        } catch (error) {
          ErrorHandler.debug(`Offline retry failed: ${error}`, 'acpClient');
        }
      }
    }, AcpClient.OFFLINE_RETRY_INTERVAL);
  }

  private stopOfflineRetry(): void {
    if (this.offlineRetryTimer) {
      clearInterval(this.offlineRetryTimer);
      this.offlineRetryTimer = undefined;
      ErrorHandler.debug('Stopped offline retry timer', 'acpClient');
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) {
      return;
    }

    ErrorHandler.debug(`Processing ${this.messageQueue.length} queued messages`, 'acpClient');

    // Process messages in order
    while (this.messageQueue.length > 0) {
      const queuedMessage = this.messageQueue[0];
      
      try {
        // Update UI to show retrying state
        this.notifyMessageListeners({
          type: 'status',
          status: `Retrying message ${queuedMessage.id}...`
        });

        await this.sendMessage(queuedMessage.content, queuedMessage.abortSignal);
        
        // Remove successfully sent message
        this.messageQueue.shift();
        ErrorHandler.debug(`Successfully sent queued message: ${queuedMessage.id}`, 'acpClient');
      } catch (error) {
        queuedMessage.retryCount++;
        
        if (queuedMessage.retryCount >= 3) {
          // Give up on this message after 3 retries
          ErrorHandler.debug(`Giving up on queued message after 3 retries: ${queuedMessage.id}`, 'acpClient');
          this.notifyMessageListeners({
            type: 'error',
            message: `Failed to send message after multiple retries: ${queuedMessage.content.substring(0, 100)}...`
          });
          this.messageQueue.shift();
        } else {
          // Stop processing queue if a message fails - will retry on next interval
          ErrorHandler.debug(`Message ${queuedMessage.id} failed (retry ${queuedMessage.retryCount}), stopping queue processing`, 'acpClient');
          break;
        }
      }
    }

    this.offlineState.pendingMessageCount = this.messageQueue.length;
    this.notifyOfflineListeners();
  }

  queueMessage(content: string, abortSignal?: AbortSignal): QueuedMessage {
    // Check if queue is full
    if (this.messageQueue.length >= AcpClient.MAX_QUEUED_MESSAGES) {
      // Remove oldest message
      const removed = this.messageQueue.shift();
      ErrorHandler.debug(`Queue full, removed oldest message: ${removed?.id}`, 'acpClient');
      
      // Notify that message was dropped
      if (removed) {
        this.notifyMessageListeners({
          type: 'error',
          message: 'Message queue full. Oldest message was dropped.'
        });
      }
    }

    const queuedMessage: QueuedMessage = {
      id: this.generateRequestId(),
      content,
      timestamp: Date.now(),
      retryCount: 0,
      abortSignal
    };

    this.messageQueue.push(queuedMessage);
    this.offlineState.pendingMessageCount = this.messageQueue.length;
    this.notifyOfflineListeners();

    ErrorHandler.debug(`Message queued (queue size: ${this.messageQueue.length})`, 'acpClient', {
      messageId: queuedMessage.id,
      contentPreview: content.substring(0, 50)
    });

    return queuedMessage;
  }

  getOfflineState(): OfflineState {
    return { ...this.offlineState };
  }

  getQueuedMessages(): QueuedMessage[] {
    return [...this.messageQueue];
  }

  clearMessageQueue(): void {
    const count = this.messageQueue.length;
    this.messageQueue = [];
    this.offlineState.pendingMessageCount = 0;
    this.notifyOfflineListeners();
    ErrorHandler.debug(`Cleared message queue (${count} messages removed)`, 'acpClient');
  }

  onOfflineChange(listener: (state: OfflineState) => void): vscode.Disposable {
    this.offlineListeners.push(listener);
    
    // Immediately notify with current state
    listener({ ...this.offlineState });
    
    return new vscode.Disposable(() => {
      const index = this.offlineListeners.indexOf(listener);
      if (index > -1) {
        this.offlineListeners.splice(index, 1);
      }
    });
  }

  private notifyOfflineListeners(): void {
    this.offlineListeners.forEach(listener => {
      try {
        listener({ ...this.offlineState });
      } catch (error) {
        ErrorHandler.debug(`Error in offline listener: ${error}`, 'acpClient');
      }
    });
  }

  // Override sendMessage to support offline mode
  async sendMessageWithOfflineSupport(content: string, abortSignal?: AbortSignal): Promise<ParsedResponse | null> {
    // Try to send immediately if connected
    if (this.isConnected) {
      try {
        return await this.sendMessage(content, abortSignal);
      } catch (error) {
        // If send fails, enter offline mode and queue the message
        ErrorHandler.debug(`Send failed, entering offline mode: ${error}`, 'acpClient');
        this.updateOfflineState(true);
      }
    }

    // Not connected or send failed - queue for later
    if (!this.isConnected) {
      this.updateOfflineState(true);
      const queuedMessage = this.queueMessage(content, abortSignal);
      
      ErrorHandler.debug('Message queued for later delivery', 'acpClient', {
        messageId: queuedMessage.id,
        queueSize: this.messageQueue.length
      });
      
      // Notify UI that message is queued
      this.notifyMessageListeners({
        type: 'status',
        status: `Server unavailable. Message queued (#${this.messageQueue.length} pending)`
      });
      
      return null;
    }

    return null;
  }
}
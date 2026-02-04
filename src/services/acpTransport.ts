import { ChildProcess } from 'child_process';
import { ErrorHandler } from '../utils/errorHandler';

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

export type RequestHandler = (method: string, params: unknown) => Promise<unknown>;
export type NotificationHandler = (method: string, params: unknown) => Promise<void>;

export interface AcpTransportOptions {
  timeoutMs?: number;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class AcpTransport {
  private process: ChildProcess | undefined;
  private buffer = '';
  private pendingRequests = new Map<string | number, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (reason: Error) => void;
    timeout?: NodeJS.Timeout;
  }>();
  private requestId = 0;
  private requestHandler: RequestHandler;
  private notificationHandler: NotificationHandler;
  private options: AcpTransportOptions;
  private isConnected = false;
  private writeQueue: Promise<void> = Promise.resolve();

  private failAllPendingRequests(error: Error): void {
    this.pendingRequests.forEach((request) => {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(error);
    });
    this.pendingRequests.clear();
  }

  constructor(
    requestHandler: RequestHandler,
    notificationHandler: NotificationHandler,
    options: AcpTransportOptions = {}
  ) {
    this.requestHandler = requestHandler;
    this.notificationHandler = notificationHandler;
    this.options = {
      timeoutMs: 30000,
      ...options
    };
  }

  async connect(process: ChildProcess): Promise<void> {
    if (this.isConnected) {
      throw new Error('Transport already connected');
    }

    this.process = process;
    this.buffer = '';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Transport connection timeout'));
      }, 5000);

      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };

      const onExit = (code: number | null) => {
        clearTimeout(timeout);
        reject(new Error(`Process exited with code ${code}`));
      };

      process.once('error', onError);
      process.once('exit', onExit);

      process.stdout?.on('data', (data: Buffer) => {
        this.handleStdoutData(data.toString());
      });

      process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          ErrorHandler.debug(`[ACP stderr] ${message}`);
        }
      });

      process.on('exit', (code) => {
        ErrorHandler.debug(`ACP process exited with code ${code}`);
        this.isConnected = false;
        this.failAllPendingRequests(new Error(`ACP process exited with code ${code}`));
        this.options.onDisconnect?.();
      });

      process.on('error', (error) => {
        ErrorHandler.handle(error, 'ACP transport error', false);
        this.isConnected = false;
        this.failAllPendingRequests(error);
        this.options.onError?.(error);
      });

      process.stdin?.on('error', (error) => {
        ErrorHandler.handle(error, 'ACP stdin error', false);
      });

      // Give it a moment to settle
      setTimeout(() => {
        clearTimeout(timeout);
        process.off('error', onError);
        process.off('exit', onExit);
        
        if (process.killed) {
          reject(new Error('Process was killed before transport could connect'));
        } else {
          this.isConnected = true;
          ErrorHandler.debug('ACP transport connected');
          resolve();
        }
      }, 500);
    });
  }

  private handleStdoutData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        this.handleLine(line.trim());
      }
    }
  }

  private handleLine(line: string): void {
    const message = this.tryParseJson(line);
    if (!message || typeof message !== 'object') {
      // Not valid JSON, might be log output
      ErrorHandler.debug(`[ACP] Non-JSON output: ${line.substring(0, 200)}`);
      return;
    }

    const rpcMessage = message as Partial<JsonRpcRequest & JsonRpcResponse & JsonRpcNotification>;

    // Check if it's a response to a pending request
    if (rpcMessage.id !== undefined && this.pendingRequests.has(rpcMessage.id)) {
      const request = this.pendingRequests.get(rpcMessage.id);
      if (request) {
        if (request.timeout) {
          clearTimeout(request.timeout);
        }
        this.pendingRequests.delete(rpcMessage.id);
        
        if (rpcMessage.error) {
          request.reject(new Error(rpcMessage.error.message || 'Unknown error'));
        } else {
          request.resolve(rpcMessage as JsonRpcResponse);
        }
      }
      return;
    }

    // Check if it's a request from the agent
    if (rpcMessage.method && rpcMessage.id !== undefined) {
      this.handleAgentRequest(rpcMessage as JsonRpcRequest);
      return;
    }

    // Handle notifications from the agent
    if (rpcMessage.method && rpcMessage.id === undefined) {
      this.handleAgentNotification(rpcMessage as JsonRpcNotification);
      return;
    }

    // Unknown message type
    ErrorHandler.debug(`[ACP] Unknown message: ${line.substring(0, 200)}`);
  }

  private tryParseJson(line: string): unknown | undefined {
    const trimmed = line.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // continue
    }

    if (trimmed.startsWith('data:')) {
      const candidate = trimmed.slice(5).trim();
      try {
        return JSON.parse(candidate);
      } catch {
        // continue
      }
    }

    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const candidate = trimmed.slice(jsonStart, jsonEnd + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // ignore
      }
    }

    return undefined;
  }

  private async handleAgentRequest(request: JsonRpcRequest): Promise<void> {
    try {
      const result = await this.requestHandler(request.method, request.params);
      
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result: result ?? {}
      };
      
      await this.sendRaw(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: errorMessage
        }
      };
      
      await this.sendRaw(response);
    }
  }

  private async handleAgentNotification(notification: JsonRpcNotification): Promise<void> {
    try {
      await this.notificationHandler(notification.method, notification.params);
    } catch (error) {
      ErrorHandler.debug(`Error handling notification ${notification.method}: ${error}`);
    }
  }

  async sendRequest(method: string, params: unknown, timeoutMs?: number | null): Promise<JsonRpcResponse> {
    if (!this.isConnected || !this.process || this.process.killed) {
      throw new Error('Transport not connected');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const effectiveTimeoutMs = timeoutMs === undefined ? this.options.timeoutMs : timeoutMs;

    return new Promise((resolve, reject) => {
      const pending: { resolve: (value: JsonRpcResponse) => void; reject: (reason: Error) => void; timeout?: NodeJS.Timeout } = {
        resolve,
        reject
      };

      if (effectiveTimeoutMs !== null) {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out after ${effectiveTimeoutMs}ms`));
        }, effectiveTimeoutMs);
        pending.timeout = timeout;
      }

      this.pendingRequests.set(id, pending);

      this.sendRaw(request).catch((error) => {
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  async sendNotification(method: string, params: unknown): Promise<void> {
    if (!this.isConnected || !this.process || this.process.killed) {
      throw new Error('Transport not connected');
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    };

    await this.sendRaw(notification);
  }

  private async sendRaw(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): Promise<void> {
    const line = JSON.stringify(message) + '\n';
    
    // Queue writes to ensure order
    this.writeQueue = this.writeQueue.then(() => {
      return new Promise<void>((resolve, reject) => {
        if (!this.process || this.process.killed) {
          reject(new Error('Process not available'));
          return;
        }

        this.process.stdin?.write(line, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    });

    await this.writeQueue;
  }

  isTransportConnected(): boolean {
    return this.isConnected && !!this.process && !this.process.killed;
  }

  dispose(): void {
    this.isConnected = false;
    
    // Reject all pending requests
    this.pendingRequests.forEach(request => {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(new Error('Transport disposed'));
    });
    this.pendingRequests.clear();

    // Note: We don't kill the process here - that's the caller's responsibility
    this.process = undefined;
  }
}

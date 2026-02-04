import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ErrorHandler } from '../utils/errorHandler';
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
  AcpConnectionConfig, OfflineState, ACP_METHODS,
  AgentMessageChunkUpdate, ToolCallUpdate, ToolCallUpdateUpdate, PlanUpdate,
  AvailableCommandsUpdate, CurrentModeUpdate, AgentThoughtChunkUpdate,
  SessionModeState, SessionModelState, AvailableCommand
} from './acpTypes';

export class AcpClient {
  private static readonly DEFAULT_TIMEOUT = 30000;
  // session/prompt is a long-running request that only resolves when the turn completes.
  // OpenCode tool runs can exceed 30s, so disable per-request timeout for prompts.
  private static readonly PROMPT_TIMEOUT_MS: number | null = null;
  private static readonly DEFAULT_RETRY_ATTEMPTS = 5;
  private static readonly DEFAULT_RETRY_DELAY = 1000;
  private static readonly DEFAULT_HOST = '127.0.0.1';
  private static readonly MAX_QUEUED_MESSAGES = 50;
  private static readonly OFFLINE_RETRY_INTERVAL = 30000;
  private static instance: AcpClient;
  
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
  private sessionCreatedListeners: Array<(sessionId: string, changeId?: string) => void> = [];
  private offlineListeners: Array<(state: OfflineState) => void> = [];
  private offlineState: OfflineState = { isOffline: false, pendingMessageCount: 0 };
  private messageQueue: string[] = [];
  private lastSuccessfulConnection: number | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private activeToolCalls = new Map<string, ToolCall>();
  private activeStreamMessageId: string | undefined;
  private currentResponseBuffer = '';
  private lastConnectionError: string | undefined;
  
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
    this.config = {
      host: AcpClient.DEFAULT_HOST,
      // ACP uses stdio; the HTTP port is not required for the extension.
      // Default to 0 to avoid collisions if something is already bound.
      port: 0,
      timeoutMs: AcpClient.DEFAULT_TIMEOUT,
      retryAttempts: AcpClient.DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs: AcpClient.DEFAULT_RETRY_DELAY,
      opencodePath: 'opencode'
    };
  }

  getLastConnectionError(): string | undefined {
    return this.lastConnectionError;
  }

  private resolveOpencodePathFromSettings(): void {
    const extConfig = vscode.workspace.getConfiguration('openspec');
    const configuredPath = extConfig.get<string>('chat.opencodePath');
    if (configuredPath && configuredPath.trim().length > 0) {
      this.config.opencodePath = configuredPath.trim();
    }
  }

  private detectOpencodePath(): string | undefined {
    const candidates: string[] = [];

    const envPath = process.env.OPENCODE_PATH || process.env.OPENCODE_BIN;
    if (envPath) {
      candidates.push(envPath);
    }

    const configured = this.config.opencodePath;
    if (configured && configured.trim().length > 0) {
      candidates.push(configured.trim());
    }

    // Search PATH for a concrete executable path
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);
    const names = process.platform === 'win32'
      ? ['opencode.exe', 'opencode.cmd', 'opencode.bat', 'opencode']
      : ['opencode'];
    for (const dir of pathDirs) {
      for (const name of names) {
        const full = path.join(dir, name);
        try {
          if (fs.existsSync(full)) {
            candidates.push(full);
          }
        } catch {
          // ignore
        }
      }
    }

    // Common install locations when PATH isn't propagated into VS Code.
    const home = os.homedir();
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      candidates.push(path.join(appData, 'npm', 'opencode.cmd'));
      candidates.push(path.join(home, '.cargo', 'bin', 'opencode.exe'));
      candidates.push(path.join(home, '.cargo', 'bin', 'opencode'));
      candidates.push(path.join(home, 'scoop', 'shims', 'opencode.exe'));
      candidates.push(path.join(home, 'scoop', 'shims', 'opencode.cmd'));
    } else {
      candidates.push(path.join(home, '.local', 'bin', 'opencode'));
      candidates.push(path.join(home, '.cargo', 'bin', 'opencode'));
      candidates.push('/usr/local/bin/opencode');
      candidates.push('/opt/homebrew/bin/opencode');
      candidates.push('/usr/bin/opencode');
    }

    // Prefer the first candidate that exists as a file.
    for (const c of candidates) {
      // If the user provided a bare command like "opencode", keep it (spawn will resolve it).
      if (c === 'opencode') {
        continue;
      }

      // On Windows, npm often creates both "opencode" (bash shim) and "opencode.cmd".
      // Prefer the .cmd so it works reliably for the extension host.
      if (process.platform === 'win32') {
        const parsed = path.parse(c);
        if (!parsed.ext && parsed.name.toLowerCase() === 'opencode') {
          const cmdSibling = path.join(parsed.dir, 'opencode.cmd');
          try {
            if (fs.existsSync(cmdSibling)) {
              return cmdSibling;
            }
          } catch {
            // ignore
          }
        }
      }
      try {
        if (fs.existsSync(c)) {
          return c;
        }
      } catch {
        // ignore
      }
    }

    // Fall back to the configured command (usually "opencode")
    return this.config.opencodePath;
  }

  private resolveDefaultOpencodeConfigPath(): string | undefined {
    const home = os.homedir();
    const roots: Array<string | undefined> = process.platform === 'win32'
      ? [
        process.env.XDG_CONFIG_HOME,
        process.env.APPDATA,
        process.env.LOCALAPPDATA,
        process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.config') : undefined,
        path.join(home, 'AppData', 'Roaming'),
        path.join(home, 'AppData', 'Local'),
        path.join(home, '.config')
      ]
      : [
        process.env.XDG_CONFIG_HOME,
        path.join(home, '.config')
      ];
    const seen = new Set<string>();
    const candidates: string[] = [];

    for (const root of roots) {
      if (!root || seen.has(root)) {
        continue;
      }
      seen.add(root);
      const configDir = path.join(root, 'opencode');
      candidates.push(
        path.join(configDir, 'opencode.jsonc'),
        path.join(configDir, 'opencode.json')
      );
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }

    return undefined;
  }

  private buildOpencodeEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    if (env.OPENCODE_CONFIG_CONTENT) {
      return env;
    }

    if (env.OPENCODE_CONFIG || env.OPENCODE_CONFIG_DIR) {
      return env;
    }

    const defaultConfigPath = this.resolveDefaultOpencodeConfigPath();
    if (defaultConfigPath) {
      const raw = this.tryReadConfigFile(defaultConfigPath);
      if (raw && this.isInlineConfigSafe(raw)) {
        const content = this.tryBuildConfigContent(raw);
        if (content) {
          env.OPENCODE_CONFIG_CONTENT = content;
          ErrorHandler.debug(`Using OPENCODE_CONFIG_CONTENT from ${defaultConfigPath}`);
          return env;
        }
      }

      env.OPENCODE_CONFIG = defaultConfigPath;
      ErrorHandler.debug(`Using OPENCODE_CONFIG at ${defaultConfigPath}`);
    }

    return env;
  }

  private tryReadConfigFile(filePath: string): string | undefined {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return raw.trim().length ? raw : undefined;
    } catch {
      return undefined;
    }
  }

  private isInlineConfigSafe(raw: string): boolean {
    return !/\{(env|file):/i.test(raw);
  }

  private tryBuildConfigContent(raw: string): string | undefined {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed);
    } catch {
      try {
        const stripped = this.stripJsonComments(raw);
        const parsed = JSON.parse(stripped);
        return JSON.stringify(parsed);
      } catch {
        return undefined;
      }
    }
  }

  private stripJsonComments(input: string): string {
    let output = '';
    let inString = false;
    let stringChar = '';
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const next = i + 1 < input.length ? input[i + 1] : '';

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
          output += char;
        }
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (inString) {
        output += char;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      if ((char === '"' || char === '\'') && !inString) {
        inString = true;
        stringChar = char;
        output += char;
        continue;
      }

      if (char === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      output += char;
    }

    return output;
  }

  private resolveNodeEntrypoint(opencodePath: string): string | undefined {
    if (process.platform !== 'win32') {
      return undefined;
    }

    const ext = path.extname(opencodePath).toLowerCase();
    if (ext !== '.cmd' && ext !== '.bat') {
      return undefined;
    }

    const fromShim = this.resolveNodeEntrypointFromShim(opencodePath);
    if (fromShim && fs.existsSync(fromShim)) {
      return fromShim;
    }

    const npmDir = path.dirname(opencodePath);
    const fallback = path.resolve(npmDir, '..', 'node_modules', 'opencode-ai', 'bin', 'opencode');
    if (fs.existsSync(fallback)) {
      return fallback;
    }

    return undefined;
  }

  private resolveNodeEntrypointFromShim(shimPath: string): string | undefined {
    try {
      const raw = fs.readFileSync(shimPath, 'utf8');
      const matches = Array.from(
        raw.matchAll(/"([^"]*opencode-ai[\\/]+bin[\\/]opencode(?:\.[a-z]+)?)"/gi)
      );
      if (!matches.length) {
        return undefined;
      }

      const baseDir = path.dirname(shimPath) + path.sep;
      const candidate = matches
        .map((match) => match[1])
        .sort((a, b) => b.length - a.length)[0];

      const resolved = candidate
        .replace(/%~dp0/gi, baseDir)
        .replace(/%dp0/gi, baseDir);

      return path.resolve(resolved);
    } catch {
      return undefined;
    }
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
    this.lastConnectionError = undefined;

    try {
      // Refresh launch config from VS Code settings.
      this.resolveOpencodePathFromSettings();
      this.config.opencodePath = this.detectOpencodePath() || this.config.opencodePath;

      const port = this.config.port;
      
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
          const err = error instanceof Error ? error : new Error(String(error));
          this.lastConnectionError = err.message;
          const errorMessage = error instanceof Error ? error.message : String(error);
          ErrorHandler.debug(`Connection attempt ${attempt} failed: ${errorMessage}`);

          // If the CLI is missing, retries won't help.
          const anyErr = error as unknown as { code?: unknown };
          if (anyErr && (anyErr.code === 'ENOENT' || /\bENOENT\b/.test(errorMessage))) {
            break;
          }

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

    // ACP uses JSON-RPC over stdio. Start the subprocess and wait for initialize() to succeed.
    await this.startAcpProcess(port, workspaceFolder.uri.fsPath);
    await this.waitForAcpStdioReady(120000);
    return true;
  }

  private async checkHttpServer(_port: number): Promise<boolean> {
    // ACP uses stdio transport; kept for backward compatibility.
    return false;
  }

  private async startAcpProcess(port: number, cwd: string): Promise<void> {
    // Kill existing process if any
    if (this.acpProcess && !this.acpProcess.killed) {
      ErrorHandler.debug('Killing existing ACP process');
      this.acpProcess.kill('SIGTERM');
      await this.delay(500);
    }

    ErrorHandler.debug(`Starting ACP process on port ${port}...`);

    const opencodePath = this.config.opencodePath || 'opencode';
    const baseArgs = ['acp', '--port', String(port), '--hostname', '127.0.0.1'];

    // On Windows, global npm installs expose a .cmd shim.
    // Avoid spawning cmd.exe with fragile quoting; instead execute the Node entrypoint directly.
    let command = opencodePath;
    let args = baseArgs;
    let shell = false;
    if (process.platform === 'win32') {
      const nodeEntrypoint = this.resolveNodeEntrypoint(opencodePath);
      if (nodeEntrypoint) {
        command = process.execPath;
        args = [nodeEntrypoint, ...baseArgs];
      } else if (['.cmd', '.bat'].includes(path.extname(opencodePath).toLowerCase())) {
        // Fallback: let the OS shell resolve/execute the shim.
        shell = true;
      }
    }

    // Start opencode acp without --print-logs to avoid stdout pollution
    // On Windows, PATH resolution differs between shells and VS Code.
    // If this fails with ENOENT, the OpenCode CLI is not available to the extension host.
    const env = this.buildOpencodeEnv();
    this.acpProcess = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell,
      env,
      windowsHide: process.platform === 'win32'
    });

    // Wait until the process is actually spawned, otherwise we'll race with setup.
    await new Promise<void>((resolve, reject) => {
      if (!this.acpProcess) {
        reject(new Error('Failed to start ACP process'));
        return;
      }
      const onError = (err: unknown) => reject(err instanceof Error ? err : new Error(String(err)));
      this.acpProcess.once('spawn', () => resolve());
      this.acpProcess.once('error', onError);
    }).catch((err) => {
      const anyErr = err as unknown as { code?: unknown };
      if (anyErr && anyErr.code === 'ENOENT') {
        throw new Error(
          `OpenCode CLI not found: '${opencodePath}'. Install OpenCode (opencode) and restart VS Code, or set openspec.chat.opencodePath to the full path of the executable.`
        );
      }
      throw err;
    });

    // Capture stderr to help troubleshoot startup failures.
    this.acpProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        ErrorHandler.debug(`[OpenCode stderr] ${msg}`);
      }
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
    try {
      await this.transport.connect(this.acpProcess);
    } catch (error) {
      // Clean up on failed connect to prevent "write after stream destroyed" later.
      this.transport.dispose();
      this.transport = undefined;
      if (this.acpProcess && !this.acpProcess.killed) {
        this.acpProcess.kill('SIGTERM');
      }
      this.acpProcess = undefined;
      throw error;
    }

    // Connection is initialized in waitForAcpStdioReady().
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
      return;
    }

    const handled = this.handleNotification({ jsonrpc: '2.0', method, params });
    if (!handled) {
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
        this.activeToolCalls.set(toolCall.id, toolCall);
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
        if (toolCall.status === 'completed' || toolCall.status === 'error') {
          toolCall.endTime = Date.now();
        }
        this.activeToolCalls.set(toolCall.id, toolCall);
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
          this.notifyMessageListeners({
            type: 'agent_thought_chunk',
            content: thought.content.text,
            messageId: this.currentSessionId
          });
        }
        break;
      }
    }
  }

  private async sendRequest<T>(method: string, params: unknown, timeoutMs?: number | null): Promise<T> {
    if (!this.transport) {
      throw new Error('Transport not initialized');
    }
    const response = await this.transport.sendRequest(method, params, timeoutMs);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result as T;
  }

  private async waitForAcpStdioReady(timeoutMs: number): Promise<void> {
    const startedAt = Date.now();

    const initRequest: InitializeRequest = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true
      },
      clientInfo: { name: 'openspec-vscode', version: '2.0.0' }
    };

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const init = await this.sendRequest<InitializeResponse>(ACP_METHODS.initialize, initRequest, 5000);
        ErrorHandler.debug(`ACP initialized: protocol v${init.protocolVersion}`);
        return;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!this.acpProcess || this.acpProcess.killed) {
          throw new Error(`ACP process terminated before initialization: ${msg}`);
        }
        await this.delay(250);
      }
    }

    throw new Error('ACP did not become ready within timeout');
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
      // Ensure we have auth/model config; otherwise session/new will fail.
      // This keeps the client "connected" but surfaces a clear error.
      await this.ensureAuthorized();

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder');
      }

      const request: NewSessionRequest = {
        cwd: workspaceFolder.uri.fsPath,
        mcpServers: []
      };

      const response = await this.sendRequest<NewSessionResponse>(ACP_METHODS.sessionNew, request, 120000);

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

  private async ensureAuthorized(): Promise<void> {
    try {
      const { execFile } = await import('child_process');
      const opencodePath = this.config.opencodePath || 'opencode';
      const env = this.buildOpencodeEnv();

      const run = (args: string[]) => new Promise<void>((resolve, reject) => {
        // Try to run via node entrypoint on Windows if configured path is a .cmd shim.
        const ext = process.platform === 'win32' ? path.extname(opencodePath).toLowerCase() : '';
        if (process.platform === 'win32' && (ext === '.cmd' || ext === '.bat')) {
          const npmDir = path.dirname(opencodePath);
          const nodeEntrypoint = path.join(npmDir, 'node_modules', 'opencode-ai', 'bin', 'opencode');
          if (fs.existsSync(nodeEntrypoint)) {
            execFile(process.execPath, [nodeEntrypoint, ...args], { windowsHide: true, env }, (err) => {
              if (err) reject(err);
              else resolve();
            });
            return;
          }
        }

        execFile(opencodePath, args, { windowsHide: true, env }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // If this succeeds, user is logged in (or no auth needed).
      await run(['models']);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // If OpenCode requires auth, explain how to fix.
      if (/unauthorized/i.test(msg)) {
        throw new Error(
          'OpenCode is not authenticated (Unauthorized). Run `opencode auth` in a terminal to sign in, then try again.'
        );
      }
      // Otherwise, don't block connection — session/new may still fail for other reasons.
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

      const response = await this.sendRequest<LoadSessionResponse>(ACP_METHODS.sessionLoad, request, 120000);

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

    const response = await this.sendRequest<PromptResponse>(
      ACP_METHODS.sessionPrompt,
      request,
      AcpClient.PROMPT_TIMEOUT_MS
    );

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

    const response = this.createCancelledResponse(this.currentSessionId);
    this.notifyMessageListeners({
      type: 'streaming_cancelled',
      messageId: response.messageId,
      partialContent: response.content,
      response
    });
    return {
      messageId: response.messageId,
      content: response.content
    };
  }

  parseResponse(data: unknown): { messageId: string; content: string; toolCalls: ToolCall[]; isComplete: boolean; timestamp: number } {
    const now = Date.now();
    const toolCalls: ToolCall[] = [];

    if (typeof data === 'string') {
      return {
        messageId: `msg_${now}`,
        content: data,
        toolCalls,
        isComplete: true,
        timestamp: now
      };
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    const messageId = typeof payload.messageId === 'string' ? payload.messageId : `msg_${now}`;
    const content = typeof payload.content === 'string'
      ? payload.content
      : typeof payload.message === 'string'
        ? payload.message
        : typeof payload.text === 'string'
          ? payload.text
          : '';
    const isComplete = typeof payload.isComplete === 'boolean' ? payload.isComplete : true;
    const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : now;

    const rawToolCalls = payload.toolCalls;
    if (Array.isArray(rawToolCalls)) {
      for (const raw of rawToolCalls) {
        if (raw && typeof raw === 'object') {
          const toolCall = raw as Record<string, unknown>;
          toolCalls.push({
            id: typeof toolCall.id === 'string' ? toolCall.id : `tc_${Date.now()}`,
            tool: typeof toolCall.tool === 'string' ? toolCall.tool : 'unknown',
            params: toolCall.params ?? {},
            status: toolCall.status === 'completed' || toolCall.status === 'error' || toolCall.status === 'running' || toolCall.status === 'pending'
              ? toolCall.status
              : 'running',
            startTime: typeof toolCall.startTime === 'number' ? toolCall.startTime : Date.now(),
            endTime: typeof toolCall.endTime === 'number' ? toolCall.endTime : undefined,
            result: toolCall.result,
            error: typeof toolCall.error === 'string' ? toolCall.error : undefined
          });
        }
      }
    }

    const rawToolCallsAlt = payload.tool_calls;
    if (Array.isArray(rawToolCallsAlt)) {
      for (const raw of rawToolCallsAlt) {
        if (raw && typeof raw === 'object') {
          const toolCall = raw as Record<string, unknown>;
          toolCalls.push({
            id: typeof toolCall.id === 'string' ? toolCall.id : `tc_${Date.now()}`,
            tool: typeof toolCall.name === 'string' ? toolCall.name : 'unknown',
            params: toolCall.arguments ?? {},
            status: 'running',
            startTime: Date.now()
          });
        }
      }
    }

    return {
      messageId,
      content,
      toolCalls,
      isComplete,
      timestamp
    };
  }

  onResponse(listener: (response: { messageId: string; content: string; toolCalls: ToolCall[]; isComplete: boolean; timestamp: number }) => void): vscode.Disposable {
    const responseListeners = this.messageListeners;
    const handler = (message: AcpMessage) => {
      if (message.type === 'streaming_end') {
        listener(this.createCancelledResponse(message.messageId || `msg_${Date.now()}`));
      }
    };
    responseListeners.push(handler);
    return new vscode.Disposable(() => {
      const index = responseListeners.indexOf(handler);
      if (index > -1) {
        responseListeners.splice(index, 1);
      }
    });
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

  private handleNotification(notification: { jsonrpc: '2.0'; method: string; params?: unknown }): boolean {
    const { method, params } = notification;

    switch (method) {
      case 'message': {
        const message = params as { content?: string; messageId?: string } | undefined;
        if (message?.content) {
          this.currentResponseBuffer += message.content;
          this.notifyMessageListeners({
            type: 'text',
            content: message.content,
            messageId: message.messageId
          });
        }
        return true;
      }
      case 'message_delta': {
        const message = params as { delta?: string; messageId?: string } | undefined;
        if (typeof message?.delta === 'string' && message.delta.length > 0) {
          this.currentResponseBuffer += message.delta;
          this.notifyMessageListeners({
            type: 'text_delta',
            delta: message.delta,
            messageId: message.messageId
          });
        }
        return true;
      }
      case 'streaming_start': {
        const message = params as { messageId?: string } | undefined;
        if (message?.messageId) {
          this.activeStreamMessageId = message.messageId;
        }
        this.currentResponseBuffer = '';
        this.notifyMessageListeners({ type: 'streaming_start', messageId: message?.messageId });
        return true;
      }
      case 'streaming_end': {
        const message = params as { messageId?: string } | undefined;
        this.activeStreamMessageId = undefined;
        this.notifyMessageListeners({ type: 'streaming_end', messageId: message?.messageId });
        return true;
      }
      case 'tool_call': {
        const tool = params as { tool?: string; id?: string; params?: unknown } | undefined;
        const toolCall: ToolCall = {
          id: tool?.id || `tc_${Date.now()}`,
          tool: tool?.tool || 'unknown',
          params: tool?.params ?? {},
          status: 'running',
          startTime: Date.now()
        };
        this.activeToolCalls.set(toolCall.id, toolCall);
        this.notifyToolCallListeners(toolCall);
        return true;
      }
      case 'tool_result': {
        const tool = params as { id?: string; result?: unknown; error?: string; tool?: string } | undefined;
        if (!tool?.id) {
          return true;
        }
        const existing = this.activeToolCalls.get(tool.id);
        const updated: ToolCall = {
          id: tool.id,
          tool: tool.tool || existing?.tool || 'unknown',
          params: existing?.params ?? {},
          status: tool.error ? 'error' : 'completed',
          startTime: existing?.startTime ?? Date.now(),
          endTime: Date.now(),
          result: tool.result,
          error: tool.error
        };
        this.activeToolCalls.set(updated.id, updated);
        this.notifyToolCallListeners(updated);
        return true;
      }
      case 'status': {
        const status = params as { status?: string } | undefined;
        this.notifyMessageListeners({ type: 'status', status: status?.status });
        return true;
      }
      default:
        return false;
    }
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

  queueMessage(content: string): { id: string; content: string; timestamp: number; retryCount: number } {
    if (this.messageQueue.length >= AcpClient.MAX_QUEUED_MESSAGES) {
      this.messageQueue.shift();
    }

    this.messageQueue.push(content);
    this.updateOfflineState(this.offlineState.isOffline);

    return {
      id: `queued_${this.messageQueue.length - 1}`,
      content,
      timestamp: Date.now(),
      retryCount: 0
    };
  }

  getActiveToolCalls(): ToolCall[] {
    return Array.from(this.activeToolCalls.values());
  }

  private createCancelledResponse(messageId: string): { messageId: string; content: string; toolCalls: ToolCall[]; isComplete: boolean; timestamp: number } {
    return {
      messageId,
      content: this.currentResponseBuffer,
      toolCalls: this.getActiveToolCalls(),
      isComplete: true,
      timestamp: Date.now()
    };
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
    this.activeToolCalls.clear();
    this.activeStreamMessageId = undefined;
  }
}

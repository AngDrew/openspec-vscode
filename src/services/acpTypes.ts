// ACP Protocol Types - Aligned with Agent Client Protocol v1
// See: https://agentclientprotocol.com/

export type AcpConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface InitializeRequest {
  protocolVersion: number;
  clientCapabilities: ClientCapabilities;
  clientInfo: Implementation;
}

export interface InitializeResponse {
  protocolVersion: number;
  agentCapabilities: AgentCapabilities;
  agentInfo: Implementation;
  authMethods?: AuthMethod[];
}

export interface ClientCapabilities {
  fs?: FileSystemCapability;
  terminal?: boolean;
  _meta?: Record<string, unknown>;
}

export interface FileSystemCapability {
  readTextFile: boolean;
  writeTextFile: boolean;
}

export interface AgentCapabilities {
  loadSession: boolean;
  mcpCapabilities?: McpCapabilities;
  promptCapabilities?: PromptCapabilities;
  sessionCapabilities?: SessionCapabilities;
}

export interface McpCapabilities {
  http: boolean;
  sse: boolean;
}

export interface PromptCapabilities {
  embeddedContext: boolean;
  image: boolean;
}

export interface SessionCapabilities {
  fork?: Record<string, unknown>;
  list?: Record<string, unknown>;
  resume?: Record<string, unknown>;
}

export interface Implementation {
  name: string;
  version: string;
}

export interface AuthMethod {
  id: string;
  name: string;
  description: string;
  _meta?: Record<string, unknown>;
}

export interface NewSessionRequest {
  cwd: string;
  mcpServers: McpServer[];
}

export interface NewSessionResponse {
  sessionId: string;
  modes?: SessionModeState;
  models?: SessionModelState;
  _meta?: Record<string, unknown>;
}

export interface LoadSessionRequest {
  sessionId: string;
  cwd: string;
  mcpServers: McpServer[];
}

export interface LoadSessionResponse {
  sessionId: string;
  modes?: SessionModeState;
  models?: SessionModelState;
}

export interface McpServer {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface SessionModeState {
  availableModes: SessionMode[];
  currentModeId: string;
}

export interface SessionMode {
  id: string;
  name: string;
  description?: string;
}

export interface SessionModelState {
  availableModels: ModelInfo[];
  currentModelId: string;
}

export interface ModelInfo {
  modelId: string;
  name: string;
}

export interface PromptRequest {
  sessionId: string;
  prompt: ContentBlock[];
}

export interface PromptResponse {
  stopReason: StopReason;
}

export type StopReason = 'end_turn' | 'cancelled' | 'auth_required' | 'tool_max' | 'rate_limit' | 'error';

export interface ContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: EmbeddedResource;
}

export interface EmbeddedResource {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface CancelNotification {
  sessionId: string;
}

export interface SetSessionModeRequest {
  sessionId: string;
  modeId: string;
}

export interface SetSessionModeResponse {
  // Empty response
}

export interface SetSessionModelRequest {
  sessionId: string;
  modelId: string;
}

export interface SetSessionModelResponse {
  // Empty response
}

// Session update notifications (agent -> client)
export interface SessionNotification {
  sessionId: string;
  update: SessionUpdate;
}

export type SessionUpdate =
  | AgentMessageChunkUpdate
  | UserMessageChunkUpdate
  | ToolCallUpdate
  | ToolCallUpdateUpdate
  | AvailableCommandsUpdate
  | CurrentModeUpdate
  | PlanUpdate
  | AgentThoughtChunkUpdate;

export interface AgentMessageChunkUpdate {
  sessionUpdate: 'agent_message_chunk';
  content: ContentChunk;
}

export interface UserMessageChunkUpdate {
  sessionUpdate: 'user_message_chunk';
  content: ContentChunk;
}

export interface ToolCallUpdate {
  sessionUpdate: 'tool_call';
  toolCallId: string;
  title: string;
  kind: ToolKind;
  status: ToolCallStatus;
  locations: ToolCallLocation[];
  rawInput: unknown;
}

export interface ToolCallUpdateUpdate {
  sessionUpdate: 'tool_call_update';
  toolCallId: string;
  status: ToolCallStatus;
  kind: ToolKind;
  title?: string;
  locations?: ToolCallLocation[];
  content?: ToolCallContent[];
  rawInput?: unknown;
  rawOutput?: {
    output?: string;
    error?: string;
    metadata?: unknown;
  };
}

export interface AvailableCommandsUpdate {
  sessionUpdate: 'available_commands_update';
  availableCommands: AvailableCommand[];
}

export interface CurrentModeUpdate {
  sessionUpdate: 'current_mode_update';
  currentModeId: string;
}

export interface PlanUpdate {
  sessionUpdate: 'plan';
  entries: PlanEntry[];
}

export interface AgentThoughtChunkUpdate {
  sessionUpdate: 'agent_thought_chunk';
  content: ContentChunk;
}

export interface ContentChunk {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  annotations?: Annotations;
}

export interface Annotations {
  audience?: Role[];
  priority?: number;
}

export type Role = 'user' | 'assistant';

export type ToolKind = 'read' | 'write' | 'execute' | 'edit' | 'search' | 'other';

export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ToolCallLocation {
  uri?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface ToolCallContent {
  type: 'content' | 'diff' | 'terminal';
  content?: ContentChunk;
  path?: string;
  oldText?: string;
  newText?: string;
  terminalId?: string;
}

export interface AvailableCommand {
  name: string;
  description: string;
  input?: AvailableCommandInput;
}

export interface AvailableCommandInput {
  hint: string;
  required?: boolean;
}

export interface PlanEntry {
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  content: string;
}

// Client-side request/response types

export interface ReadTextFileRequest {
  sessionId: string;
  path: string;
  line?: number;
  limit?: number;
}

export interface ReadTextFileResponse {
  content: string;
}

export interface WriteTextFileRequest {
  sessionId: string;
  path: string;
  content: string;
}

export interface WriteTextFileResponse {
  // Empty response
}

export interface RequestPermissionRequest {
  sessionId: string;
  toolCall: ToolCallInfo;
  options: PermissionOption[];
}

export interface RequestPermissionResponse {
  outcome: SelectedPermissionOutcome | CancelledPermissionOutcome;
}

export interface ToolCallInfo {
  toolCallId: string;
  title: string;
  kind: ToolKind;
  status: ToolCallStatus;
  locations: ToolCallLocation[];
  rawInput: unknown;
}

export interface PermissionOption {
  optionId: string;
  kind: PermissionOptionKind;
  name: string;
}

export type PermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

export interface SelectedPermissionOutcome {
  outcome: 'selected';
  optionId: string;
}

export interface CancelledPermissionOutcome {
  outcome: 'cancelled';
}

export interface CreateTerminalRequest {
  sessionId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: EnvVariable[];
  outputByteLimit?: number | null;
}

export interface CreateTerminalResponse {
  terminalId: string;
}

export interface TerminalOutputRequest {
  sessionId: string;
  terminalId: string;
}

export interface TerminalOutputResponse {
  output: string;
  truncated: boolean;
}

export interface WaitForTerminalExitRequest {
  sessionId: string;
  terminalId: string;
}

export interface WaitForTerminalExitResponse {
  exitCode: number | null;
  signal: string | null;
}

export interface KillTerminalCommandRequest {
  sessionId: string;
  terminalId: string;
}

export interface KillTerminalCommandResponse {
  // Empty response
}

export interface ReleaseTerminalRequest {
  sessionId: string;
  terminalId: string;
}

export interface ReleaseTerminalResponse {
  // Empty response
}

export interface EnvVariable {
  name: string;
  value: string;
}

// ACP Method constants
export const ACP_METHODS = {
  // Agent methods (client -> agent)
  initialize: 'initialize',
  authenticate: 'authenticate',
  sessionNew: 'session/new',
  sessionLoad: 'session/load',
  sessionPrompt: 'session/prompt',
  sessionCancel: 'session/cancel',
  sessionSetMode: 'session/set_mode',
  sessionSetModel: 'session/set_model',
  
  // Client methods (agent -> client)
  fsReadTextFile: 'fs/read_text_file',
  fsWriteTextFile: 'fs/write_text_file',
  sessionRequestPermission: 'session/request_permission',
  sessionUpdate: 'session/update',
  terminalCreate: 'terminal/create',
  terminalOutput: 'terminal/output',
  terminalWaitForExit: 'terminal/wait_for_exit',
  terminalKill: 'terminal/kill',
  terminalRelease: 'terminal/release',
} as const;

// Internal types for our extension
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

export type AcpMessageType =
  | 'text'
  | 'text_delta'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'status'
  | 'streaming_start'
  | 'streaming_end'
  | 'streaming_cancelled'
  | 'response_complete'
  | 'question_tool'
  | 'session_created'
  | 'plan'
  | 'tool_call_update'
  | 'agent_thought_chunk';

export interface AcpMessage {
  type: AcpMessageType;
  content?: string;
  delta?: string;
  messageId?: string;
  tool?: string;
  params?: unknown;
  id?: string;
  sessionId?: string;
  plan?: { entries: PlanEntry[] };
  toolCall?: ToolCall;
  question?: QuestionToolRequest;
  response?: ParsedResponse;
  partialContent?: string;
  isPartial?: boolean;
  message?: string; // For error messages
  error?: string;
  status?: string;
}

export interface AcpConnectionConfig {
  host: string;
  port: number;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  /**
   * Path/command used to launch OpenCode CLI.
   * Defaults to `opencode`.
   */
  opencodePath?: string;
}

export interface OfflineState {
  isOffline: boolean;
  lastConnectedAt?: number;
  offlineSince?: number;
  pendingMessageCount: number;
}

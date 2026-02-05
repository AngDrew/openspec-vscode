import * as vscode from 'vscode';
import { ErrorHandler } from '../utils/errorHandler';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    changeId?: string;
    phase?: WorkflowPhase;
    sessionId?: string;
    _compressed?: boolean;
    _originalLength?: number;
  };
}

export type WorkflowPhase = 'new' | 'drafting' | 'implementation' | 'review' | 'completed';

export interface SessionInfo {
  id: string;
  changeId?: string;
  phase: WorkflowPhase;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  acpSessionId?: string;
  acpPort?: number;
  // Enhanced metadata tracking
  metadata?: {
    lastActivityAt: number;
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
    averageResponseTime?: number;
    tags?: string[];
    description?: string;
  };
}

export interface ConversationSession {
  id: string;
  changeId?: string;
  phase: WorkflowPhase;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: {
    sessionId?: string;
    acpPort?: number;
    extraPrompt?: string;
    // Enhanced session metadata tracking
    lastActivityAt?: number;
    totalMessages?: number;
    userMessages?: number;
    assistantMessages?: number;
    systemMessages?: number;
    averageResponseTime?: number;
    tags?: string[];
    description?: string;
    sessionStartTime?: number;
    sessionEndTime?: number;
    isArchived?: boolean;
    archivedAt?: number;
  };
}

export class SessionManager {
  private static readonly MAX_MESSAGES = 100;
  private static readonly STORAGE_KEY = 'openspec.chat.sessions';
  private static readonly CURRENT_SESSION_KEY = 'openspec.chat.currentSession';
  private static readonly ACTIVE_SESSIONS_KEY = 'openspec.chat.activeSessions';
  private static readonly WORKSPACE_ACP_SESSION_KEY = 'openspec.workspace.acpSessionId';
  private static readonly WORKSPACE_ACP_PORT_KEY = 'openspec.workspace.acpPort';
  private static readonly COMPRESSION_THRESHOLD = 1024; // Compress messages larger than 1KB
  private static readonly MAX_SESSIONS = 50; // Maximum number of sessions to keep in history
  private static readonly MAX_CONCURRENT_SESSIONS = 10; // Maximum number of concurrent active sessions per workspace
  private static readonly SESSION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run cleanup once per day
  private static readonly OLD_SESSION_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // Sessions older than 7 days

  private cleanupInterval: NodeJS.Timeout | undefined;
  
  private static instance: SessionManager;
  private context: vscode.ExtensionContext | undefined;
  private currentSession: ConversationSession | undefined;
  private activeSessions: Map<string, ConversationSession> = new Map(); // Map of sessionId -> session for concurrent sessions
  private messageListeners: Array<(message: ChatMessage) => void> = [];
  private sessionChangeListeners: Array<(session: ConversationSession | undefined) => void> = [];
  private phaseChangeListeners: Array<(phase: WorkflowPhase, previousPhase: WorkflowPhase | undefined) => void> = [];
  private phaseTransitionListeners: Array<(newPhase: WorkflowPhase, previousPhase: WorkflowPhase | undefined, session: ConversationSession) => void> = [];

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.startMemoryCleanup();
    ErrorHandler.debug('SessionManager initialized');
  }

  async restoreSession(): Promise<ConversationSession | undefined> {
    if (!this.context) {
      return undefined;
    }

    const stored = this.context.globalState.get<ConversationSession>(SessionManager.CURRENT_SESSION_KEY);
    if (stored) {
      // Decompress session after loading from storage
      this.currentSession = this.decompressSession(stored);
      this.notifySessionChangeListeners(this.currentSession);
      ErrorHandler.debug(`Restored session: ${this.currentSession.id} (phase: ${this.currentSession.phase})`);
      return this.currentSession;
    }

    ErrorHandler.debug('No session to restore');
    return undefined;
  }

  async createSession(changeId?: string, description?: string): Promise<ConversationSession> {
    const now = Date.now();
    const session: ConversationSession = {
      id: this.generateSessionId(),
      changeId,
      phase: 'new',
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: {
        sessionStartTime: now,
        lastActivityAt: now,
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        systemMessages: 0,
        tags: changeId ? [changeId] : [],
        description: description || `Session started at ${new Date(now).toLocaleString()}`
      }
    };

    // Enforce maximum concurrent sessions limit
    if (this.activeSessions.size >= SessionManager.MAX_CONCURRENT_SESSIONS) {
      // Remove oldest inactive session
      const sortedSessions = Array.from(this.activeSessions.values())
        .sort((a, b) => a.updatedAt - b.updatedAt);
      const oldestSession = sortedSessions[0];
      if (oldestSession) {
        this.activeSessions.delete(oldestSession.id);
        ErrorHandler.debug(`Removed oldest session ${oldestSession.id} to make room for new session`);
      }
    }

    // Add to active sessions map for concurrent session support
    this.activeSessions.set(session.id, session);
    
    this.currentSession = session;
    await this.saveCurrentSession();
    await this.saveActiveSessions();
    await this.addToSessionHistory(session);
    
    this.notifySessionChangeListeners(session);
    ErrorHandler.debug(`Created new session: ${session.id} (active sessions: ${this.activeSessions.size})`);
    
    return session;
  }

  async getCurrentSession(): Promise<ConversationSession | undefined> {
    if (this.currentSession) {
      return this.currentSession;
    }

    if (!this.context) {
      return undefined;
    }

    const stored = this.context.globalState.get<ConversationSession>(SessionManager.CURRENT_SESSION_KEY);
    if (stored) {
      this.currentSession = stored;
      return stored;
    }

    return undefined;
  }

  async loadSession(sessionId: string): Promise<ConversationSession | undefined> {
    if (!this.context) {
      return undefined;
    }

    // Load full session from current session storage (simplified - in production would need separate full session storage)
    const stored = this.context.globalState.get<ConversationSession>(SessionManager.CURRENT_SESSION_KEY);
    if (stored && stored.id === sessionId) {
      this.currentSession = stored;
      this.notifySessionChangeListeners(stored);
      ErrorHandler.debug(`Loaded session: ${sessionId}`);
      return stored;
    }
    
    return undefined;
  }

  async addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    const session = await this.getOrCreateSession();
    const now = Date.now();
    
    const fullMessage: ChatMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: now
    };

    session.messages.push(fullMessage);
    session.updatedAt = now;

    // Update metadata tracking
    session.metadata = session.metadata || {};
    session.metadata.lastActivityAt = now;
    session.metadata.totalMessages = (session.metadata.totalMessages || 0) + 1;
    
    // Track message counts by role
    switch (message.role) {
      case 'user':
        session.metadata.userMessages = (session.metadata.userMessages || 0) + 1;
        break;
      case 'assistant':
        session.metadata.assistantMessages = (session.metadata.assistantMessages || 0) + 1;
        break;
      case 'system':
        session.metadata.systemMessages = (session.metadata.systemMessages || 0) + 1;
        break;
    }

    // Enforce message limit
    if (session.messages.length > SessionManager.MAX_MESSAGES) {
      session.messages = session.messages.slice(-SessionManager.MAX_MESSAGES);
      ErrorHandler.debug(`Trimmed session messages to ${SessionManager.MAX_MESSAGES}`);
    }

    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);
    
    this.notifyMessageListeners(fullMessage);
    ErrorHandler.debug(`Added message to session: ${fullMessage.id}`);
    
    return fullMessage;
  }

  async updateMessage(messageId: string, updates: Partial<ChatMessage>): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) {
      return false;
    }

    const messageIndex = session.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return false;
    }

    session.messages[messageIndex] = {
      ...session.messages[messageIndex],
      ...updates
    };
    session.updatedAt = Date.now();

    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);
    
    ErrorHandler.debug(`Updated message: ${messageId}`);
    return true;
  }

  async setPhase(phase: WorkflowPhase): Promise<void> {
    const session = await this.getOrCreateSession();
    const previousPhase = session.phase;
    
    if (previousPhase === phase) {
      return;
    }
    
    session.phase = phase;
    session.updatedAt = Date.now();
    
    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);
    
    this.notifyPhaseChangeListeners(phase, previousPhase);
    this.notifyPhaseTransitionListeners(phase, previousPhase, session);
    ErrorHandler.debug(`Phase transition: ${previousPhase} → ${phase}`);
  }

  getPhase(): WorkflowPhase | undefined {
    return this.currentSession?.phase;
  }

  async setChangeId(changeId: string): Promise<void> {
    const session = await this.getOrCreateSession();
    session.changeId = changeId;
    session.updatedAt = Date.now();

    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);

    ErrorHandler.debug(`Set session changeId to: ${changeId}`);
  }

  async setAcpSessionId(acpSessionId: string): Promise<void> {
    const session = await this.getOrCreateSession();
    session.metadata = session.metadata || {};
    session.metadata.sessionId = acpSessionId;
    session.updatedAt = Date.now();

    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);

    // Store in workspace state for persistence across reloads
    if (this.context) {
      await this.context.workspaceState.update(SessionManager.WORKSPACE_ACP_SESSION_KEY, acpSessionId);
      ErrorHandler.debug(`Stored ACP session ID in workspace state: ${acpSessionId}`);
    }

    ErrorHandler.debug(`Set ACP session ID to: ${acpSessionId}`);
  }

  async setAcpServerPort(port: number): Promise<void> {
    if (!Number.isInteger(port) || port <= 0) {
      return;
    }

    const session = await this.getOrCreateSession();
    session.metadata = session.metadata || {};
    session.metadata.acpPort = port;
    session.updatedAt = Date.now();

    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);

    if (this.context) {
      await this.context.workspaceState.update(SessionManager.WORKSPACE_ACP_PORT_KEY, port);
      ErrorHandler.debug(`Stored ACP server port in workspace state: ${port}`);
    }

    ErrorHandler.debug(`Set ACP server port to: ${port}`);
  }

  async getAcpServerPort(): Promise<number | undefined> {
    const session = await this.getCurrentSession();
    const storedInSession = session?.metadata?.acpPort;
    if (typeof storedInSession === 'number' && Number.isInteger(storedInSession) && storedInSession > 0) {
      return storedInSession;
    }

    if (this.context) {
      const storedPort = this.context.workspaceState.get<number>(SessionManager.WORKSPACE_ACP_PORT_KEY);
      if (typeof storedPort === 'number' && Number.isInteger(storedPort) && storedPort > 0) {
        if (session) {
          session.metadata = session.metadata || {};
          session.metadata.acpPort = storedPort;
          await this.saveCurrentSession();
          await this.updateSessionInHistory(session);
        }
        return storedPort;
      }
    }

    return undefined;
  }

  async getAcpSessionId(): Promise<string | undefined> {
    const session = await this.getCurrentSession();
    if (session?.metadata?.sessionId) {
      return session.metadata.sessionId;
    }
    
    // Fallback to workspace state
    if (this.context) {
      const workspaceSessionId = this.context.workspaceState.get<string>(SessionManager.WORKSPACE_ACP_SESSION_KEY);
      if (workspaceSessionId) {
        // Restore to current session if exists
        if (session) {
          session.metadata = session.metadata || {};
          session.metadata.sessionId = workspaceSessionId;
          await this.saveCurrentSession();
        }
        return workspaceSessionId;
      }
    }
    
    return undefined;
  }

  /**
   * Validate if the ACP session is still active by checking with the server
   * @param acpSessionId The session ID to validate
   * @returns Promise<boolean> True if session is valid and active
   */
  async validateAcpSession(acpSessionId: string): Promise<boolean> {
    if (!this.context) {
      return false;
    }

    try {
      // Import AcpClient dynamically to avoid circular dependency
      const { AcpClient } = await import('./acpClient');
      const acpClient = AcpClient.getInstance();
      
      // Check if client is connected
      if (!acpClient.isClientConnected()) {
        ErrorHandler.debug(`Cannot validate session ${acpSessionId}: ACP client not connected`);
        return false;
      }

      // Validate the session using ACP's loadSession method
      const isValid = await acpClient.validateSession(acpSessionId);
      ErrorHandler.debug(`Session ${acpSessionId} validation result: ${isValid}`);
      
      return isValid;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ErrorHandler.debug(`Error validating session ${acpSessionId}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Clean up sessions associated with a specific change ID when the change is archived
   * @param changeId The change ID to clean up sessions for
   * @returns Promise<number> Number of sessions cleaned up
   */
  async cleanupSessionsForChange(changeId: string): Promise<number> {
    if (!this.context) {
      return 0;
    }

    try {
      const sessions = await this.getAllSessions();
      let cleanedCount = 0;

      // Find and remove sessions associated with this change
      const remainingSessions = sessions.filter(session => {
        if (session.changeId === changeId) {
          cleanedCount++;
          // If this is the current session, clear it
          if (this.currentSession?.id === session.id) {
            this.currentSession = undefined;
            this.notifySessionChangeListeners(undefined);
          }
          return false;
        }
        return true;
      });

      if (cleanedCount > 0) {
        await this.context.globalState.update(SessionManager.STORAGE_KEY, remainingSessions);
        
        // Also clear current session if it was associated with this change
        if (this.currentSession?.changeId === changeId) {
          await this.clearCurrentSession();
        }

        ErrorHandler.debug(`Cleaned up ${cleanedCount} sessions for archived change: ${changeId}`);
      }

      return cleanedCount;
    } catch (error) {
      ErrorHandler.debug(`Error cleaning up sessions for change ${changeId}: ${error}`);
      return 0;
    }
  }

  /**
   * Clear the stored ACP session ID from both session and workspace state
   */
  async clearAcpSessionId(): Promise<void> {
    const session = await this.getCurrentSession();
    if (session?.metadata?.sessionId) {
      delete session.metadata.sessionId;
      session.updatedAt = Date.now();
      await this.saveCurrentSession();
    }

    if (this.context) {
      await this.context.workspaceState.update(SessionManager.WORKSPACE_ACP_SESSION_KEY, undefined);
    }

    ErrorHandler.debug('Cleared ACP session ID from workspace state');
  }

  /**
   * Restore ACP session from workspace state on extension reload
   * Validates the session and reconnects if still active
   * @returns Promise<boolean> True if session was successfully restored
   */
  async restoreAcpSession(): Promise<boolean> {
    if (!this.context) {
      return false;
    }

    const acpSessionId = this.context.workspaceState.get<string>(SessionManager.WORKSPACE_ACP_SESSION_KEY);
    if (!acpSessionId) {
      ErrorHandler.debug('No ACP session ID found in workspace state to restore');
      return false;
    }

    ErrorHandler.debug(`Attempting to restore ACP session: ${acpSessionId}`);

    try {
      // Import AcpClient dynamically to avoid circular dependency
      const { AcpClient } = await import('./acpClient');
      const acpClient = AcpClient.getInstance();

      // First, ensure we're connected to the ACP server
      if (!acpClient.isClientConnected()) {
        ErrorHandler.debug('ACP client not connected, attempting to connect...');
        const connected = await acpClient.connect();
        if (!connected) {
          ErrorHandler.debug('Failed to connect to ACP server, cannot restore session');
          return false;
        }
      }

      // Validate the session is still active
      const isValid = await this.validateAcpSession(acpSessionId);
      
      if (!isValid) {
        ErrorHandler.debug(`Session ${acpSessionId} is no longer valid, clearing from workspace state`);
        await this.clearAcpSessionId();
        return false;
      }

      // Restore the session ID to the current session
      const session = await this.getOrCreateSession();
      session.metadata = session.metadata || {};
      session.metadata.sessionId = acpSessionId;
      await this.saveCurrentSession();

      // Set the session ID in the ACP client
      acpClient.setCurrentSessionId(acpSessionId);

      ErrorHandler.debug(`Successfully restored ACP session: ${acpSessionId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ErrorHandler.debug(`Error restoring ACP session ${acpSessionId}: ${errorMessage}`);
      return false;
    }
  }

  async setExtraPrompt(extraPrompt: string): Promise<void> {
    const session = await this.getOrCreateSession();
    session.metadata = session.metadata || {};
    session.metadata.extraPrompt = extraPrompt;
    session.updatedAt = Date.now();

    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);

    ErrorHandler.debug(`Set extra prompt for apply phase`);
  }

  async getExtraPrompt(): Promise<string | undefined> {
    const session = await this.getCurrentSession();
    return session?.metadata?.extraPrompt;
  }

  async clearExtraPrompt(): Promise<void> {
    const session = await this.getCurrentSession();
    if (session?.metadata?.extraPrompt) {
      delete session.metadata.extraPrompt;
      session.updatedAt = Date.now();
      await this.saveCurrentSession();
      await this.updateSessionInHistory(session);
      ErrorHandler.debug('Cleared extra prompt');
    }
  }

  /**
   * Get session statistics and metadata
   */
  async getSessionStats(sessionId?: string): Promise<{
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
    duration: number;
    lastActivityAt: number;
    phase: WorkflowPhase;
    changeId?: string;
  } | undefined> {
    const session = sessionId ? this.getSession(sessionId) : await this.getCurrentSession();
    if (!session) {
      return undefined;
    }

    const now = Date.now();
    const duration = session.metadata?.sessionStartTime
      ? now - session.metadata.sessionStartTime
      : now - session.createdAt;

    return {
      totalMessages: session.metadata?.totalMessages || session.messages.length,
      userMessages: session.metadata?.userMessages || 0,
      assistantMessages: session.metadata?.assistantMessages || 0,
      systemMessages: session.metadata?.systemMessages || 0,
      duration,
      lastActivityAt: session.metadata?.lastActivityAt || session.updatedAt,
      phase: session.phase,
      changeId: session.changeId
    };
  }

  /**
   * Add tags to a session
   */
  async addSessionTags(sessionId: string, tags: string[]): Promise<boolean> {
    const session = this.getSession(sessionId) || this.currentSession;
    if (!session || session.id !== sessionId) {
      return false;
    }

    session.metadata = session.metadata || {};
    session.metadata.tags = session.metadata.tags || [];
    
    // Add new tags avoiding duplicates
    for (const tag of tags) {
      if (!session.metadata.tags.includes(tag)) {
        session.metadata.tags.push(tag);
      }
    }

    session.updatedAt = Date.now();
    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);
    
    ErrorHandler.debug(`Added tags to session ${sessionId}: ${tags.join(', ')}`);
    return true;
  }

  /**
   * Update session description
   */
  async setSessionDescription(sessionId: string, description: string): Promise<boolean> {
    const session = this.getSession(sessionId) || this.currentSession;
    if (!session || session.id !== sessionId) {
      return false;
    }

    session.metadata = session.metadata || {};
    session.metadata.description = description;
    session.updatedAt = Date.now();
    
    await this.saveCurrentSession();
    await this.updateSessionInHistory(session);
    
    ErrorHandler.debug(`Updated description for session ${sessionId}`);
    return true;
  }

  async clearCurrentSession(): Promise<void> {
    const sessionId = this.currentSession?.id;
    this.currentSession = undefined;
    
    if (this.context) {
      await this.context.globalState.update(SessionManager.CURRENT_SESSION_KEY, undefined);
    }
    
    // Also remove from active sessions if present
    if (sessionId && this.activeSessions.has(sessionId)) {
      this.activeSessions.delete(sessionId);
      await this.saveActiveSessions();
    }
    
    this.notifySessionChangeListeners(undefined);
    ErrorHandler.debug('Cleared current session');
  }

  async getAllSessions(): Promise<SessionInfo[]> {
    if (!this.context) {
      return [];
    }

    const sessions = this.context.globalState.get<SessionInfo[]>(SessionManager.STORAGE_KEY, []);
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.context) {
      return false;
    }

    const sessions = await this.getAllSessions();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    
    if (filteredSessions.length === sessions.length) {
      return false;
    }

    await this.context.globalState.update(SessionManager.STORAGE_KEY, filteredSessions);
    
    if (this.currentSession?.id === sessionId) {
      await this.clearCurrentSession();
    }
    
    ErrorHandler.debug(`Deleted session: ${sessionId}`);
    return true;
  }

  async archiveOldSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.context) {
      return 0;
    }

    const cutoff = Date.now() - maxAgeMs;
    const sessions = await this.getAllSessions();
    const activeSessions = sessions.filter(s => s.updatedAt > cutoff);
    const archivedCount = sessions.length - activeSessions.length;
    
    if (archivedCount > 0) {
      await this.context.globalState.update(SessionManager.STORAGE_KEY, activeSessions);
      ErrorHandler.debug(`Archived ${archivedCount} old sessions`);
    }
    
    return archivedCount;
  }

  onMessage(listener: (message: ChatMessage) => void): vscode.Disposable {
    this.messageListeners.push(listener);
    
    return new vscode.Disposable(() => {
      const index = this.messageListeners.indexOf(listener);
      if (index > -1) {
        this.messageListeners.splice(index, 1);
      }
    });
  }

  onSessionChange(listener: (session: ConversationSession | undefined) => void): vscode.Disposable {
    this.sessionChangeListeners.push(listener);
    
    return new vscode.Disposable(() => {
      const index = this.sessionChangeListeners.indexOf(listener);
      if (index > -1) {
        this.sessionChangeListeners.splice(index, 1);
      }
    });
  }

  onPhaseChange(listener: (phase: WorkflowPhase, previousPhase: WorkflowPhase | undefined) => void): vscode.Disposable {
    this.phaseChangeListeners.push(listener);
    
    return new vscode.Disposable(() => {
      const index = this.phaseChangeListeners.indexOf(listener);
      if (index > -1) {
        this.phaseChangeListeners.splice(index, 1);
      }
    });
  }

  onPhaseTransition(listener: (newPhase: WorkflowPhase, previousPhase: WorkflowPhase | undefined, session: ConversationSession) => void): vscode.Disposable {
    this.phaseTransitionListeners.push(listener);
    
    return new vscode.Disposable(() => {
      const index = this.phaseTransitionListeners.indexOf(listener);
      if (index > -1) {
        this.phaseTransitionListeners.splice(index, 1);
      }
    });
  }

  private async getOrCreateSession(): Promise<ConversationSession> {
    let session = await this.getCurrentSession();
    if (!session) {
      session = await this.createSession();
    }
    return session;
  }

  private async saveCurrentSession(): Promise<void> {
    if (!this.context || !this.currentSession) {
      return;
    }

    // Compress session before saving to reduce storage size
    const compressedSession = this.compressSession(this.currentSession);
    await this.context.globalState.update(SessionManager.CURRENT_SESSION_KEY, compressedSession);
  }

  /**
   * Save all active sessions to workspace state for concurrent session support
   */
  private async saveActiveSessions(): Promise<void> {
    if (!this.context) {
      return;
    }

    // Convert Map to array and compress each session
    const activeSessionsArray = Array.from(this.activeSessions.values()).map(session =>
      this.compressSession(session)
    );
    await this.context.workspaceState.update(SessionManager.ACTIVE_SESSIONS_KEY, activeSessionsArray);
    ErrorHandler.debug(`Saved ${activeSessionsArray.length} active sessions to workspace state`);
  }

  /**
   * Restore active sessions from workspace state on extension reload
   */
  async restoreActiveSessions(): Promise<ConversationSession[]> {
    if (!this.context) {
      return [];
    }

    const stored = this.context.workspaceState.get<ConversationSession[]>(SessionManager.ACTIVE_SESSIONS_KEY, []);
    if (stored.length > 0) {
      // Decompress and restore all active sessions
      this.activeSessions.clear();
      for (const compressedSession of stored) {
        const session = this.decompressSession(compressedSession);
        this.activeSessions.set(session.id, session);
      }
      ErrorHandler.debug(`Restored ${this.activeSessions.size} active sessions from workspace state`);
      return Array.from(this.activeSessions.values());
    }

    return [];
  }

  /**
   * Get all active concurrent sessions
   */
  getActiveSessions(): ConversationSession[] {
    return Array.from(this.activeSessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get a specific session by ID
   */
  getSession(sessionId: string): ConversationSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Switch to a different active session
   */
  async switchToSession(sessionId: string): Promise<ConversationSession | undefined> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.currentSession = session;
      await this.saveCurrentSession();
      this.notifySessionChangeListeners(session);
      ErrorHandler.debug(`Switched to session: ${sessionId}`);
      return session;
    }
    return undefined;
  }

  /**
   * Remove a specific session from active sessions
   */
  async removeSession(sessionId: string): Promise<boolean> {
    const hadSession = this.activeSessions.has(sessionId);
    if (hadSession) {
      this.activeSessions.delete(sessionId);
      await this.saveActiveSessions();

      // If we removed the current session, switch to another one or clear it
      if (this.currentSession?.id === sessionId) {
        const remainingSessions = this.getActiveSessions();
        if (remainingSessions.length > 0) {
          this.currentSession = remainingSessions[0];
          await this.saveCurrentSession();
          this.notifySessionChangeListeners(this.currentSession);
        } else {
          this.currentSession = undefined;
          await this.clearCurrentSession();
        }
      }

      ErrorHandler.debug(`Removed session: ${sessionId}`);
    }
    return hadSession;
  }

  private async addToSessionHistory(session: ConversationSession): Promise<void> {
    if (!this.context) {
      return;
    }

    const sessions = await this.getAllSessions();
    const sessionInfo: SessionInfo = {
      id: session.id,
      changeId: session.changeId,
      phase: session.phase,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      acpSessionId: session.metadata?.sessionId,
      acpPort: session.metadata?.acpPort,
      metadata: {
        lastActivityAt: session.metadata?.lastActivityAt || session.updatedAt,
        totalMessages: session.metadata?.totalMessages || session.messages.length,
        userMessages: session.metadata?.userMessages || 0,
        assistantMessages: session.metadata?.assistantMessages || 0,
        systemMessages: session.metadata?.systemMessages || 0,
        tags: session.metadata?.tags || [],
        description: session.metadata?.description
      }
    };

    sessions.unshift(sessionInfo);
    await this.context.globalState.update(SessionManager.STORAGE_KEY, sessions);
  }

  private async updateSessionInHistory(session: ConversationSession): Promise<void> {
    if (!this.context) {
      return;
    }

    const sessions = await this.getAllSessions();
    const index = sessions.findIndex(s => s.id === session.id);

    if (index !== -1) {
      sessions[index] = {
        id: session.id,
        changeId: session.changeId,
        phase: session.phase,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        acpSessionId: session.metadata?.sessionId,
        acpPort: session.metadata?.acpPort,
        metadata: {
          lastActivityAt: session.metadata?.lastActivityAt || session.updatedAt,
          totalMessages: session.metadata?.totalMessages || session.messages.length,
          userMessages: session.metadata?.userMessages || 0,
          assistantMessages: session.metadata?.assistantMessages || 0,
          systemMessages: session.metadata?.systemMessages || 0,
          tags: session.metadata?.tags || [],
          description: session.metadata?.description
        }
      };
      await this.context.globalState.update(SessionManager.STORAGE_KEY, sessions);
    }
  }

  private notifyMessageListeners(message: ChatMessage): void {
    this.messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        ErrorHandler.debug(`Error in message listener: ${error}`);
      }
    });
  }

  private notifySessionChangeListeners(session: ConversationSession | undefined): void {
    this.sessionChangeListeners.forEach(listener => {
      try {
        listener(session);
      } catch (error) {
        ErrorHandler.debug(`Error in session change listener: ${error}`);
      }
    });
  }

  private notifyPhaseChangeListeners(phase: WorkflowPhase, previousPhase: WorkflowPhase | undefined): void {
    this.phaseChangeListeners.forEach(listener => {
      try {
        listener(phase, previousPhase);
      } catch (error) {
        ErrorHandler.debug(`Error in phase change listener: ${error}`);
      }
    });
  }

  private notifyPhaseTransitionListeners(newPhase: WorkflowPhase, previousPhase: WorkflowPhase | undefined, session: ConversationSession): void {
    this.phaseTransitionListeners.forEach(listener => {
      try {
        listener(newPhase, previousPhase, session);
      } catch (error) {
        ErrorHandler.debug(`Error in phase transition listener: ${error}`);
      }
    });
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  dispose(): void {
    this.stopMemoryCleanup();
    this.messageListeners = [];
    this.sessionChangeListeners = [];
    this.phaseChangeListeners = [];
    this.phaseTransitionListeners = [];
    this.currentSession = undefined;
    this.activeSessions.clear();
    this.context = undefined;
  }

  // Start periodic memory cleanup for old sessions
  private startMemoryCleanup(): void {
    // Run cleanup immediately on startup
    this.performMemoryCleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, SessionManager.SESSION_CLEANUP_INTERVAL_MS);

    ErrorHandler.debug('Memory cleanup scheduled');
  }

  // Stop the memory cleanup interval
  private stopMemoryCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  // Perform memory cleanup - removes old sessions and enforces limits
  private async performMemoryCleanup(): Promise<void> {
    if (!this.context) {
      return;
    }

    try {
      const sessions = await this.getAllSessions();
      const now = Date.now();
      let cleanedCount = 0;

      // Remove sessions that are too old
      const oldSessionThreshold = now - SessionManager.OLD_SESSION_THRESHOLD_MS;
      const activeSessions = sessions.filter(session => {
        const isOld = session.updatedAt < oldSessionThreshold;
        const isCurrent = this.currentSession?.id === session.id;

        if (isOld && !isCurrent) {
          cleanedCount++;
          return false;
        }
        return true;
      });

      // Enforce maximum session limit (keep most recent)
      if (activeSessions.length > SessionManager.MAX_SESSIONS) {
        // Sort by updatedAt (newest first)
        activeSessions.sort((a, b) => b.updatedAt - a.updatedAt);

        // Keep only MAX_SESSIONS, but always keep current session
        const sessionsToKeep = activeSessions.slice(0, SessionManager.MAX_SESSIONS);
        const currentSessionInList = sessionsToKeep.find(s => s.id === this.currentSession?.id);

        if (!currentSessionInList && this.currentSession) {
          // Current session was evicted, add it back and remove the oldest
          sessionsToKeep.pop();
          sessionsToKeep.push({
            id: this.currentSession.id,
            changeId: this.currentSession.changeId,
            phase: this.currentSession.phase,
            createdAt: this.currentSession.createdAt,
            updatedAt: this.currentSession.updatedAt,
            messageCount: this.currentSession.messages.length
          });
        }

        cleanedCount += activeSessions.length - sessionsToKeep.length;
        await this.context.globalState.update(SessionManager.STORAGE_KEY, sessionsToKeep);
      } else if (cleanedCount > 0) {
        await this.context.globalState.update(SessionManager.STORAGE_KEY, activeSessions);
      }

      if (cleanedCount > 0) {
        ErrorHandler.debug(`Memory cleanup: removed ${cleanedCount} old sessions`);
      }

      // Clean up activeSessions map - remove sessions that are no longer in the history
      const validSessionIds = new Set(sessions.map(s => s.id));
      for (const sessionId of this.activeSessions.keys()) {
        if (!validSessionIds.has(sessionId)) {
          this.activeSessions.delete(sessionId);
          ErrorHandler.debug(`Removed session ${sessionId} from active sessions (no longer in history)`);
        }
      }
      await this.saveActiveSessions();

      // Also clean up orphaned session data from globalState
      await this.cleanupOrphanedSessionData();
    } catch (error) {
      ErrorHandler.debug(`Memory cleanup error: ${error}`);
    }
  }

  // Clean up any orphaned session data that may have been left behind
  private async cleanupOrphanedSessionData(): Promise<void> {
    if (!this.context) {
      return;
    }

    try {
      // Get all keys from globalState
      const allKeys = await this.context.globalState.keys();
      const validSessionIds = new Set((await this.getAllSessions()).map(s => s.id));

      // Find and remove orphaned session-specific keys
      const orphanedKeys = allKeys.filter(key => {
        // Check if this is a session-specific key
        if (key.startsWith('openspec.chat.session.') && !key.includes('.current')) {
          const sessionId = key.replace('openspec.chat.session.', '');
          return !validSessionIds.has(sessionId);
        }
        return false;
      });

      for (const key of orphanedKeys) {
        await this.context.globalState.update(key, undefined);
      }

      if (orphanedKeys.length > 0) {
        ErrorHandler.debug(`Cleaned up ${orphanedKeys.length} orphaned session data entries`);
      }
    } catch (error) {
      ErrorHandler.debug(`Orphaned data cleanup error: ${error}`);
    }
  }

  // Force immediate memory cleanup (can be called manually if needed)
  async forceMemoryCleanup(): Promise<{ removedSessions: number; removedOrphaned: number }> {
    if (!this.context) {
      return { removedSessions: 0, removedOrphaned: 0 };
    }

    const beforeSessions = (await this.getAllSessions()).length;
    await this.performMemoryCleanup();
    const afterSessions = (await this.getAllSessions()).length;

    return {
      removedSessions: beforeSessions - afterSessions,
      removedOrphaned: 0 // Tracked internally in cleanupOrphanedSessionData
    };
  }

  // Compression utilities for message storage
  private compressMessage(message: ChatMessage): ChatMessage {
    if (!message.content || message.content.length < SessionManager.COMPRESSION_THRESHOLD) {
      return message;
    }

    try {
      const compressed = this.compressString(message.content);
      return {
        ...message,
        content: `__COMPRESSED__${compressed}`,
        metadata: {
          ...message.metadata,
          _compressed: true,
          _originalLength: message.content.length
        }
      };
    } catch (error) {
      ErrorHandler.debug(`Failed to compress message: ${error}`);
      return message;
    }
  }

  private decompressMessage(message: ChatMessage): ChatMessage {
    if (!message.metadata?._compressed || !message.content.startsWith('__COMPRESSED__')) {
      return message;
    }

    try {
      const compressed = message.content.slice('__COMPRESSED__'.length);
      const decompressed = this.decompressString(compressed);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _compressed, _originalLength, ...restMetadata } = message.metadata;
      return {
        ...message,
        content: decompressed,
        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
      };
    } catch (error) {
      ErrorHandler.debug(`Failed to decompress message: ${error}`);
      return message;
    }
  }

  private compressSession(session: ConversationSession): ConversationSession {
    return {
      ...session,
      messages: session.messages.map(msg => this.compressMessage(msg))
    };
  }

  private decompressSession(session: ConversationSession): ConversationSession {
    return {
      ...session,
      messages: session.messages.map(msg => this.decompressMessage(msg))
    };
  }

  // Simple compression using LZ77-like algorithm optimized for text
  private compressString(str: string): string {
    // Use a simple run-length encoding for repeated characters
    // and dictionary-based compression for common patterns
    const dictionary: string[] = [];
    let result = '';
    let i = 0;

    while (i < str.length) {
      // Check for repeated characters
      let runLength = 1;
      while (i + runLength < str.length && str[i] === str[i + runLength] && runLength < 255) {
        runLength++;
      }

      if (runLength > 3) {
        // Encode run: marker + char + count
        result += `\x00R${str[i]}${String.fromCharCode(runLength)}`;
        i += runLength;
        continue;
      }

      // Check for dictionary matches (3-20 character sequences)
      let bestMatch = '';
      let bestIndex = -1;

      for (let len = Math.min(20, str.length - i); len >= 3; len--) {
        const substring = str.substr(i, len);
        const dictIndex = dictionary.indexOf(substring);
        if (dictIndex !== -1) {
          bestMatch = substring;
          bestIndex = dictIndex;
          break;
        }
      }

      if (bestIndex !== -1) {
        // Encode dictionary reference: marker + index (2 bytes)
        result += `\x00D${String.fromCharCode(bestIndex >> 8)}${String.fromCharCode(bestIndex & 0xFF)}`;
        i += bestMatch.length;
      } else {
        // Add to dictionary if it's a good candidate
        if (dictionary.length < 65535 && i + 3 <= str.length) {
          const candidate = str.substr(i, Math.min(10, str.length - i));
          if (candidate.length >= 3 && !dictionary.includes(candidate)) {
            dictionary.push(candidate);
          }
        }

        // Encode literal byte
        if (str[i] === '\x00') {
          result += '\x00\x00'; // Escape null byte
        } else {
          result += str[i];
        }
        i++;
      }
    }

    // Base64 encode the result for safe storage
    return this.toBase64(result);
  }

  private decompressString(compressed: string): string {
    const data = this.fromBase64(compressed);
    const dictionary: string[] = [];
    let result = '';
    let i = 0;

    while (i < data.length) {
      if (data[i] !== '\x00') {
        result += data[i];
        i++;
        continue;
      }

      // Check escape sequence
      if (i + 1 >= data.length) {
        break;
      }

      const marker = data[i + 1];

      if (marker === '\x00') {
        // Escaped null byte
        result += '\x00';
        i += 2;
      } else if (marker === 'R' && i + 3 < data.length) {
        // Run-length encoded sequence
        const char = data[i + 2];
        const count = data.charCodeAt(i + 3);
        result += char.repeat(count);
        i += 4;
      } else if (marker === 'D' && i + 3 < data.length) {
        // Dictionary reference
        const index = (data.charCodeAt(i + 2) << 8) | data.charCodeAt(i + 3);
        if (index < dictionary.length) {
          result += dictionary[index];
        }
        i += 4;
      } else {
        // Unknown marker, treat as literal
        result += data[i];
        i++;
      }

      // Rebuild dictionary (same logic as compression)
      if (dictionary.length < 65535 && result.length >= 3) {
        const candidate = result.substr(Math.max(0, result.length - 10), 10);
        if (candidate.length >= 3 && !dictionary.includes(candidate)) {
          dictionary.push(candidate);
        }
      }
    }

    return result;
  }

  private toBase64(str: string): string {
    try {
      // Use Buffer in Node.js environment
      return Buffer.from(str, 'binary').toString('base64');
    } catch {
      // Fallback for browser environment
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;

      while (i < str.length) {
        const a = str.charCodeAt(i++);
        const b = i < str.length ? str.charCodeAt(i++) : 0;
        const c = i < str.length ? str.charCodeAt(i++) : 0;

        const bitmap = (a << 16) | (b << 8) | c;

        result += chars.charAt((bitmap >> 18) & 63);
        result += chars.charAt((bitmap >> 12) & 63);
        result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
        result += i - 1 < str.length ? chars.charAt(bitmap & 63) : '=';
      }

      return result;
    }
  }

  private fromBase64(str: string): string {
    try {
      // Use Buffer in Node.js environment
      return Buffer.from(str, 'base64').toString('binary');
    } catch {
      // Fallback for browser environment
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;

      // Remove padding
      str = str.replace(/=+$/, '');

      while (i < str.length) {
        const a = chars.indexOf(str.charAt(i++));
        const b = chars.indexOf(str.charAt(i++));
        const c = chars.indexOf(str.charAt(i++));
        const d = chars.indexOf(str.charAt(i++));

        const bitmap = (a << 18) | (b << 12) | (c << 6) | d;

        result += String.fromCharCode((bitmap >> 16) & 255);
        if (c !== -1) {
          result += String.fromCharCode((bitmap >> 8) & 255);
        }
        if (d !== -1) {
          result += String.fromCharCode(bitmap & 255);
        }
      }

      return result;
    }
  }

  // Get compression statistics for debugging
  getCompressionStats(session: ConversationSession): { originalSize: number; compressedSize: number; ratio: number } {
    const originalSize = JSON.stringify(session).length;
    const compressedSession = this.compressSession(session);
    const compressedSize = JSON.stringify(compressedSession).length;
    return {
      originalSize,
      compressedSize,
      ratio: originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0
    };
  }
}

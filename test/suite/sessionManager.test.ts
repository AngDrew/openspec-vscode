import * as assert from 'assert';
import * as vscode from 'vscode';
import { 
  SessionManager, 
  ChatMessage, 
  ConversationSession, 
  SessionInfo,
  WorkflowPhase 
} from '../../src/services/sessionManager';

suite('SessionManager Persistence Test Suite', () => {
  let sessionManager: SessionManager;
  let mockContext: vscode.ExtensionContext;
  let globalState: Map<string, any>;

  setup(() => {
    sessionManager = SessionManager.getInstance();
    
    // Create mock extension context with globalState
    globalState = new Map<string, any>();
    mockContext = {
      globalState: {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
          const value = globalState.get(key);
          return value !== undefined ? value : defaultValue;
        },
        update: async (key: string, value: any): Promise<void> => {
          if (value === undefined) {
            globalState.delete(key);
          } else {
            globalState.set(key, value);
          }
        },
        keys: async (): Promise<string[]> => {
          return Array.from(globalState.keys());
        }
      }
    } as any;

    // Reset singleton state
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
  });

  teardown(async () => {
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
  });

  test('getInstance should return singleton instance', () => {
    const instance1 = SessionManager.getInstance();
    const instance2 = SessionManager.getInstance();
    assert.strictEqual(instance1, instance2, 'Should return same instance');
  });

  test('initialize should set up context', () => {
    sessionManager.initialize(mockContext);
    
    // Should be able to create a session after initialization
    assert.doesNotThrow(() => {
      sessionManager.createSession();
    }, 'Should initialize without errors');
  });

  test('createSession should persist session to globalState', async () => {
    sessionManager.initialize(mockContext);
    
    const session = await sessionManager.createSession('test-change-123');
    
    assert.ok(session.id, 'Session should have an ID');
    assert.strictEqual(session.changeId, 'test-change-123', 'Should store changeId');
    assert.strictEqual(session.phase, 'new', 'New session should be in new phase');
    assert.ok(session.createdAt, 'Should have createdAt timestamp');
    assert.ok(session.updatedAt, 'Should have updatedAt timestamp');
    
    // Verify persistence
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.ok(storedSession, 'Session should be stored in globalState');
    assert.strictEqual(storedSession.id, session.id, 'Stored session should have same ID');
  });

  test('restoreSession should restore session from globalState', async () => {
    sessionManager.initialize(mockContext);
    
    // Create and store a session
    const createdSession = await sessionManager.createSession('test-change');
    const sessionId = createdSession.id;
    
    // Simulate extension reload by creating new manager instance
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);
    
    // Restore the session
    const restoredSession = await sessionManager.restoreSession();
    
    assert.ok(restoredSession, 'Should restore session');
    assert.strictEqual(restoredSession!.id, sessionId, 'Should restore same session ID');
    assert.strictEqual(restoredSession!.changeId, 'test-change', 'Should restore changeId');
  });

  test('restoreSession should return undefined when no session exists', async () => {
    sessionManager.initialize(mockContext);
    
    const restoredSession = await sessionManager.restoreSession();
    
    assert.strictEqual(restoredSession, undefined, 'Should return undefined when no session');
  });

  test('addMessage should persist message to session', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    const message = await sessionManager.addMessage({
      role: 'user',
      content: 'Test message'
    });
    
    assert.ok(message.id, 'Message should have an ID');
    assert.ok(message.timestamp, 'Message should have timestamp');
    assert.strictEqual(message.role, 'user', 'Should store role');
    assert.strictEqual(message.content, 'Test message', 'Should store content');
    
    // Verify persistence
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.strictEqual(storedSession.messages.length, 1, 'Should have one message');
    assert.strictEqual(storedSession.messages[0].content, 'Test message', 'Should persist message content');
  });

  test('addMessage should enforce max message limit', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    // Add 105 messages (over the 100 limit)
    for (let i = 0; i < 105; i++) {
      await sessionManager.addMessage({
        role: 'user',
        content: `Message ${i}`
      });
    }
    
    const session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.messages.length, 100, 'Should limit to 100 messages');
    
    // Verify oldest messages were removed
    const contents = session!.messages.map(m => m.content);
    assert.ok(!contents.includes('Message 0'), 'Oldest messages should be removed');
    assert.ok(contents.includes('Message 104'), 'Newest messages should be kept');
  });

  test('updateMessage should persist changes to globalState', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    const message = await sessionManager.addMessage({
      role: 'assistant',
      content: 'Initial content'
    });
    
    const updated = await sessionManager.updateMessage(message.id, {
      content: 'Updated content'
    });
    
    assert.strictEqual(updated, true, 'Should return true on success');
    
    // Verify persistence
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.strictEqual(storedSession.messages[0].content, 'Updated content', 'Should persist updated content');
  });

  test('setPhase should persist phase change', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    await sessionManager.setPhase('drafting');
    
    const session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.phase, 'drafting', 'Phase should be updated');
    
    // Verify persistence
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.strictEqual(storedSession.phase, 'drafting', 'Should persist phase change');
  });

  test('setChangeId should persist changeId', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    await sessionManager.setChangeId('new-change-id');
    
    const session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.changeId, 'new-change-id', 'Should update changeId');
    
    // Verify persistence
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.strictEqual(storedSession.changeId, 'new-change-id', 'Should persist changeId');
  });

  test('getAllSessions should return session history', async () => {
    sessionManager.initialize(mockContext);
    
    // Create multiple sessions
    await sessionManager.createSession('change-1');
    await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
    await sessionManager.createSession('change-2');
    
    const allSessions = await sessionManager.getAllSessions();
    
    assert.ok(allSessions.length >= 2, 'Should have at least 2 sessions in history');
    assert.ok(allSessions.some(s => s.changeId === 'change-1'), 'Should include change-1');
    assert.ok(allSessions.some(s => s.changeId === 'change-2'), 'Should include change-2');
  });

  test('deleteSession should remove session from history', async () => {
    sessionManager.initialize(mockContext);
    
    const session = await sessionManager.createSession('to-delete');
    const sessionId = session.id;
    
    const deleted = await sessionManager.deleteSession(sessionId);
    
    assert.strictEqual(deleted, true, 'Should return true on success');
    
    const allSessions = await sessionManager.getAllSessions();
    assert.ok(!allSessions.some(s => s.id === sessionId), 'Session should be removed from history');
  });

  test('clearCurrentSession should remove session from globalState', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    await sessionManager.clearCurrentSession();
    
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.strictEqual(storedSession, undefined, 'Should clear stored session');
    
    const currentSession = await sessionManager.getCurrentSession();
    assert.strictEqual(currentSession, undefined, 'Should clear current session');
  });

  test('archiveOldSessions should remove old sessions', async () => {
    sessionManager.initialize(mockContext);
    
    // Create a session
    const session = await sessionManager.createSession('old-session');
    
    // Manually set session to be 8 days old
    const sessions = await sessionManager.getAllSessions();
    const oldSession = sessions.find(s => s.changeId === 'old-session');
    if (oldSession) {
      oldSession.updatedAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
      await mockContext.globalState.update('openspec.chat.sessions', sessions);
    }
    
    const archivedCount = await sessionManager.archiveOldSessions(7 * 24 * 60 * 60 * 1000);
    
    assert.ok(archivedCount >= 1, 'Should archive at least one old session');
    
    const remainingSessions = await sessionManager.getAllSessions();
    assert.ok(!remainingSessions.some(s => s.changeId === 'old-session'), 'Old session should be archived');
  });

  test('message compression should reduce storage size', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    // Create a large message (> 1KB threshold)
    const largeContent = 'A'.repeat(2000);
    
    await sessionManager.addMessage({
      role: 'assistant',
      content: largeContent
    });
    
    const session = await sessionManager.getCurrentSession();
    const stats = sessionManager.getCompressionStats(session!);
    
    assert.ok(stats.compressedSize < stats.originalSize, 'Compressed size should be smaller');
    assert.ok(stats.ratio > 0, 'Should have positive compression ratio');
  });

  test('decompressSession should restore compressed messages', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    const originalContent = 'Test content that should be compressed and decompressed properly';
    await sessionManager.addMessage({
      role: 'assistant',
      content: originalContent
    });
    
    // Simulate reload and restore
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);
    
    const restoredSession = await sessionManager.restoreSession();
    
    assert.ok(restoredSession, 'Should restore session');
    assert.strictEqual(restoredSession!.messages[0].content, originalContent, 'Should decompress message correctly');
  });

  test('onMessage listener should be called when message is added', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    const receivedMessages: ChatMessage[] = [];
    const disposable = sessionManager.onMessage((msg) => {
      receivedMessages.push(msg);
    });
    
    await sessionManager.addMessage({
      role: 'user',
      content: 'Test message'
    });
    
    assert.strictEqual(receivedMessages.length, 1, 'Listener should be called');
    assert.strictEqual(receivedMessages[0].content, 'Test message', 'Should receive correct message');
    
    disposable.dispose();
  });

  test('onSessionChange listener should be called on session changes', async () => {
    sessionManager.initialize(mockContext);
    
    const sessionChanges: (ConversationSession | undefined)[] = [];
    const disposable = sessionManager.onSessionChange((session) => {
      sessionChanges.push(session);
    });
    
    await sessionManager.createSession();
    
    assert.strictEqual(sessionChanges.length, 1, 'Listener should be called on create');
    assert.ok(sessionChanges[0], 'Should receive new session');
    
    await sessionManager.clearCurrentSession();
    
    assert.strictEqual(sessionChanges.length, 2, 'Listener should be called on clear');
    assert.strictEqual(sessionChanges[1], undefined, 'Should receive undefined on clear');
    
    disposable.dispose();
  });

  test('onPhaseChange listener should be called on phase transition', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    const phaseChanges: Array<{ phase: WorkflowPhase; previous: WorkflowPhase | undefined }> = [];
    const disposable = sessionManager.onPhaseChange((phase, previous) => {
      phaseChanges.push({ phase, previous });
    });
    
    await sessionManager.setPhase('drafting');
    
    assert.strictEqual(phaseChanges.length, 1, 'Listener should be called');
    assert.strictEqual(phaseChanges[0].phase, 'drafting', 'Should receive new phase');
    assert.strictEqual(phaseChanges[0].previous, 'new', 'Should receive previous phase');
    
    disposable.dispose();
  });

  test('forceMemoryCleanup should remove old sessions', async () => {
    sessionManager.initialize(mockContext);
    
    // Create multiple sessions
    for (let i = 0; i < 5; i++) {
      await sessionManager.createSession(`session-${i}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Manually age some sessions
    const sessions = await sessionManager.getAllSessions();
    sessions.forEach((s, index) => {
      if (index < 3) {
        s.updatedAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
      }
    });
    await mockContext.globalState.update('openspec.chat.sessions', sessions);
    
    const result = await sessionManager.forceMemoryCleanup();
    
    assert.ok(result.removedSessions >= 3, 'Should remove old sessions');
  });

  test('dispose should clean up all resources', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession();
    
    sessionManager.dispose();
    
    const currentSession = await sessionManager.getCurrentSession();
    assert.strictEqual(currentSession, undefined, 'Should clear current session');
  });
});

import * as assert from 'assert';
import * as vscode from 'vscode';
import { 
  SessionManager, 
  ChatMessage, 
  ConversationSession, 
  SessionInfo,
  WorkflowPhase 
} from '../../src/services/sessionManager';

suite('Session Persistence Across Reloads Test Suite', () => {
  let sessionManager: SessionManager;
  let mockContext: vscode.ExtensionContext;
  let globalState: Map<string, any>;

  setup(() => {
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
    sessionManager = SessionManager.getInstance();
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
  });

  teardown(async () => {
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
  });

  test('Session should persist after extension reload simulation', async () => {
    // Initialize and create session
    sessionManager.initialize(mockContext);
    const originalSession = await sessionManager.createSession('reload-test-change');
    const originalSessionId = originalSession.id;
    
    // Add messages
    await sessionManager.addMessage({ role: 'user', content: 'Message 1' });
    await sessionManager.addMessage({ role: 'assistant', content: 'Response 1' });
    await sessionManager.setPhase('drafting');

    // Verify session is stored
    const storedBefore = globalState.get('openspec.chat.currentSession');
    assert.ok(storedBefore, 'Session should be stored before reload');
    assert.strictEqual(storedBefore.id, originalSessionId, 'Stored session should have correct ID');
    assert.strictEqual(storedBefore.messages.length, 2, 'Should have 2 messages stored');
    assert.strictEqual(storedBefore.phase, 'drafting', 'Phase should be stored');

    // Simulate extension reload: dispose and recreate SessionManager
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore session after "reload"
    const restoredSession = await sessionManager.restoreSession();
    
    assert.ok(restoredSession, 'Should restore session after reload');
    assert.strictEqual(restoredSession!.id, originalSessionId, 'Restored session should have same ID');
    assert.strictEqual(restoredSession!.changeId, 'reload-test-change', 'Should restore changeId');
    assert.strictEqual(restoredSession!.messages.length, 2, 'Should restore all messages');
    assert.strictEqual(restoredSession!.messages[0].content, 'Message 1', 'Should restore first message');
    assert.strictEqual(restoredSession!.messages[1].content, 'Response 1', 'Should restore second message');
    assert.strictEqual(restoredSession!.phase, 'drafting', 'Should restore phase');
  });

  test('Multiple reloads should maintain session integrity', async () => {
    sessionManager.initialize(mockContext);
    const session = await sessionManager.createSession('multi-reload-test');
    const sessionId = session.id;

    // Add initial message
    await sessionManager.addMessage({ role: 'user', content: 'Initial' });

    // Simulate multiple reloads
    for (let i = 0; i < 3; i++) {
      // Reload
      sessionManager.dispose();
      (SessionManager as any).instance = undefined;
      sessionManager = SessionManager.getInstance();
      sessionManager.initialize(mockContext);

      // Restore and add message
      const restored = await sessionManager.restoreSession();
      assert.ok(restored, `Should restore session after reload ${i + 1}`);
      assert.strictEqual(restored!.id, sessionId, `Session ID should match after reload ${i + 1}`);
      
      await sessionManager.addMessage({ role: 'user', content: `Message ${i + 1}` });
    }

    // Final verification
    const finalSession = await sessionManager.getCurrentSession();
    assert.strictEqual(finalSession!.messages.length, 4, 'Should have all 4 messages (initial + 3)');
    assert.strictEqual(finalSession!.messages[3].content, 'Message 3', 'Should have latest message');
  });

  test('Session history should persist across reloads', async () => {
    sessionManager.initialize(mockContext);

    // Create multiple sessions
    const session1 = await sessionManager.createSession('change-1');
    await new Promise(resolve => setTimeout(resolve, 10));
    const session2 = await sessionManager.createSession('change-2');
    await new Promise(resolve => setTimeout(resolve, 10));
    const session3 = await sessionManager.createSession('change-3');

    // Verify history before reload
    let history = await sessionManager.getAllSessions();
    assert.ok(history.length >= 3, 'Should have at least 3 sessions in history');

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Verify history persists
    history = await sessionManager.getAllSessions();
    assert.ok(history.length >= 3, 'History should persist after reload');
    assert.ok(history.some(s => s.changeId === 'change-1'), 'Should include change-1 in history');
    assert.ok(history.some(s => s.changeId === 'change-2'), 'Should include change-2 in history');
    assert.ok(history.some(s => s.changeId === 'change-3'), 'Should include change-3 in history');
  });

  test('Message compression and decompression across reloads', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession('compression-test');

    // Add a large message that will be compressed
    const largeContent = 'A'.repeat(5000);
    await sessionManager.addMessage({ 
      role: 'assistant', 
      content: largeContent 
    });

    // Verify compression stats
    const session = await sessionManager.getCurrentSession();
    const stats = sessionManager.getCompressionStats(session!);
    assert.ok(stats.compressedSize < stats.originalSize, 'Message should be compressed');

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore and verify content
    const restored = await sessionManager.restoreSession();
    assert.ok(restored, 'Should restore session');
    assert.strictEqual(restored!.messages[0].content, largeContent, 'Large message should be decompressed correctly');
  });

  test('Phase transitions persist across reloads', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession('phase-test');

    // Transition through phases
    const phases: WorkflowPhase[] = ['new', 'drafting', 'implementation', 'review', 'completed'];
    for (const phase of phases) {
      await sessionManager.setPhase(phase);
    }

    // Verify final phase
    let session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.phase, 'completed', 'Should be in completed phase');

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore and verify phase
    const restored = await sessionManager.restoreSession();
    assert.strictEqual(restored!.phase, 'completed', 'Phase should persist after reload');
  });

  test('Session without changeId persists correctly', async () => {
    sessionManager.initialize(mockContext);
    
    // Create session without changeId
    const session = await sessionManager.createSession();
    assert.strictEqual(session.changeId, undefined, 'Should not have changeId');

    await sessionManager.addMessage({ role: 'user', content: 'Test' });

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore and verify
    const restored = await sessionManager.restoreSession();
    assert.ok(restored, 'Should restore session');
    assert.strictEqual(restored!.changeId, undefined, 'changeId should remain undefined');
    assert.strictEqual(restored!.messages[0].content, 'Test', 'Message should persist');
  });

  test('Empty session list after reload when no sessions exist', async () => {
    sessionManager.initialize(mockContext);

    // Verify no sessions initially
    let history = await sessionManager.getAllSessions();
    assert.strictEqual(history.length, 0, 'Should have no sessions initially');

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Verify still no sessions
    history = await sessionManager.getAllSessions();
    assert.strictEqual(history.length, 0, 'Should still have no sessions after reload');

    const restored = await sessionManager.restoreSession();
    assert.strictEqual(restored, undefined, 'Should return undefined when no session exists');
  });

  test('Session metadata persists across reloads', async () => {
    sessionManager.initialize(mockContext);
    const session = await sessionManager.createSession('metadata-test');
    const originalCreatedAt = session.createdAt;

    // Wait a bit and add message
    await new Promise(resolve => setTimeout(resolve, 50));
    await sessionManager.addMessage({ role: 'user', content: 'Test' });

    const beforeReload = await sessionManager.getCurrentSession();
    const updatedAtBefore = beforeReload!.updatedAt;

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore and verify metadata
    const restored = await sessionManager.restoreSession();
    assert.strictEqual(restored!.createdAt, originalCreatedAt, 'createdAt should persist');
    assert.strictEqual(restored!.updatedAt, updatedAtBefore, 'updatedAt should persist');
    assert.strictEqual(restored!.messages.length, 1, 'Should have 1 message');
  });

  test('Concurrent session operations and reload', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession('concurrent-test');

    // Add multiple messages in quick succession
    const promises: Promise<ChatMessage>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(sessionManager.addMessage({ 
        role: 'user', 
        content: `Concurrent message ${i}` 
      }));
    }
    await Promise.all(promises);

    // Verify all messages are stored
    let session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.messages.length, 5, 'Should have all 5 messages');

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore and verify all messages persisted
    const restored = await sessionManager.restoreSession();
    assert.strictEqual(restored!.messages.length, 5, 'All messages should persist after reload');
    
    // Verify message order
    for (let i = 0; i < 5; i++) {
      assert.ok(
        restored!.messages.some(m => m.content === `Concurrent message ${i}`),
        `Message ${i} should exist`
      );
    }
  });

  test('Session restoration with tool call data', async () => {
    sessionManager.initialize(mockContext);
    await sessionManager.createSession('tool-call-persistence-test');

    // Add message with tool calls
    await sessionManager.addMessage({
      role: 'assistant',
      content: 'I will help you with that',
      toolCalls: [{
        id: 'tool-1',
        tool: 'read_file',
        params: { path: '/test.txt' },
        status: 'completed',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        result: 'file contents'
      }]
    });

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore and verify tool calls
    const restored = await sessionManager.restoreSession();
    assert.ok(restored, 'Should restore session');
    assert.strictEqual(restored!.messages.length, 1, 'Should have 1 message');
    assert.ok(restored!.messages[0].toolCalls, 'Message should have tool calls');
    assert.strictEqual(restored!.messages[0].toolCalls!.length, 1, 'Should have 1 tool call');
    assert.strictEqual(restored!.messages[0].toolCalls![0].tool, 'read_file', 'Tool name should persist');
    assert.strictEqual(restored!.messages[0].toolCalls![0].status, 'completed', 'Tool status should persist');
  });

  test('Session cleanup does not affect current session on reload', async () => {
    sessionManager.initialize(mockContext);
    
    // Create current session
    const currentSession = await sessionManager.createSession('current-session');
    await sessionManager.addMessage({ role: 'user', content: 'Current' });

    // Create old sessions that should be cleaned up
    for (let i = 0; i < 3; i++) {
      const oldSession = await sessionManager.createSession(`old-session-${i}`);
      // Manually age the session
      const sessions = await sessionManager.getAllSessions();
      const sessionToAge = sessions.find(s => s.id === oldSession.id);
      if (sessionToAge) {
        sessionToAge.updatedAt = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days old
        await mockContext.globalState.update('openspec.chat.sessions', sessions);
      }
    }

    // Restore current session (simulate it being the active one)
    await sessionManager.loadSession(currentSession.id);

    // Simulate reload
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
    sessionManager = SessionManager.getInstance();
    sessionManager.initialize(mockContext);

    // Restore current session
    const restored = await sessionManager.restoreSession();
    assert.ok(restored, 'Current session should be restored');
    assert.strictEqual(restored!.changeId, 'current-session', 'Should restore correct session');
  });
});

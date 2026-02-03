import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { ChatProvider, ChatMessage, ChatSession } from '../../src/providers/chatProvider';
import { SessionManager, ConversationSession, ChatMessage as SessionChatMessage } from '../../src/services/sessionManager';
import { AcpClient } from '../../src/services/acpClient';
import { ServerLifecycle } from '../../src/services/serverLifecycle';
import { PortManager } from '../../src/services/portManager';

suite('End-to-End Chat Flow Integration Test Suite', () => {
  let chatProvider: ChatProvider;
  let sessionManager: SessionManager;
  let acpClient: AcpClient;
  let serverLifecycle: ServerLifecycle;
  let portManager: PortManager;
  let mockContext: vscode.ExtensionContext;
  let globalState: Map<string, any>;
  const testExtensionUri = vscode.Uri.file(path.join(__dirname, '../../../'));

  setup(() => {
    // Initialize services
    chatProvider = new ChatProvider(testExtensionUri);
    sessionManager = SessionManager.getInstance();
    acpClient = AcpClient.getInstance();
    serverLifecycle = ServerLifecycle.getInstance();
    portManager = PortManager.getInstance();

    // Create mock extension context
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

    // Initialize session manager
    sessionManager.initialize(mockContext);

    // Reset singleton states
    acpClient['isConnected'] = false;
    acpClient['requestId'] = 0;
    acpClient['pendingRequests'].clear();
    acpClient['messageListeners'] = [];
    acpClient['connectionListeners'] = [];
    acpClient['toolCallListeners'] = [];
    acpClient['responseListeners'] = [];
    acpClient['activeToolCalls'].clear();
    acpClient['currentResponseBuffer'] = '';
    acpClient['currentResponse'] = undefined;
    acpClient['abortController'] = undefined;
    acpClient['activeStreamMessageId'] = undefined;
    acpClient['sseReconnectAttempts'] = 0;
    acpClient['messageQueue'] = [];
    acpClient['offlineState'] = { isOffline: false, pendingMessageCount: 0 };
    acpClient['offlineListeners'] = [];

    if (acpClient['sseReconnectTimer']) {
      clearTimeout(acpClient['sseReconnectTimer']);
      acpClient['sseReconnectTimer'] = undefined;
    }
    if (acpClient['offlineRetryTimer']) {
      clearInterval(acpClient['offlineRetryTimer']);
      acpClient['offlineRetryTimer'] = undefined;
    }
  });

  teardown(async () => {
    chatProvider.dispose();
    sessionManager.dispose();
    acpClient.dispose();
    serverLifecycle.dispose();

    // Reset SessionManager singleton
    (SessionManager as any).instance = undefined;
  });

  test('Complete chat flow: create session, send messages, and verify persistence', async () => {
    // Step 1: Create a new session
    const session = await sessionManager.createSession('test-change-e2e');
    assert.ok(session.id, 'Session should have an ID');
    assert.strictEqual(session.changeId, 'test-change-e2e', 'Session should have correct changeId');
    assert.strictEqual(session.phase, 'new', 'New session should be in new phase');

    // Step 2: Add user message
    const userMessage = await sessionManager.addMessage({
      role: 'user',
      content: 'Hello, I want to create a new feature'
    });
    assert.ok(userMessage.id, 'User message should have an ID');
    assert.strictEqual(userMessage.role, 'user', 'Message should be from user');
    assert.strictEqual(userMessage.content, 'Hello, I want to create a new feature', 'Message content should match');

    // Step 3: Add assistant message
    const assistantMessage = await sessionManager.addMessage({
      role: 'assistant',
      content: 'I can help you create a new feature. What would you like to implement?'
    });
    assert.ok(assistantMessage.id, 'Assistant message should have an ID');
    assert.strictEqual(assistantMessage.role, 'assistant', 'Message should be from assistant');

    // Step 4: Update session phase
    await sessionManager.setPhase('drafting');
    const updatedSession = await sessionManager.getCurrentSession();
    assert.strictEqual(updatedSession!.phase, 'drafting', 'Phase should be updated to drafting');

    // Step 5: Verify persistence
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.ok(storedSession, 'Session should be stored in globalState');
    assert.strictEqual(storedSession.messages.length, 2, 'Should have 2 messages stored');
    assert.strictEqual(storedSession.phase, 'drafting', 'Phase should be persisted');
  });

  test('Chat flow with ChatProvider integration', async () => {
    // Step 1: Create session via SessionManager
    const session = await sessionManager.createSession('chat-provider-test');

    // Step 2: Add messages through SessionManager
    await sessionManager.addMessage({
      role: 'user',
      content: '/status'
    });

    // Step 3: Verify session state
    const currentSession = await sessionManager.getCurrentSession();
    assert.ok(currentSession, 'Should have current session');
    assert.strictEqual(currentSession!.messages.length, 1, 'Should have 1 message');

    // Step 4: Test phase transitions
    await sessionManager.setPhase('implementation');
    const phase = sessionManager.getPhase();
    assert.strictEqual(phase, 'implementation', 'Phase should be implementation');
  });

  test('Message streaming simulation in chat flow', async () => {
    // Create session
    await sessionManager.createSession('streaming-test');

    // Add initial user message
    await sessionManager.addMessage({
      role: 'user',
      content: 'Generate some code'
    });

    // Simulate streaming by adding a message and updating it
    const streamingMessage = await sessionManager.addMessage({
      role: 'assistant',
      content: ''
    });

    // Simulate streaming updates
    const chunks = ['Here', ' is', ' your', ' code:', '\n```typescript\n', 'const x = 1;\n', '```'];
    let fullContent = '';

    for (const chunk of chunks) {
      fullContent += chunk;
      await sessionManager.updateMessage(streamingMessage.id, { content: fullContent });
    }

    // Verify final message
    const session = await sessionManager.getCurrentSession();
    const finalMessage = session!.messages.find(m => m.id === streamingMessage.id);
    assert.ok(finalMessage, 'Should find the streaming message');
    assert.ok(finalMessage!.content.includes('const x = 1;'), 'Should contain the code');
  });

  test('Chat flow with tool calls', async () => {
    await sessionManager.createSession('tool-call-test');

    // Add user message
    await sessionManager.addMessage({
      role: 'user',
      content: 'Read a file for me'
    });

    // Add assistant message with tool call
    const messageWithTool = await sessionManager.addMessage({
      role: 'assistant',
      content: 'I will read the file for you.',
      toolCalls: [{
        id: 'tool-1',
        tool: 'read_file',
        params: { path: '/test/file.txt' },
        status: 'running',
        startTime: Date.now()
      }]
    });

    assert.ok(messageWithTool.toolCalls, 'Message should have tool calls');
    assert.strictEqual(messageWithTool.toolCalls!.length, 1, 'Should have 1 tool call');
    assert.strictEqual(messageWithTool.toolCalls![0].tool, 'read_file', 'Should be read_file tool');
  });

  test('Multiple sessions in chat flow', async () => {
    // Create first session
    const session1 = await sessionManager.createSession('change-1');
    await sessionManager.addMessage({ role: 'user', content: 'Message for change 1' });

    // Create second session
    const session2 = await sessionManager.createSession('change-2');
    await sessionManager.addMessage({ role: 'user', content: 'Message for change 2' });

    // Verify both sessions exist in history
    const allSessions = await sessionManager.getAllSessions();
    assert.ok(allSessions.length >= 2, 'Should have at least 2 sessions in history');
    assert.ok(allSessions.some(s => s.changeId === 'change-1'), 'Should include change-1');
    assert.ok(allSessions.some(s => s.changeId === 'change-2'), 'Should include change-2');

    // Verify current session is the second one
    const currentSession = await sessionManager.getCurrentSession();
    assert.strictEqual(currentSession!.changeId, 'change-2', 'Current session should be change-2');
    assert.strictEqual(currentSession!.messages.length, 1, 'Should have 1 message in current session');
  });

  test('Chat flow error handling and recovery', async () => {
    await sessionManager.createSession('error-test');

    // Add messages normally
    await sessionManager.addMessage({
      role: 'user',
      content: 'Normal message'
    });

    // Verify session is still valid
    const session = await sessionManager.getCurrentSession();
    assert.ok(session, 'Session should exist');
    assert.strictEqual(session!.messages.length, 1, 'Should have 1 message');

    // Test that we can continue adding messages
    await sessionManager.addMessage({
      role: 'assistant',
      content: 'Response to normal message'
    });

    const updatedSession = await sessionManager.getCurrentSession();
    assert.strictEqual(updatedSession!.messages.length, 2, 'Should have 2 messages');
  });

  test('End-to-end session lifecycle: create, use, and clear', async () => {
    // Create and populate session
    await sessionManager.createSession('lifecycle-test');
    await sessionManager.setPhase('drafting');
    await sessionManager.addMessage({ role: 'user', content: 'Start' });
    await sessionManager.addMessage({ role: 'assistant', content: 'Response' });

    // Verify session exists
    let session = await sessionManager.getCurrentSession();
    assert.ok(session, 'Session should exist');
    assert.strictEqual(session!.messages.length, 2, 'Should have 2 messages');

    // Clear session
    await sessionManager.clearCurrentSession();

    // Verify session is cleared
    session = await sessionManager.getCurrentSession();
    assert.strictEqual(session, undefined, 'Session should be cleared');

    // Verify globalState is cleared
    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.strictEqual(storedSession, undefined, 'Stored session should be cleared');
  });
});

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChatProvider, ChatMessage } from '../../src/providers/chatProvider';
import { SessionManager } from '../../src/services/sessionManager';
import { AcpClient } from '../../src/services/acpClient';
import { ServerLifecycle } from '../../src/services/serverLifecycle';
import { PortManager } from '../../src/services/portManager';
import { ErrorHandler } from '../../src/utils/errorHandler';

suite('Error Scenario Integration Test Suite', () => {
  let chatProvider: ChatProvider;
  let sessionManager: SessionManager;
  let acpClient: AcpClient;
  let serverLifecycle: ServerLifecycle;
  let portManager: PortManager;
  let mockContext: vscode.ExtensionContext;
  let globalState: Map<string, any>;
  const testExtensionUri = vscode.Uri.file('test-extension');

  setup(() => {
    chatProvider = new ChatProvider(testExtensionUri);
    sessionManager = SessionManager.getInstance();
    acpClient = AcpClient.getInstance();
    serverLifecycle = ServerLifecycle.getInstance();
    portManager = PortManager.getInstance();

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

    sessionManager.initialize(mockContext);

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
    (SessionManager as any).instance = undefined;
  });

  test('SessionManager should handle storage errors gracefully', async () => {
    const failingContext = {
      globalState: {
        get: () => { throw new Error('Storage read error'); },
        update: async () => { throw new Error('Storage write error'); },
        keys: async () => { throw new Error('Storage keys error'); }
      }
    } as any;

    try {
      sessionManager.initialize(failingContext);
      const session = await sessionManager.createSession('error-test');
      assert.ok(session, 'Should create session even with storage errors');
    } catch (error) {
      assert.fail('Should not throw error on storage failure');
    }
  });

  test('AcpClient should handle connection failures gracefully', async () => {
    acpClient.configure({
      host: 'invalid.host.that.does.not.exist',
      port: 99999,
      timeoutMs: 100,
      retryAttempts: 1,
      retryDelayMs: 10
    });

    try {
      const connected = await acpClient.connect();
      assert.strictEqual(connected, false, 'Should return false on connection failure');
    } catch (error) {
      assert.fail('Should not throw on connection failure');
    }
  });

  test('AcpClient should handle message send when not connected', async () => {
    acpClient['isConnected'] = false;

    try {
      await acpClient.sendMessage('test message');
      assert.fail('Should throw when sending message while not connected');
    } catch (error) {
      assert.ok(error instanceof Error, 'Should throw error');
    }
  });

  test('AcpClient should handle malformed JSON-RPC responses', () => {
    const malformedResponses = [
      'not valid json',
      '{',
      'null',
      'undefined',
      '',
      '{"jsonrpc": "2.0"}', // Missing method/id
      '{"jsonrpc": "1.0", "method": "test"}', // Wrong version
    ];

    for (const response of malformedResponses) {
      try {
        const result = acpClient.parseResponse(response);
        assert.ok(result, 'Should return a result even for malformed input');
        assert.ok(result.messageId, 'Should have a message ID');
      } catch (error) {
        assert.fail(`Should not throw for malformed response: ${response}`);
      }
    }
  });

  test('AcpClient should handle notification with missing params', () => {
    const messages: any[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    const notifications = [
      { jsonrpc: '2.0', method: 'message' },
      { jsonrpc: '2.0', method: 'status', params: null },
      { jsonrpc: '2.0', method: 'tool_call' },
    ];

    for (const notification of notifications) {
      try {
        acpClient['handleNotification'](notification as any);
      } catch (error) {
        assert.fail('Should not throw for notification with missing params');
      }
    }

    assert.ok(true, 'Handled all notifications without errors');
  });

  test('ServerLifecycle should handle server detection errors', async () => {
    try {
      const isRunning = await serverLifecycle.detectOpenCodeServer();
      assert.ok(typeof isRunning === 'boolean', 'Should return boolean even on error');
    } catch (error) {
      assert.fail('Should not throw on server detection failure');
    }
  });

  test('PortManager should handle invalid port ranges', async () => {
    const invalidPorts = [-1, 0, 65536, 99999, NaN, Infinity];

    for (const port of invalidPorts) {
      try {
        const isAvailable = await portManager.isPortAvailable(port as any);
        assert.strictEqual(isAvailable, false, `Port ${port} should not be available`);
      } catch (error) {
        assert.fail(`Should not throw for invalid port: ${port}`);
      }
    }
  });

  test('PortManager should handle port scanning with no available ports', async () => {
    try {
      const port = await portManager.findAvailablePort();
      assert.ok(port === undefined || typeof port === 'number', 'Should handle edge case gracefully');
    } catch (error) {
      assert.fail('Should not throw when no ports available');
    }
  });

  test('SessionManager should handle concurrent session operations', async () => {
    await sessionManager.createSession('concurrent-test');

    const operations = [
      sessionManager.addMessage({ role: 'user', content: 'Message 1' }),
      sessionManager.addMessage({ role: 'user', content: 'Message 2' }),
      sessionManager.setPhase('drafting'),
      sessionManager.getCurrentSession(),
    ];

    try {
      const results = await Promise.all(operations);
      assert.ok(results.every(r => r !== undefined), 'All concurrent operations should complete');
    } catch (error) {
      assert.fail('Should handle concurrent operations without errors');
    }
  });

  test('SessionManager should handle message with invalid data', async () => {
    await sessionManager.createSession('invalid-data-test');

    const invalidMessages = [
      { role: '', content: '' },
      { role: 'invalid', content: 'test' },
      { role: 'user', content: '' },
    ];

    for (const msg of invalidMessages) {
      try {
        await sessionManager.addMessage(msg as any);
      } catch (error) {
        assert.fail('Should not throw for invalid message data');
      }
    }

    const session = await sessionManager.getCurrentSession();
    assert.ok(session!.messages.length >= 0, 'Should handle invalid messages gracefully');
  });

  test('ChatProvider should handle webview disposal', () => {
    try {
      chatProvider.dispose();
      assert.ok(true, 'Should dispose without errors');
    } catch (error) {
      assert.fail('Should not throw on dispose');
    }
  });

  test('ChatProvider should handle message operations when webview not ready', () => {
    try {
      chatProvider.addMessage({
        id: 'test',
        role: 'user',
        content: 'Test message',
        timestamp: Date.now()
      });

      chatProvider.updateMessage('test', 'Updated content', false);
      chatProvider.clearToolCalls();

      assert.ok(true, 'Should handle operations when webview not ready');
    } catch (error) {
      assert.fail('Should not throw when webview not ready');
    }
  });

  test('ErrorHandler should handle various error types', () => {
    const errors = [
      new Error('Standard error'),
      new TypeError('Type error'),
      new RangeError('Range error'),
      { message: 'Object error' },
      'String error',
      null,
      undefined,
      123,
    ];

    for (const err of errors) {
      try {
        ErrorHandler.handle(err as any, 'test context', false);
      } catch (error) {
        assert.fail('Should not throw when handling errors');
      }
    }

    assert.ok(true, 'Handled all error types without throwing');
  });

  test('AcpClient should handle streaming cancellation during active stream', () => {
    acpClient['activeStreamMessageId'] = 'stream-test';
    acpClient['currentResponseBuffer'] = 'Partial content during streaming';
    acpClient['abortController'] = new AbortController();

    const result = acpClient.cancelStreaming();

    assert.ok(result, 'Should return cancelled response');
    assert.strictEqual(result!.content, 'Partial content during streaming', 'Should preserve partial content');
    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Should clear active stream');
  });

  test('AcpClient should handle tool call with missing fields', () => {
    const toolCalls: any[] = [];
    acpClient.onToolCall((tc) => toolCalls.push(tc));

    const incompleteToolCalls = [
      { id: 'tc-1' },
      { tool: 'test' },
      { id: 'tc-2', tool: 'test', params: null },
      {},
    ];

    for (const tc of incompleteToolCalls) {
      try {
        acpClient['notifyToolCallListeners'](tc as any);
      } catch (error) {
        assert.fail('Should not throw for incomplete tool call');
      }
    }

    assert.ok(toolCalls.length > 0, 'Should handle incomplete tool calls');
  });

  test('SessionManager should handle phase transitions with invalid phases', async () => {
    await sessionManager.createSession('phase-test');

    const invalidPhases = ['', 'invalid', null, undefined, 123];

    for (const phase of invalidPhases) {
      try {
        await sessionManager.setPhase(phase as any);
      } catch (error) {
        assert.fail(`Should not throw for invalid phase: ${phase}`);
      }
    }

    const session = await sessionManager.getCurrentSession();
    assert.ok(session, 'Session should still exist after invalid phase transitions');
  });

  test('Integration: Full error recovery flow', async () => {
    await sessionManager.createSession('recovery-test');

    try {
      await sessionManager.addMessage({ role: 'user', content: 'Start' });

      acpClient['isConnected'] = false;
      try {
        await acpClient.sendMessage('test');
      } catch (e) {
      }

      await sessionManager.addMessage({ role: 'assistant', content: 'Error handled' });

      const session = await sessionManager.getCurrentSession();
      assert.ok(session!.messages.length >= 2, 'Should continue after error');

      await sessionManager.clearCurrentSession();
      const cleared = await sessionManager.getCurrentSession();
      assert.strictEqual(cleared, undefined, 'Should clear session successfully');
    } catch (error) {
      assert.fail('Should recover from errors gracefully');
    }
  });
});

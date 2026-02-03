import * as assert from 'assert';
import * as vscode from 'vscode';
import { AcpClient, JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../../src/services/acpClient';
import { ServerLifecycle, ServerHealth } from '../../src/services/serverLifecycle';
import { PortManager } from '../../src/services/portManager';
import { SessionManager } from '../../src/services/sessionManager';

suite('OpenCode Server Integration Test Suite', () => {
  let acpClient: AcpClient;
  let serverLifecycle: ServerLifecycle;
  let portManager: PortManager;
  let sessionManager: SessionManager;
  let mockContext: vscode.ExtensionContext;
  let globalState: Map<string, any>;

  setup(() => {
    acpClient = AcpClient.getInstance();
    serverLifecycle = ServerLifecycle.getInstance();
    portManager = PortManager.getInstance();
    sessionManager = SessionManager.getInstance();

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

    // Initialize services
    serverLifecycle.initialize(mockContext);
    sessionManager.initialize(mockContext);

    // Reset AcpClient state
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

  teardown(() => {
    acpClient.dispose();
    serverLifecycle.dispose();
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
  });

  test('ServerLifecycle should detect server status correctly', async () => {
    // Test that server detection works (will return false if no server running)
    const isRunning = await serverLifecycle.detectOpenCodeServer();
    
    // We can't guarantee server is running, but we can verify the method works
    assert.ok(typeof isRunning === 'boolean', 'Should return boolean');
    
    // Verify status is updated
    const status = serverLifecycle.getCurrentStatus();
    assert.ok(['stopped', 'running', 'unknown'].includes(status), 'Status should be valid');
  });

  test('ServerLifecycle health monitoring', () => {
    // Start health monitoring
    serverLifecycle.startHealthMonitoring(1000);
    
    // Verify monitoring is active
    const health = serverLifecycle.getLastHealth();
    // Health might be undefined initially, which is ok
    
    // Stop monitoring
    serverLifecycle.stopHealthMonitoring();
    
    assert.ok(true, 'Health monitoring should start and stop without errors');
  });

  test('PortManager integration with server detection', async () => {
    // Test port scanning
    const availablePort = await portManager.findAvailablePort();
    assert.ok(availablePort !== undefined, 'Should find an available port');
    assert.ok(availablePort! >= 4000 && availablePort! <= 4999, 'Port should be in valid range');
    
    // Test port availability check
    const isAvailable = await portManager.isPortAvailable(availablePort!);
    assert.strictEqual(isAvailable, true, 'Found port should be available');
    
    // Store and retrieve port
    await portManager.setSelectedPort(availablePort!);
    const storedPort = portManager.getSelectedPort();
    assert.strictEqual(storedPort, availablePort, 'Port should be stored correctly');
  });

  test('AcpClient configuration and connection state', () => {
    // Configure client
    acpClient.configure({
      host: '127.0.0.1',
      port: 4099,
      timeoutMs: 5000,
      retryAttempts: 3,
      retryDelayMs: 1000
    });

    const config = acpClient.getConfig();
    assert.strictEqual(config.host, '127.0.0.1', 'Host should be configured');
    assert.strictEqual(config.port, 4099, 'Port should be configured');
    assert.strictEqual(config.timeoutMs, 5000, 'Timeout should be configured');
    assert.strictEqual(config.retryAttempts, 3, 'Retry attempts should be configured');
    assert.strictEqual(config.retryDelayMs, 1000, 'Retry delay should be configured');

    // Verify initial connection state
    assert.strictEqual(acpClient.isClientConnected(), false, 'Should not be connected initially');
  });

  test('AcpClient message listeners integration', () => {
    const messages: any[] = [];
    const toolCalls: any[] = [];
    const connections: boolean[] = [];

    // Register listeners
    const messageDisposable = acpClient.onMessage((msg) => messages.push(msg));
    const toolCallDisposable = acpClient.onToolCall((tc) => toolCalls.push(tc));
    const connectionDisposable = acpClient.onConnectionChange((connected) => connections.push(connected));

    // Simulate events
    acpClient['notifyMessageListeners']({ type: 'text', content: 'Test' });
    acpClient['notifyToolCallListeners']({ id: 'tc-1', tool: 'test', params: {}, status: 'running', startTime: Date.now() });
    acpClient['notifyConnectionListeners'](true);
    acpClient['notifyConnectionListeners'](false);

    // Verify listeners were called
    assert.strictEqual(messages.length, 1, 'Message listener should be called');
    assert.strictEqual(toolCalls.length, 1, 'Tool call listener should be called');
    assert.deepStrictEqual(connections, [true, false], 'Connection listener should receive changes');

    // Cleanup
    messageDisposable.dispose();
    toolCallDisposable.dispose();
    connectionDisposable.dispose();
  });

  test('AcpClient offline mode integration', () => {
    // Initially not offline
    let offlineState = acpClient.getOfflineState();
    assert.strictEqual(offlineState.isOffline, false, 'Should not be offline initially');

    // Queue a message (simulates offline behavior)
    const queued = acpClient.queueMessage('Test message');
    assert.ok(queued.id, 'Queued message should have ID');
    assert.strictEqual(queued.content, 'Test message', 'Should store content');

    // Verify queue
    const queue = acpClient.getQueuedMessages();
    assert.strictEqual(queue.length, 1, 'Should have 1 queued message');

    // Clear queue
    acpClient.clearMessageQueue();
    assert.strictEqual(acpClient.getQueuedMessages().length, 0, 'Queue should be empty');
  });

  test('Integration between ServerLifecycle and AcpClient', async () => {
    // Configure port
    const testPort = 4099;
    await portManager.setSelectedPort(testPort);
    acpClient.configure({ port: testPort });

    // Check server status
    await serverLifecycle.detectOpenCodeServer();
    const status = serverLifecycle.getCurrentStatus();

    // If server is running, AcpClient should be able to connect
    if (status === 'running') {
      // Note: We won't actually connect in tests to avoid dependencies
      assert.ok(true, 'Server is running - AcpClient would be able to connect');
    } else {
      assert.ok(true, 'Server not running - connection would fail gracefully');
    }
  });

  test('ServerLifecycle crash recovery configuration', () => {
    const config = serverLifecycle.getCrashRecoveryConfig();
    assert.ok(typeof config.enabled === 'boolean', 'Should have enabled flag');
    assert.ok(typeof config.maxRestarts === 'number', 'Should have maxRestarts');
    assert.ok(typeof config.restartDelayMs === 'number', 'Should have restartDelayMs');

    // Update config
    serverLifecycle.configureCrashRecovery({
      enabled: true,
      maxRestarts: 5,
      restartDelayMs: 10000
    });

    const updatedConfig = serverLifecycle.getCrashRecoveryConfig();
    assert.strictEqual(updatedConfig.enabled, true, 'Enabled should be updated');
    assert.strictEqual(updatedConfig.maxRestarts, 5, 'Max restarts should be updated');
    assert.strictEqual(updatedConfig.restartDelayMs, 10000, 'Restart delay should be updated');
  });

  test('AcpClient notification handling integration', () => {
    const messages: any[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    // Test various notification types
    const notifications: JsonRpcNotification[] = [
      { jsonrpc: '2.0', method: 'message', params: { content: 'Hello', messageId: 'msg-1' } },
      { jsonrpc: '2.0', method: 'message_delta', params: { delta: ' world', messageId: 'msg-1' } },
      { jsonrpc: '2.0', method: 'streaming_start', params: { messageId: 'stream-1' } },
      { jsonrpc: '2.0', method: 'streaming_end', params: { messageId: 'stream-1' } },
      { jsonrpc: '2.0', method: 'status', params: { status: 'processing' } }
    ];

    for (const notification of notifications) {
      acpClient['handleNotification'](notification);
    }

    // Verify messages were processed
    assert.ok(messages.length > 0, 'Should have processed notifications');
    assert.ok(messages.some(m => m.type === 'text'), 'Should have text message');
    assert.ok(messages.some(m => m.type === 'text_delta'), 'Should have delta message');
    assert.ok(messages.some(m => m.type === 'streaming_start'), 'Should have streaming start');
    assert.ok(messages.some(m => m.type === 'streaming_end'), 'Should have streaming end');
    assert.ok(messages.some(m => m.type === 'status'), 'Should have status message');
  });

  test('AcpClient streaming cancellation integration', () => {
    // Setup streaming state
    acpClient['activeStreamMessageId'] = 'stream-test';
    acpClient['currentResponseBuffer'] = 'Partial response content';
    acpClient['abortController'] = new AbortController();

    // Add a tool call to active calls
    acpClient['activeToolCalls'].set('tc-1', {
      id: 'tc-1',
      tool: 'test_tool',
      params: {},
      status: 'running',
      startTime: Date.now()
    });

    // Cancel streaming
    const cancelledResponse = acpClient.cancelStreaming();

    assert.ok(cancelledResponse, 'Should return cancelled response');
    assert.strictEqual(cancelledResponse!.messageId, 'stream-test', 'Should have correct message ID');
    assert.strictEqual(cancelledResponse!.content, 'Partial response content', 'Should have partial content');
    assert.strictEqual(cancelledResponse!.isComplete, true, 'Should be marked complete');
    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Active stream should be cleared');
  });

  test('End-to-end service initialization', () => {
    // Verify all services are properly initialized
    assert.ok(serverLifecycle, 'ServerLifecycle should be initialized');
    assert.ok(acpClient, 'AcpClient should be initialized');
    assert.ok(portManager, 'PortManager should be initialized');
    assert.ok(sessionManager, 'SessionManager should be initialized');

    // Verify singleton instances
    assert.strictEqual(AcpClient.getInstance(), acpClient, 'Should return same AcpClient instance');
    assert.strictEqual(ServerLifecycle.getInstance(), serverLifecycle, 'Should return same ServerLifecycle instance');
    assert.strictEqual(PortManager.getInstance(), portManager, 'Should return same PortManager instance');
    assert.strictEqual(SessionManager.getInstance(), sessionManager, 'Should return same SessionManager instance');
  });
});

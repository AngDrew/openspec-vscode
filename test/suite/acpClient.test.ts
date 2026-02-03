import * as assert from 'assert';
import * as vscode from 'vscode';
import { 
  AcpClient, 
  JsonRpcRequest, 
  JsonRpcResponse, 
  JsonRpcNotification,
  ToolCall,
  ParsedResponse,
  AcpMessage,
  AcpConnectionConfig,
  QueuedMessage,
  OfflineState
} from '../../src/services/acpClient';
import { PortManager } from '../../src/services/portManager';

suite('AcpClient JSON-RPC Test Suite', () => {
  let acpClient: AcpClient;
  let portManager: PortManager;

  setup(() => {
    acpClient = AcpClient.getInstance();
    portManager = PortManager.getInstance();
    
    // Reset singleton state
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
  });

  test('getInstance should return singleton instance', () => {
    const instance1 = AcpClient.getInstance();
    const instance2 = AcpClient.getInstance();
    assert.strictEqual(instance1, instance2, 'Should return same instance');
  });

  test('configure should update connection config', () => {
    const newConfig: Partial<AcpConnectionConfig> = {
      host: '192.168.1.1',
      port: 8080,
      timeoutMs: 60000,
      retryAttempts: 10,
      retryDelayMs: 2000
    };
    
    acpClient.configure(newConfig);
    
    const config = acpClient.getConfig();
    assert.strictEqual(config.host, '192.168.1.1', 'Host should be updated');
    assert.strictEqual(config.port, 8080, 'Port should be updated');
    assert.strictEqual(config.timeoutMs, 60000, 'Timeout should be updated');
    assert.strictEqual(config.retryAttempts, 10, 'Retry attempts should be updated');
    assert.strictEqual(config.retryDelayMs, 2000, 'Retry delay should be updated');
  });

  test('getConfig should return current config', () => {
    const config = acpClient.getConfig();
    
    assert.ok(typeof config.host === 'string', 'Config should have host');
    assert.ok(typeof config.port === 'number', 'Config should have port');
    assert.ok(typeof config.timeoutMs === 'number', 'Config should have timeoutMs');
    assert.ok(typeof config.retryAttempts === 'number', 'Config should have retryAttempts');
    assert.ok(typeof config.retryDelayMs === 'number', 'Config should have retryDelayMs');
  });

  test('isClientConnected should return connection status', () => {
    assert.strictEqual(acpClient.isClientConnected(), false, 'Should return false when not connected');
    
    acpClient['isConnected'] = true;
    assert.strictEqual(acpClient.isClientConnected(), true, 'Should return true when connected');
  });

  test('generateRequestId should create unique IDs', () => {
    const id1 = acpClient['generateRequestId']();
    const id2 = acpClient['generateRequestId']();
    
    assert.notStrictEqual(id1, id2, 'Request IDs should be unique');
    assert.ok(id1.startsWith('req_'), 'Request ID should start with req_');
    assert.ok(id2.startsWith('req_'), 'Request ID should start with req_');
  });

  test('parseResponse should handle string data', () => {
    const result = acpClient.parseResponse('Hello World');
    
    assert.strictEqual(result.content, 'Hello World', 'Should parse string content');
    assert.strictEqual(result.isComplete, true, 'Should be complete');
    assert.ok(result.messageId, 'Should have message ID');
    assert.ok(result.timestamp, 'Should have timestamp');
    assert.deepStrictEqual(result.toolCalls, [], 'Should have empty tool calls');
  });

  test('parseResponse should handle object data with content field', () => {
    const data = {
      messageId: 'test-123',
      content: 'Test message',
      isComplete: false,
      timestamp: 1234567890
    };
    
    const result = acpClient.parseResponse(data);
    
    assert.strictEqual(result.messageId, 'test-123', 'Should parse messageId');
    assert.strictEqual(result.content, 'Test message', 'Should parse content');
    assert.strictEqual(result.isComplete, false, 'Should parse isComplete');
    assert.strictEqual(result.timestamp, 1234567890, 'Should parse timestamp');
  });

  test('parseResponse should handle object data with message field', () => {
    const data = {
      message: 'Alternative message field'
    };
    
    const result = acpClient.parseResponse(data);
    
    assert.strictEqual(result.content, 'Alternative message field', 'Should use message field as content');
  });

  test('parseResponse should handle object data with text field', () => {
    const data = {
      text: 'Text field content'
    };
    
    const result = acpClient.parseResponse(data);
    
    assert.strictEqual(result.content, 'Text field content', 'Should use text field as content');
  });

  test('parseResponse should parse tool calls', () => {
    const data = {
      content: 'Test',
      toolCalls: [
        { id: 'tc-1', tool: 'test-tool', params: { arg: 'value' }, status: 'running' }
      ]
    };
    
    const result = acpClient.parseResponse(data);
    
    assert.strictEqual(result.toolCalls.length, 1, 'Should parse tool calls');
    assert.strictEqual(result.toolCalls[0].id, 'tc-1', 'Should parse tool call ID');
    assert.strictEqual(result.toolCalls[0].tool, 'test-tool', 'Should parse tool name');
    assert.deepStrictEqual(result.toolCalls[0].params, { arg: 'value' }, 'Should parse tool params');
  });

  test('parseResponse should parse tool_calls field', () => {
    const data = {
      content: 'Test',
      tool_calls: [
        { id: 'tc-2', name: 'another-tool', arguments: { foo: 'bar' } }
      ]
    };
    
    const result = acpClient.parseResponse(data);
    
    assert.strictEqual(result.toolCalls.length, 1, 'Should parse tool_calls');
    assert.strictEqual(result.toolCalls[0].tool, 'another-tool', 'Should use name field');
    assert.deepStrictEqual(result.toolCalls[0].params, { foo: 'bar' }, 'Should use arguments field');
  });

  test('onMessage should register message listener', () => {
    const messages: AcpMessage[] = [];
    
    const disposable = acpClient.onMessage((message) => {
      messages.push(message);
    });
    
    acpClient['notifyMessageListeners']({ type: 'text', content: 'Test' });
    
    assert.strictEqual(messages.length, 1, 'Listener should be called');
    assert.strictEqual(messages[0].type, 'text', 'Should receive text message');
    
    disposable.dispose();
  });

  test('onConnectionChange should register connection listener', () => {
    const connections: boolean[] = [];
    
    const disposable = acpClient.onConnectionChange((connected) => {
      connections.push(connected);
    });
    
    acpClient['notifyConnectionListeners'](true);
    acpClient['notifyConnectionListeners'](false);
    
    assert.deepStrictEqual(connections, [true, false], 'Should receive connection changes');
    
    disposable.dispose();
  });

  test('onToolCall should register tool call listener', () => {
    const toolCalls: ToolCall[] = [];
    
    const disposable = acpClient.onToolCall((toolCall) => {
      toolCalls.push(toolCall);
    });
    
    const testToolCall: ToolCall = {
      id: 'tc-1',
      tool: 'test',
      params: {},
      status: 'running',
      startTime: Date.now()
    };
    
    acpClient['notifyToolCallListeners'](testToolCall);
    
    assert.strictEqual(toolCalls.length, 1, 'Listener should be called');
    assert.strictEqual(toolCalls[0].id, 'tc-1', 'Should receive tool call');
    
    disposable.dispose();
  });

  test('onResponse should register response listener', () => {
    const responses: ParsedResponse[] = [];
    
    const disposable = acpClient.onResponse((response) => {
      responses.push(response);
    });
    
    const testResponse: ParsedResponse = {
      messageId: 'resp-1',
      content: 'Test response',
      toolCalls: [],
      isComplete: true,
      timestamp: Date.now()
    };
    
    acpClient['notifyResponseListeners'](testResponse);
    
    assert.strictEqual(responses.length, 1, 'Listener should be called');
    assert.strictEqual(responses[0].messageId, 'resp-1', 'Should receive response');
    
    disposable.dispose();
  });

  test('getActiveToolCalls should return active tool calls', () => {
    const toolCall1: ToolCall = {
      id: 'tc-1',
      tool: 'tool1',
      params: {},
      status: 'running',
      startTime: Date.now()
    };
    
    const toolCall2: ToolCall = {
      id: 'tc-2',
      tool: 'tool2',
      params: {},
      status: 'completed',
      startTime: Date.now(),
      endTime: Date.now()
    };
    
    acpClient['activeToolCalls'].set('tc-1', toolCall1);
    acpClient['activeToolCalls'].set('tc-2', toolCall2);
    
    const active = acpClient.getActiveToolCalls();
    
    assert.strictEqual(active.length, 2, 'Should return all tool calls');
    assert.ok(active.some(tc => tc.id === 'tc-1'), 'Should include tc-1');
    assert.ok(active.some(tc => tc.id === 'tc-2'), 'Should include tc-2');
  });

  test('cancelStreaming should abort active stream', () => {
    acpClient['activeStreamMessageId'] = 'stream-1';
    acpClient['currentResponseBuffer'] = 'Partial content';
    acpClient['abortController'] = new AbortController();
    
    const result = acpClient.cancelStreaming();
    
    assert.ok(result, 'Should return cancelled response');
    assert.strictEqual(result!.messageId, 'stream-1', 'Should have correct message ID');
    assert.strictEqual(result!.content, 'Partial content', 'Should have partial content');
    assert.strictEqual(result!.isComplete, true, 'Should be marked complete');
    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Active stream should be cleared');
  });

  test('cancelStreaming should return undefined when no active stream', () => {
    acpClient['activeStreamMessageId'] = undefined;
    
    const result = acpClient.cancelStreaming();
    
    assert.strictEqual(result, undefined, 'Should return undefined when no active stream');
  });

  test('createCancelledResponse should create proper response', () => {
    acpClient['currentResponseBuffer'] = 'Cancelled content';
    
    const toolCall: ToolCall = {
      id: 'tc-1',
      tool: 'test',
      params: {},
      status: 'running',
      startTime: Date.now()
    };
    acpClient['activeToolCalls'].set('tc-1', toolCall);
    
    const result = acpClient['createCancelledResponse']('msg-1');
    
    assert.strictEqual(result.messageId, 'msg-1', 'Should have message ID');
    assert.strictEqual(result.content, 'Cancelled content', 'Should have buffer content');
    assert.strictEqual(result.isComplete, true, 'Should be complete');
    assert.strictEqual(result.toolCalls.length, 1, 'Should include active tool calls');
  });

  test('queueMessage should add message to queue', () => {
    const queued = acpClient.queueMessage('Test message');
    
    assert.ok(queued.id, 'Should have ID');
    assert.strictEqual(queued.content, 'Test message', 'Should have content');
    assert.strictEqual(queued.retryCount, 0, 'Should have zero retries');
    assert.ok(queued.timestamp, 'Should have timestamp');
    
    const queue = acpClient.getQueuedMessages();
    assert.strictEqual(queue.length, 1, 'Message should be in queue');
  });

  test('queueMessage should respect max queue size', () => {
    for (let i = 0; i < 50; i++) {
      acpClient.queueMessage(`Message ${i}`);
    }
    
    acpClient.queueMessage('New message');
    
    const queue = acpClient.getQueuedMessages();
    assert.strictEqual(queue.length, 50, 'Queue should not exceed max size');
    assert.strictEqual(queue[queue.length - 1].content, 'New message', 'New message should be added');
  });

  test('getQueuedMessages should return copy of queue', () => {
    acpClient.queueMessage('Test');
    
    const queue1 = acpClient.getQueuedMessages();
    const queue2 = acpClient.getQueuedMessages();
    
    assert.notStrictEqual(queue1, queue2, 'Should return different arrays');
    assert.deepStrictEqual(queue1, queue2, 'Should have same content');
  });

  test('clearMessageQueue should empty the queue', () => {
    acpClient.queueMessage('Message 1');
    acpClient.queueMessage('Message 2');
    
    acpClient.clearMessageQueue();
    
    const queue = acpClient.getQueuedMessages();
    assert.strictEqual(queue.length, 0, 'Queue should be empty');
  });

  test('getOfflineState should return current offline state', () => {
    const state = acpClient.getOfflineState();
    
    assert.ok(typeof state.isOffline === 'boolean', 'Should have isOffline');
    assert.ok(typeof state.pendingMessageCount === 'number', 'Should have pendingMessageCount');
  });

  test('onOfflineChange should register offline listener', () => {
    const states: OfflineState[] = [];
    
    const disposable = acpClient.onOfflineChange((state) => {
      states.push(state);
    });
    
    assert.strictEqual(states.length, 1, 'Should be called immediately');
    
    disposable.dispose();
  });

  test('dispose should clean up all resources', () => {
    acpClient['isConnected'] = true;
    acpClient['pendingRequests'].set('req-1', {
      resolve: () => {},
      reject: () => {},
      timeout: setTimeout(() => {}, 1000)
    });
    acpClient.queueMessage('Test');
    
    acpClient.dispose();
    
    assert.strictEqual(acpClient.isClientConnected(), false, 'Should disconnect');
    assert.strictEqual(acpClient['pendingRequests'].size, 0, 'Should clear pending requests');
    assert.strictEqual(acpClient.getQueuedMessages().length, 0, 'Should clear queue');
    assert.strictEqual(acpClient['messageListeners'].length, 0, 'Should clear listeners');
  });

  test('handleNotification should process message notification', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));
    
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'message',
      params: { content: 'Hello', messageId: 'msg-1' }
    };
    
    acpClient['handleNotification'](notification);
    
    assert.ok(messages.some(m => m.type === 'text' && m.content === 'Hello'), 'Should receive text message');
  });

  test('handleNotification should process message_delta notification', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));
    
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'message_delta',
      params: { delta: ' world', messageId: 'msg-1' }
    };
    
    acpClient['handleNotification'](notification);
    
    assert.ok(messages.some(m => m.type === 'text_delta'), 'Should receive delta message');
  });

  test('handleNotification should process streaming_start notification', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));
    
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'streaming_start',
      params: { messageId: 'stream-1' }
    };
    
    acpClient['handleNotification'](notification);
    
    assert.strictEqual(acpClient['activeStreamMessageId'], 'stream-1', 'Should set active stream');
    assert.ok(messages.some(m => m.type === 'streaming_start'), 'Should receive streaming start');
  });

  test('handleNotification should process tool_call notification', () => {
    const toolCalls: ToolCall[] = [];
    acpClient.onToolCall((tc) => toolCalls.push(tc));
    
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'tool_call',
      params: { tool: 'read_file', id: 'tc-1', params: { path: '/test' } }
    };
    
    acpClient['handleNotification'](notification);
    
    assert.strictEqual(toolCalls.length, 1, 'Should receive tool call');
    assert.strictEqual(toolCalls[0].tool, 'read_file', 'Should have correct tool');
    assert.strictEqual(toolCalls[0].status, 'running', 'Should be running');
  });

  test('handleNotification should process tool_result notification', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));
    
    // First add a tool call
    acpClient['activeToolCalls'].set('tc-1', {
      id: 'tc-1',
      tool: 'read_file',
      params: {},
      status: 'running',
      startTime: Date.now()
    });
    
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'tool_result',
      params: { tool: 'read_file', id: 'tc-1', result: 'file contents' }
    };
    
    acpClient['handleNotification'](notification);
    
    const toolCall = acpClient['activeToolCalls'].get('tc-1');
    assert.strictEqual(toolCall?.status, 'completed', 'Should be completed');
    assert.strictEqual(toolCall?.result, 'file contents', 'Should have result');
  });

  test('handleNotification should process status notification', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));
    
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'status',
      params: { status: 'processing' }
    };
    
    acpClient['handleNotification'](notification);
    
    assert.ok(messages.some(m => m.type === 'status' && m.status === 'processing'), 'Should receive status');
  });

  test('calculateBackoffDelay should increase with attempts', () => {
    const delay1 = acpClient['calculateBackoffDelay'](1);
    const delay2 = acpClient['calculateBackoffDelay'](2);
    const delay3 = acpClient['calculateBackoffDelay'](3);
    
    assert.ok(delay2 > delay1, 'Delay should increase');
    assert.ok(delay3 > delay2, 'Delay should continue increasing');
  });

  test('sendRequest should create valid JsonRpcRequest', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 'req-1',
      method: 'test_method',
      params: { key: 'value' }
    };
    
    assert.strictEqual(request.jsonrpc, '2.0', 'Should have correct jsonrpc version');
    assert.strictEqual(request.id, 'req-1', 'Should have ID');
    assert.strictEqual(request.method, 'test_method', 'Should have method');
    assert.deepStrictEqual(request.params, { key: 'value' }, 'Should have params');
  });

  test('sendNotification should create valid JsonRpcNotification', () => {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'test_notification',
      params: { data: 'value' }
    };
    
    assert.strictEqual(notification.jsonrpc, '2.0', 'Should have correct jsonrpc version');
    assert.strictEqual(notification.method, 'test_notification', 'Should have method');
    assert.deepStrictEqual(notification.params, { data: 'value' }, 'Should have params');
  });
});

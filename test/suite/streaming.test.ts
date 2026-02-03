import * as assert from 'assert';
import {
  AcpClient,
  AcpMessage,
  ParsedResponse,
  ToolCall
} from '../../src/services/acpClient';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const setup: (fn: () => void) => void;
declare const teardown: (fn: () => void) => void;

suite('Message Streaming Test Suite', () => {
  let acpClient: AcpClient;

  setup(() => {
    acpClient = AcpClient.getInstance();

    // Reset singleton state for streaming tests
    acpClient['isConnected'] = true;
    acpClient['requestId'] = 0;
    acpClient['pendingRequests'].clear();
    acpClient['messageListeners'] = [];
    acpClient['responseListeners'] = [];
    acpClient['activeToolCalls'].clear();
    acpClient['currentResponseBuffer'] = '';
    acpClient['currentResponse'] = undefined;
    acpClient['abortController'] = undefined;
    acpClient['activeStreamMessageId'] = undefined;
    acpClient['sseReconnectAttempts'] = 0;

    if (acpClient['sseReconnectTimer']) {
      clearTimeout(acpClient['sseReconnectTimer']);
      acpClient['sseReconnectTimer'] = undefined;
    }
  });

  teardown(() => {
    acpClient.dispose();
  });

  // ==================== STREAMING START/END TESTS ====================

  test('streaming_start notification should set active stream message ID', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'streaming_start',
      params: { messageId: 'stream-123' }
    };

    acpClient['handleNotification'](notification);

    assert.strictEqual(acpClient['activeStreamMessageId'], 'stream-123', 'Should set active stream message ID');
    assert.ok(messages.some(m => m.type === 'streaming_start'), 'Should emit streaming_start message');
  });

  test('streaming_end notification should clear active stream and complete response', () => {
    // Setup active stream
    acpClient['activeStreamMessageId'] = 'stream-123';
    acpClient['currentResponseBuffer'] = 'Partial response content';
    acpClient['currentResponse'] = {
      messageId: 'stream-123',
      content: '',
      toolCalls: [],
      isComplete: false,
      timestamp: Date.now()
    };

    const responses: ParsedResponse[] = [];
    acpClient.onResponse((resp) => responses.push(resp));

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'streaming_end',
      params: { messageId: 'stream-123' }
    };

    acpClient['handleNotification'](notification);

    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Should clear active stream ID');
    assert.strictEqual(responses.length, 1, 'Should emit completed response');
    assert.strictEqual(responses[0].isComplete, true, 'Response should be marked complete');
    assert.strictEqual(responses[0].content, 'Partial response content', 'Should have accumulated content');
  });

  // ==================== MESSAGE DELTA TESTS ====================

  test('message_delta notification should append to response buffer', () => {
    acpClient['currentResponseBuffer'] = 'Hello';

    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: ' World', messageId: 'msg-1' }
    };

    acpClient['handleNotification'](notification);

    assert.strictEqual(acpClient['currentResponseBuffer'], 'Hello World', 'Should append delta to buffer');
    assert.ok(messages.some(m => m.type === 'text_delta' && m.delta === ' World'), 'Should emit text_delta message');
  });

  test('multiple message_delta notifications should accumulate content', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    const deltas = ['Hello', ' ', 'World', '!'];
    deltas.forEach(delta => {
      acpClient['handleNotification']({
        jsonrpc: '2.0' as const,
        method: 'message_delta',
        params: { delta, messageId: 'msg-1' }
      });
    });

    assert.strictEqual(acpClient['currentResponseBuffer'], 'Hello World!', 'Should accumulate all deltas');
    assert.strictEqual(messages.filter(m => m.type === 'text_delta').length, 4, 'Should emit 4 delta messages');
  });

  // ==================== STREAMING CANCELLATION TESTS ====================

  test('cancelStreaming should abort active stream and return partial response', () => {
    // Setup active stream
    acpClient['activeStreamMessageId'] = 'stream-456';
    acpClient['currentResponseBuffer'] = 'Partial content here';
    acpClient['abortController'] = new AbortController();

    const toolCall: ToolCall = {
      id: 'tc-1',
      tool: 'test_tool',
      params: {},
      status: 'running',
      startTime: Date.now()
    };
    acpClient['activeToolCalls'].set('tc-1', toolCall);

    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    const responses: ParsedResponse[] = [];
    acpClient.onResponse((resp) => responses.push(resp));

    const result = acpClient.cancelStreaming();

    assert.ok(result, 'Should return cancelled response');
    assert.strictEqual(result!.messageId, 'stream-456', 'Should have correct message ID');
    assert.strictEqual(result!.content, 'Partial content here', 'Should have partial content');
    assert.strictEqual(result!.isComplete, true, 'Should be marked complete');
    assert.strictEqual(result!.toolCalls.length, 1, 'Should include active tool calls');
    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Should clear active stream');
    assert.ok(messages.some(m => m.type === 'streaming_cancelled'), 'Should emit streaming_cancelled message');
    assert.strictEqual(responses.length, 1, 'Should emit response to listeners');
  });

  test('cancelStreaming should return undefined when no active stream', () => {
    acpClient['activeStreamMessageId'] = undefined;

    const result = acpClient.cancelStreaming();

    assert.strictEqual(result, undefined, 'Should return undefined when no active stream');
  });

  test('cancelStreaming should abort AbortController signal', () => {
    const controller = new AbortController();
    let aborted = false;
    controller.signal.addEventListener('abort', () => {
      aborted = true;
    });

    acpClient['activeStreamMessageId'] = 'stream-789';
    acpClient['abortController'] = controller;

    acpClient.cancelStreaming();

    assert.strictEqual(aborted, true, 'Should abort the controller');
    assert.strictEqual(acpClient['abortController'], undefined, 'Should clear abort controller');
  });

  // ==================== TOOL CALL DURING STREAMING TESTS ====================

  test('tool_call notification during streaming should be tracked', () => {
    acpClient['currentResponse'] = {
      messageId: 'stream-1',
      content: '',
      toolCalls: [],
      isComplete: false,
      timestamp: Date.now()
    };

    const toolCalls: ToolCall[] = [];
    acpClient.onToolCall((tc) => toolCalls.push(tc));

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'tool_call',
      params: {
        tool: 'read_file',
        id: 'tc-stream-1',
        params: { path: '/test.txt' }
      }
    };

    acpClient['handleNotification'](notification);

    assert.strictEqual(toolCalls.length, 1, 'Should receive tool call');
    assert.strictEqual(toolCalls[0].tool, 'read_file', 'Should have correct tool name');
    assert.strictEqual(toolCalls[0].status, 'running', 'Should be running status');
    assert.ok(acpClient['activeToolCalls'].has('tc-stream-1'), 'Should be in active tool calls map');

    // Should also be added to current response
    assert.strictEqual(acpClient['currentResponse']?.toolCalls?.length, 1, 'Should be in current response');
  });

  test('tool_result notification should complete tool call during streaming', () => {
    // Setup active tool call
    acpClient['activeToolCalls'].set('tc-stream-2', {
      id: 'tc-stream-2',
      tool: 'write_file',
      params: { path: '/test.txt', content: 'hello' },
      status: 'running',
      startTime: Date.now()
    });

    const toolCalls: ToolCall[] = [];
    acpClient.onToolCall((tc) => toolCalls.push(tc));

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'tool_result',
      params: {
        tool: 'write_file',
        id: 'tc-stream-2',
        result: { success: true }
      }
    };

    acpClient['handleNotification'](notification);

    const updatedToolCall = acpClient['activeToolCalls'].get('tc-stream-2');
    assert.strictEqual(updatedToolCall?.status, 'completed', 'Should be completed');
    assert.deepStrictEqual(updatedToolCall?.result, { success: true }, 'Should have result');
    assert.ok(updatedToolCall?.endTime, 'Should have end time');
  });

  // ==================== STREAMING STATE MANAGEMENT TESTS ====================

  test('sendMessage should initialize streaming state correctly', async () => {
    // Mock the connection and HTTP request
    acpClient['isConnected'] = true;

    const messageId = 'test-stream-msg';
    acpClient['generateRequestId'] = () => messageId;

    // We will not actually wait for the response since we are testing initialization
    // Just verify the state is set up correctly
    acpClient['currentResponse'] = {
      messageId,
      content: '',
      toolCalls: [],
      isComplete: false,
      timestamp: Date.now()
    };
    acpClient['currentResponseBuffer'] = '';
    acpClient['abortController'] = new AbortController();

    assert.strictEqual(acpClient['currentResponse']?.messageId, messageId, 'Should set message ID');
    assert.strictEqual(acpClient['currentResponse']?.isComplete, false, 'Should not be complete initially');
    assert.strictEqual(acpClient['currentResponseBuffer'], '', 'Should clear buffer');
    assert.ok(acpClient['abortController'], 'Should have abort controller');
  });

  test('createCancelledResponse should include all active tool calls', () => {
    acpClient['currentResponseBuffer'] = 'Cancelled mid-stream';

    // Add multiple active tool calls
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
      status: 'running',
      startTime: Date.now()
    };

    acpClient['activeToolCalls'].set('tc-1', toolCall1);
    acpClient['activeToolCalls'].set('tc-2', toolCall2);

    const result = acpClient['createCancelledResponse']('msg-cancel');

    assert.strictEqual(result.messageId, 'msg-cancel', 'Should have message ID');
    assert.strictEqual(result.content, 'Cancelled mid-stream', 'Should have buffer content');
    assert.strictEqual(result.toolCalls.length, 2, 'Should include all tool calls');
    assert.ok(result.toolCalls.some(tc => tc.id === 'tc-1'), 'Should include tc-1');
    assert.ok(result.toolCalls.some(tc => tc.id === 'tc-2'), 'Should include tc-2');
    assert.strictEqual(result.isComplete, true, 'Should be complete');
    assert.ok(result.timestamp, 'Should have timestamp');
  });

  // ==================== MESSAGE ACCUMULATION TESTS ====================

  test('message notification should append to buffer during streaming', () => {
    acpClient['currentResponseBuffer'] = '';

    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'message',
      params: { content: 'First chunk', messageId: 'msg-1' }
    };

    acpClient['handleNotification'](notification);

    assert.strictEqual(acpClient['currentResponseBuffer'], 'First chunk', 'Should append content');
    assert.ok(messages.some(m => m.type === 'text' && m.content === 'First chunk'), 'Should emit text message');
  });

  test('sequential messages should accumulate in buffer', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    ['Chunk 1', 'Chunk 2', 'Chunk 3'].forEach((content, i) => {
      acpClient['handleNotification']({
        jsonrpc: '2.0' as const,
        method: 'message',
        params: { content, messageId: `msg-${i}` }
      });
    });

    assert.strictEqual(acpClient['currentResponseBuffer'], 'Chunk 1Chunk 2Chunk 3', 'Should accumulate all chunks');
  });

  // ==================== ERROR HANDLING DURING STREAMING TESTS ====================

  test('streaming should handle missing messageId gracefully', () => {
    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    // streaming_start without messageId
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'streaming_start',
      params: {}
    });

    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Should not set stream ID without messageId');
  });

  test('streaming should handle missing delta gracefully', () => {
    acpClient['currentResponseBuffer'] = 'Existing';

    const messages: AcpMessage[] = [];
    acpClient.onMessage((msg) => messages.push(msg));

    // message_delta without delta
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { messageId: 'msg-1' }
    });

    assert.strictEqual(acpClient['currentResponseBuffer'], 'Existing', 'Should not change buffer without delta');
  });

  // ==================== STREAMING COMPLETION TESTS ====================

  test('complete streaming flow should work correctly', () => {
    const messages: AcpMessage[] = [];
    const responses: ParsedResponse[] = [];

    acpClient.onMessage((msg) => messages.push(msg));
    acpClient.onResponse((resp) => responses.push(resp));

    // Start streaming
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'streaming_start',
      params: { messageId: 'complete-stream' }
    });

    // Send chunks
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: 'Hello', messageId: 'complete-stream' }
    });

    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: ' ', messageId: 'complete-stream' }
    });

    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: 'World!', messageId: 'complete-stream' }
    });

    // Setup currentResponse for streaming_end to work
    acpClient['currentResponse'] = {
      messageId: 'complete-stream',
      content: '',
      toolCalls: [],
      isComplete: false,
      timestamp: Date.now()
    };

    // End streaming
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'streaming_end',
      params: { messageId: 'complete-stream' }
    });

    // Verify results
    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Should clear active stream');
    assert.strictEqual(acpClient['currentResponseBuffer'], 'Hello World!', 'Should have full content');
    assert.strictEqual(responses.length, 1, 'Should emit one response');
    assert.strictEqual(responses[0].content, 'Hello World!', 'Response should have full content');
    assert.strictEqual(responses[0].isComplete, true, 'Response should be complete');
  });

  test('streaming with tool calls should work end to end', () => {
    const messages: AcpMessage[] = [];
    const toolCalls: ToolCall[] = [];
    const responses: ParsedResponse[] = [];

    acpClient.onMessage((msg) => messages.push(msg));
    acpClient.onToolCall((tc) => toolCalls.push(tc));
    acpClient.onResponse((resp) => responses.push(resp));

    // Setup currentResponse
    acpClient['currentResponse'] = {
      messageId: 'tool-stream',
      content: '',
      toolCalls: [],
      isComplete: false,
      timestamp: Date.now()
    };

    // Start streaming
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'streaming_start',
      params: { messageId: 'tool-stream' }
    });

    // Send content
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: 'Let me check that file.', messageId: 'tool-stream' }
    });

    // Tool call
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'tool_call',
      params: { tool: 'read_file', id: 'tc-1', params: { path: '/test.txt' } }
    });

    // More content
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: ' Based on the file, here is the answer.', messageId: 'tool-stream' }
    });

    // Tool result
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'tool_result',
      params: { tool: 'read_file', id: 'tc-1', result: 'File contents here' }
    });

    // End streaming
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'streaming_end',
      params: { messageId: 'tool-stream' }
    });

    // Verify
    assert.strictEqual(toolCalls.length, 2, 'Should receive tool call and result updates');
    assert.strictEqual(acpClient['currentResponseBuffer'], 'Let me check that file. Based on the file, here is the answer.', 'Should have all content');
    assert.strictEqual(responses[0].toolCalls.length, 1, 'Should have tool call in response');
    assert.strictEqual(responses[0].toolCalls[0].status, 'completed', 'Tool call should be completed');
  });

  // ==================== EDGE CASES ====================

  test('streaming_end with mismatched messageId should not complete response', () => {
    acpClient['activeStreamMessageId'] = 'stream-a';
    acpClient['currentResponse'] = {
      messageId: 'stream-a',
      content: '',
      toolCalls: [],
      isComplete: false,
      timestamp: Date.now()
    };

    const responses: ParsedResponse[] = [];
    acpClient.onResponse((resp) => responses.push(resp));

    // End with different ID
    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'streaming_end',
      params: { messageId: 'stream-b' }
    });

    assert.strictEqual(responses.length, 0, 'Should not emit response for mismatched ID');
    assert.strictEqual(acpClient['activeStreamMessageId'], undefined, 'Should still clear active stream');
  });

  test('empty delta should not cause issues', () => {
    acpClient['currentResponseBuffer'] = 'Existing';

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: '', messageId: 'msg-1' }
    };

    acpClient['handleNotification'](notification);

    assert.strictEqual(acpClient['currentResponseBuffer'], 'Existing', 'Should not append empty delta');
  });

  test('null delta should not cause issues', () => {
    acpClient['currentResponseBuffer'] = 'Existing';

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: null, messageId: 'msg-1' }
    };

    acpClient['handleNotification'](notification);

    assert.strictEqual(acpClient['currentResponseBuffer'], 'Existing', 'Should handle null delta');
  });

  test('very long content should accumulate correctly', () => {
    const longContent = 'A'.repeat(10000);

    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message',
      params: { content: longContent, messageId: 'long-msg' }
    });

    assert.strictEqual(acpClient['currentResponseBuffer'].length, 10000, 'Should handle long content');
    assert.strictEqual(acpClient['currentResponseBuffer'], longContent, 'Content should match');
  });

  test('unicode content should stream correctly', () => {
    const unicodeContent = 'Hello World! ';

    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: unicodeContent, messageId: 'unicode-msg' }
    });

    assert.strictEqual(acpClient['currentResponseBuffer'], unicodeContent, 'Should handle unicode');
  });

  test('special characters in content should stream correctly', () => {
    const specialContent = 'Hello\nWorld\t! <script>alert("xss")</script>';

    acpClient['handleNotification']({
      jsonrpc: '2.0' as const,
      method: 'message_delta',
      params: { delta: specialContent, messageId: 'special-msg' }
    });

    assert.strictEqual(acpClient['currentResponseBuffer'], specialContent, 'Should handle special characters');
  });
});

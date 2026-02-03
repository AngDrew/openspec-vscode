import * as assert from 'assert';
import * as vscode from 'vscode';
import * as net from 'net';
import { ServerLifecycle, ServerStatus, ServerHealth, AutoStartConfig, CrashRecoveryConfig } from '../../src/services/serverLifecycle';
import { PortManager } from '../../src/services/portManager';

suite('ServerLifecycle Test Suite', () => {
  let serverLifecycle: ServerLifecycle;
  let portManager: PortManager;
  let mockContext: vscode.ExtensionContext;
  let mockServer: net.Server | undefined;

  setup(() => {
    serverLifecycle = ServerLifecycle.getInstance();
    portManager = PortManager.getInstance();
    
    // Create mock extension context
    const workspaceState = new Map<string, any>();
    mockContext = {
      workspaceState: {
        get: <T>(key: string): T | undefined => workspaceState.get(key),
        update: async (key: string, value: any): Promise<void> => {
          if (value === undefined) {
            workspaceState.delete(key);
          } else {
            workspaceState.set(key, value);
          }
        }
      }
    } as any;

    // Reset singleton state
    serverLifecycle['context'] = undefined;
    serverLifecycle['currentStatus'] = 'unknown';
    serverLifecycle['lastHealth'] = undefined;
    serverLifecycle['crashCount'] = 0;
    serverLifecycle['lastCrashTime'] = undefined;
    serverLifecycle['isAutoStarting'] = false;
    serverLifecycle['isAutoRestarting'] = false;
    
    portManager['context'] = undefined;
    portManager['selectedPort'] = undefined;
  });

  teardown(async () => {
    // Clean up
    serverLifecycle.stopHealthMonitoring();
    serverLifecycle.dispose();
    
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer!.close(() => resolve());
      });
      mockServer = undefined;
    }
    
    await portManager.clearSelectedPort();
  });

  test('getInstance should return singleton instance', () => {
    const instance1 = ServerLifecycle.getInstance();
    const instance2 = ServerLifecycle.getInstance();
    assert.strictEqual(instance1, instance2, 'Should return same instance');
  });

  test('initialize should set context', () => {
    serverLifecycle.initialize(mockContext);
    assert.strictEqual(serverLifecycle['context'], mockContext, 'Context should be set');
  });

  test('detectOpenCodeServer should return false when no port configured', async () => {
    serverLifecycle.initialize(mockContext);
    await portManager.clearSelectedPort();
    
    const result = await serverLifecycle.detectOpenCodeServer();
    
    assert.strictEqual(result, false, 'Should return false when no port configured');
    assert.strictEqual(serverLifecycle.getCurrentStatus(), 'stopped', 'Status should be stopped');
  });

  test('detectOpenCodeServer should return true for running server', async () => {
    serverLifecycle.initialize(mockContext);
    
    // Start a mock server
    mockServer = net.createServer();
    const testPort = await new Promise<number>((resolve) => {
      mockServer!.listen(0, '127.0.0.1', () => {
        const port = (mockServer!.address() as net.AddressInfo).port;
        resolve(port);
      });
    });
    
    await portManager.setSelectedPort(testPort);
    
    const result = await serverLifecycle.detectOpenCodeServer();
    
    assert.strictEqual(result, true, 'Should detect running server');
    assert.strictEqual(serverLifecycle.getCurrentStatus(), 'running', 'Status should be running');
  });

  test('detectOpenCodeServer should return false for stopped server', async () => {
    serverLifecycle.initialize(mockContext);
    
    // Use a port that's likely not in use
    await portManager.setSelectedPort(49999);
    
    const result = await serverLifecycle.detectOpenCodeServer();
    
    assert.strictEqual(result, false, 'Should return false for stopped server');
    assert.strictEqual(serverLifecycle.getCurrentStatus(), 'stopped', 'Status should be stopped');
  });

  test('getCurrentStatus should return current status', () => {
    const status = serverLifecycle.getCurrentStatus();
    assert.ok(['stopped', 'starting', 'running', 'crashed', 'unknown'].includes(status), 'Status should be valid');
  });

  test('isServerRunning should return true when status is running', async () => {
    serverLifecycle.initialize(mockContext);
    
    // Start a mock server
    mockServer = net.createServer();
    const testPort = await new Promise<number>((resolve) => {
      mockServer!.listen(0, '127.0.0.1', () => {
        const port = (mockServer!.address() as net.AddressInfo).port;
        resolve(port);
      });
    });
    
    await portManager.setSelectedPort(testPort);
    await serverLifecycle.detectOpenCodeServer();
    
    assert.strictEqual(serverLifecycle.isServerRunning(), true, 'Should return true when running');
  });

  test('isServerRunning should return false when not running', () => {
    serverLifecycle['currentStatus'] = 'stopped';
    assert.strictEqual(serverLifecycle.isServerRunning(), false, 'Should return false when stopped');
    
    serverLifecycle['currentStatus'] = 'starting';
    assert.strictEqual(serverLifecycle.isServerRunning(), false, 'Should return false when starting');
    
    serverLifecycle['currentStatus'] = 'crashed';
    assert.strictEqual(serverLifecycle.isServerRunning(), false, 'Should return false when crashed');
  });

  test('getLastHealth should return health info', async () => {
    serverLifecycle.initialize(mockContext);
    
    mockServer = net.createServer();
    const testPort = await new Promise<number>((resolve) => {
      mockServer!.listen(0, '127.0.0.1', () => {
        const port = (mockServer!.address() as net.AddressInfo).port;
        resolve(port);
      });
    });
    
    await portManager.setSelectedPort(testPort);
    await serverLifecycle.detectOpenCodeServer();
    
    const health = serverLifecycle.getLastHealth();
    
    assert.ok(health, 'Should return health info');
    assert.strictEqual(health!.status, 'running', 'Health status should be running');
    assert.strictEqual(health!.port, testPort, 'Health should include port');
    assert.ok(health!.lastCheck instanceof Date, 'Health should include last check timestamp');
  });

  test('onStatusChange should notify listeners', async () => {
    serverLifecycle.initialize(mockContext);
    const healthUpdates: ServerHealth[] = [];
    
    const disposable = serverLifecycle.onStatusChange((health) => {
      healthUpdates.push(health);
    });
    
    // Trigger status change
    mockServer = net.createServer();
    const testPort = await new Promise<number>((resolve) => {
      mockServer!.listen(0, '127.0.0.1', () => {
        const port = (mockServer!.address() as net.AddressInfo).port;
        resolve(port);
      });
    });
    
    await portManager.setSelectedPort(testPort);
    await serverLifecycle.detectOpenCodeServer();
    
    assert.ok(healthUpdates.length > 0, 'Listener should have been called');
    
    disposable.dispose();
  });

  test('startHealthMonitoring should begin periodic checks', async () => {
    serverLifecycle.initialize(mockContext);
    
    mockServer = net.createServer();
    const testPort = await new Promise<number>((resolve) => {
      mockServer!.listen(0, '127.0.0.1', () => {
        const port = (mockServer!.address() as net.AddressInfo).port;
        resolve(port);
      });
    });
    
    await portManager.setSelectedPort(testPort);
    
    serverLifecycle.startHealthMonitoring(100); // 100ms interval for testing
    
    // Wait for at least one health check
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const health = serverLifecycle.getLastHealth();
    assert.ok(health, 'Health should be updated after monitoring starts');
    
    serverLifecycle.stopHealthMonitoring();
  });

  test('stopHealthMonitoring should stop periodic checks', () => {
    serverLifecycle.startHealthMonitoring(100);
    assert.ok(serverLifecycle['healthCheckTimer'], 'Timer should exist');
    
    serverLifecycle.stopHealthMonitoring();
    assert.strictEqual(serverLifecycle['healthCheckTimer'], undefined, 'Timer should be cleared');
  });

  test('configureCrashRecovery should update config', () => {
    const newConfig: Partial<CrashRecoveryConfig> = {
      enabled: false,
      maxRestarts: 5,
      restartDelayMs: 10000
    };
    
    serverLifecycle.configureCrashRecovery(newConfig);
    
    const config = serverLifecycle.getCrashRecoveryConfig();
    assert.strictEqual(config.enabled, false, 'Enabled should be updated');
    assert.strictEqual(config.maxRestarts, 5, 'Max restarts should be updated');
    assert.strictEqual(config.restartDelayMs, 10000, 'Restart delay should be updated');
  });

  test('getCrashRecoveryConfig should return current config', () => {
    const config = serverLifecycle.getCrashRecoveryConfig();
    
    assert.ok(typeof config.enabled === 'boolean', 'Config should have enabled');
    assert.ok(typeof config.maxRestarts === 'number', 'Config should have maxRestarts');
    assert.ok(typeof config.restartDelayMs === 'number', 'Config should have restartDelayMs');
    assert.ok(typeof config.resetCrashCountAfterMs === 'number', 'Config should have resetCrashCountAfterMs');
  });

  test('resetCrashCount should reset crash count to zero', () => {
    serverLifecycle['crashCount'] = 5;
    serverLifecycle['lastCrashTime'] = new Date();
    
    serverLifecycle.resetCrashCount();
    
    assert.strictEqual(serverLifecycle['crashCount'], 0, 'Crash count should be reset');
    assert.strictEqual(serverLifecycle['lastCrashTime'], undefined, 'Last crash time should be reset');
  });

  test('dispose should clean up resources', () => {
    serverLifecycle.startHealthMonitoring(100);
    serverLifecycle['statusChangeListeners'] = [() => {}];
    
    serverLifecycle.dispose();
    
    assert.strictEqual(serverLifecycle['healthCheckTimer'], undefined, 'Timer should be cleared');
    assert.strictEqual(serverLifecycle['statusChangeListeners'].length, 0, 'Listeners should be cleared');
  });

  test('autoStartServer should return true if already running', async () => {
    serverLifecycle.initialize(mockContext);
    
    mockServer = net.createServer();
    const testPort = await new Promise<number>((resolve) => {
      mockServer!.listen(0, '127.0.0.1', () => {
        const port = (mockServer!.address() as net.AddressInfo).port;
        resolve(port);
      });
    });
    
    await portManager.setSelectedPort(testPort);
    await serverLifecycle.detectOpenCodeServer();
    
    const result = await serverLifecycle.autoStartServer();
    
    assert.strictEqual(result, true, 'Should return true when already running');
  });

  test('autoStartServer should return false when disabled', async () => {
    serverLifecycle.initialize(mockContext);
    
    const config: Partial<AutoStartConfig> = {
      enabled: false
    };
    
    const result = await serverLifecycle.autoStartServer(config);
    
    assert.strictEqual(result, false, 'Should return false when auto-start is disabled');
  });

  test('autoStartServer should prevent concurrent auto-start attempts', async () => {
    serverLifecycle.initialize(mockContext);
    serverLifecycle['isAutoStarting'] = true;
    
    const result = await serverLifecycle.autoStartServer();
    
    assert.strictEqual(result, false, 'Should return false when auto-start already in progress');
  });

  test('status should transition from unknown to stopped when server not found', async () => {
    serverLifecycle.initialize(mockContext);
    await portManager.setSelectedPort(49999); // Unlikely to be used
    
    assert.strictEqual(serverLifecycle.getCurrentStatus(), 'unknown', 'Initial status should be unknown');
    
    await serverLifecycle.detectOpenCodeServer();
    
    assert.strictEqual(serverLifecycle.getCurrentStatus(), 'stopped', 'Status should be stopped');
  });

  test('status should transition to running when server detected', async () => {
    serverLifecycle.initialize(mockContext);
    
    mockServer = net.createServer();
    const testPort = await new Promise<number>((resolve) => {
      mockServer!.listen(0, '127.0.0.1', () => {
        const port = (mockServer!.address() as net.AddressInfo).port;
        resolve(port);
      });
    });
    
    await portManager.setSelectedPort(testPort);
    await serverLifecycle.detectOpenCodeServer();
    
    assert.strictEqual(serverLifecycle.getCurrentStatus(), 'running', 'Status should be running');
  });
});

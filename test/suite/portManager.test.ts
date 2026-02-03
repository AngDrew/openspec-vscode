import * as assert from 'assert';
import * as net from 'net';
import * as vscode from 'vscode';
import { PortManager, PortConflictResolution } from '../../src/services/portManager';
import { ErrorHandler } from '../../src/utils/errorHandler';

suite('PortManager Test Suite', () => {
  let portManager: PortManager;
  let mockContext: vscode.ExtensionContext;

  setup(() => {
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
    portManager['context'] = undefined;
    portManager['selectedPort'] = undefined;
  });

  teardown(async () => {
    // Clean up any selected port
    await portManager.clearSelectedPort();
  });

  test('getInstance should return singleton instance', () => {
    const instance1 = PortManager.getInstance();
    const instance2 = PortManager.getInstance();
    assert.strictEqual(instance1, instance2, 'Should return same instance');
  });

  test('initialize should restore stored port from workspace state', () => {
    const testPort = 4500;
    mockContext.workspaceState.update('openspec.selectedPort', testPort);
    
    portManager.initialize(mockContext);
    
    assert.strictEqual(portManager.getSelectedPort(), testPort, 'Should restore stored port');
  });

  test('initialize should handle no stored port', () => {
    portManager.initialize(mockContext);
    
    assert.strictEqual(portManager.getSelectedPort(), undefined, 'Should have no port when none stored');
  });

  test('findAvailablePort should return a port in range 4000-4999', async () => {
    portManager.initialize(mockContext);
    
    const port = await portManager.findAvailablePort();
    
    assert.ok(port, 'Should find an available port');
    assert.ok(port! >= 4000 && port! <= 4999, 'Port should be in range 4000-4999');
  });

  test('findAvailablePort should store selected port', async () => {
    portManager.initialize(mockContext);
    
    const port = await portManager.findAvailablePort();
    
    assert.strictEqual(portManager.getSelectedPort(), port, 'Selected port should be stored');
    const storedPort = mockContext.workspaceState.get<number>('openspec.selectedPort');
    assert.strictEqual(storedPort, port, 'Port should be stored in workspace state');
  });

  test('isPortAvailable should return true for available port', async () => {
    // Find an available port first
    const availablePort = await findAvailablePortInRange();
    
    const isAvailable = await portManager.isPortAvailable(availablePort);
    
    assert.strictEqual(isAvailable, true, 'Available port should return true');
  });

  test('isPortAvailable should return false for occupied port', async () => {
    // Create a server to occupy a port
    const server = net.createServer();
    const occupiedPort = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port;
        resolve(port);
      });
    });

    try {
      const isAvailable = await portManager.isPortAvailable(occupiedPort);
      assert.strictEqual(isAvailable, false, 'Occupied port should return false');
    } finally {
      server.close();
    }
  });

  test('scanPortRange should return array of available ports', async () => {
    const availablePorts = await portManager.scanPortRange();
    
    assert.ok(Array.isArray(availablePorts), 'Should return an array');
    assert.ok(availablePorts.length > 0, 'Should find at least one available port');
    
    // All ports should be in range
    availablePorts.forEach(port => {
      assert.ok(port >= 4000 && port <= 4999, `Port ${port} should be in range`);
    });
  });

  test('scanPortRange should call onPortChecked callback', async () => {
    const checkedPorts: Array<{ port: number; available: boolean }> = [];
    
    await portManager.scanPortRange((port, available) => {
      checkedPorts.push({ port, available });
    });
    
    assert.strictEqual(checkedPorts.length, 1000, 'Should check all 1000 ports in range');
    assert.ok(checkedPorts.some(p => p.available), 'Should find some available ports');
  });

  test('setSelectedPort should update and store port', async () => {
    portManager.initialize(mockContext);
    const testPort = 4500;
    
    await portManager.setSelectedPort(testPort);
    
    assert.strictEqual(portManager.getSelectedPort(), testPort, 'Selected port should be updated');
    const storedPort = mockContext.workspaceState.get<number>('openspec.selectedPort');
    assert.strictEqual(storedPort, testPort, 'Port should be stored');
  });

  test('clearSelectedPort should remove stored port', async () => {
    portManager.initialize(mockContext);
    await portManager.setSelectedPort(4500);
    
    await portManager.clearSelectedPort();
    
    assert.strictEqual(portManager.getSelectedPort(), undefined, 'Selected port should be cleared');
    const storedPort = mockContext.workspaceState.get<number>('openspec.selectedPort');
    assert.strictEqual(storedPort, undefined, 'Stored port should be cleared');
  });

  test('getPortRange should return correct range', () => {
    const range = portManager.getPortRange();
    
    assert.strictEqual(range.min, 4000, 'Min should be 4000');
    assert.strictEqual(range.max, 4999, 'Max should be 4999');
  });

  test('checkAndResolvePortConflict should return reuse when no port selected', async () => {
    portManager.initialize(mockContext);
    
    const result = await portManager.checkAndResolvePortConflict();
    
    assert.strictEqual(result.resolved, true, 'Should be resolved');
    assert.strictEqual(result.action, 'reuse', 'Action should be reuse');
  });

  test('checkAndResolvePortConflict should return reuse for available port', async () => {
    portManager.initialize(mockContext);
    const availablePort = await findAvailablePortInRange();
    await portManager.setSelectedPort(availablePort);
    
    const result = await portManager.checkAndResolvePortConflict();
    
    assert.strictEqual(result.resolved, true, 'Should be resolved');
    assert.strictEqual(result.action, 'reuse', 'Should reuse available port');
    assert.strictEqual(result.port, availablePort, 'Should return the same port');
  });

  test('clearConflictCheck should remove conflict flag', async () => {
    portManager.initialize(mockContext);
    await mockContext.workspaceState.update('openspec.portConflictChecked', true);
    
    portManager.clearConflictCheck();
    
    const flag = mockContext.workspaceState.get<boolean>('openspec.portConflictChecked');
    assert.strictEqual(flag, undefined, 'Conflict check flag should be cleared');
  });

  test('forcePortRelease should return true for available port', async () => {
    const availablePort = await findAvailablePortInRange();
    
    const result = await portManager.forcePortRelease(availablePort);
    
    assert.strictEqual(result, true, 'Should return true for available port');
  });

  test('forcePortRelease should return false for occupied port', async () => {
    const server = net.createServer();
    const occupiedPort = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port;
        resolve(port);
      });
    });

    try {
      const result = await portManager.forcePortRelease(occupiedPort);
      assert.strictEqual(result, false, 'Should return false for occupied port');
    } finally {
      server.close();
    }
  });

  test('validatePortForWorkspace should return true for available port', async () => {
    portManager.initialize(mockContext);
    const availablePort = await findAvailablePortInRange();
    await portManager.setSelectedPort(availablePort);
    
    const result = await portManager.validatePortForWorkspace(availablePort);
    
    assert.strictEqual(result, true, 'Should return true for available port');
  });
});

// Helper function to find an available port
async function findAvailablePortInRange(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

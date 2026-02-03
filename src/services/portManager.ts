import * as net from 'net';
import * as vscode from 'vscode';
import { ErrorHandler } from '../utils/errorHandler';

export interface PortConflictResolution {
  resolved: boolean;
  port?: number;
  action: 'reuse' | 'new' | 'cancel';
}

export class PortManager {
  private static readonly PORT_RANGE = { min: 4000, max: 4999 };
  private static readonly DEFAULT_TIMEOUT = 350;
  private static readonly STORAGE_KEY = 'openspec.selectedPort';
  private static readonly CONFLICT_CHECK_KEY = 'openspec.portConflictChecked';
  private static instance: PortManager;
  private selectedPort: number | undefined;
  private context: vscode.ExtensionContext | undefined;

  private constructor() {}

  static getInstance(): PortManager {
    if (!PortManager.instance) {
      PortManager.instance = new PortManager();
    }
    return PortManager.instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    const storedPort = this.getStoredPort();
    if (storedPort !== undefined) {
      this.selectedPort = storedPort;
      ErrorHandler.debug(`Restored port from workspace state: ${storedPort}`);
    }
  }

  async checkAndResolvePortConflict(): Promise<PortConflictResolution> {
    if (!this.selectedPort) {
      return { resolved: true, action: 'reuse' };
    }

    const isAvailable = await this.isPortAvailable(this.selectedPort);
    
    if (isAvailable) {
      ErrorHandler.debug(`Port ${this.selectedPort} is available, no conflict`);
      return { resolved: true, port: this.selectedPort, action: 'reuse' };
    }

    ErrorHandler.warning(
      `Port ${this.selectedPort} is already in use by another process`,
      false
    );

    const conflictChecked = this.context?.workspaceState.get<boolean>(
      PortManager.CONFLICT_CHECK_KEY
    );

    if (conflictChecked) {
      ErrorHandler.debug('Port conflict was already checked this session, finding new port');
      const newPort = await this.findAvailablePort();
      if (newPort) {
        ErrorHandler.info(`Automatically switched to new port: ${newPort}`);
        return { resolved: true, port: newPort, action: 'new' };
      }
      return { resolved: false, action: 'cancel' };
    }

    const message = `Port ${this.selectedPort} is already in use. Another OpenCode instance or application may be using it.`;
    const findNewPort = 'Find New Port';
    const reuseAnyway = 'Reuse Anyway';
    const cancel = 'Cancel';

    const selection = await vscode.window.showWarningMessage(
      message,
      { modal: false },
      findNewPort,
      reuseAnyway,
      cancel
    );

    await this.context?.workspaceState.update(PortManager.CONFLICT_CHECK_KEY, true);

    switch (selection) {
      case findNewPort: {
        const newPort = await this.findAvailablePort();
        if (newPort) {
          ErrorHandler.info(`Switched to new port: ${newPort}`);
          return { resolved: true, port: newPort, action: 'new' };
        }
        ErrorHandler.handle(
          new Error('Failed to find an available port'),
          'PortManager.checkAndResolvePortConflict',
          true
        );
        return { resolved: false, action: 'cancel' };
      }
      
      case reuseAnyway:
        ErrorHandler.warning(`Reusing port ${this.selectedPort} despite conflict - this may cause issues`);
        return { resolved: true, port: this.selectedPort, action: 'reuse' };
      
      case cancel:
      default:
        ErrorHandler.debug('User cancelled port conflict resolution');
        return { resolved: false, action: 'cancel' };
    }
  }

  async forcePortRelease(port: number): Promise<boolean> {
    try {
      ErrorHandler.debug(`Attempting to force release port ${port}`);
      
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        ErrorHandler.debug(`Port ${port} is already available`);
        return true;
      }

      ErrorHandler.warning(
        `Port ${port} is occupied by another process. ` +
        'Please close the other application manually.',
        true
      );
      
      return false;
    } catch (error) {
      ErrorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        'PortManager.forcePortRelease',
        false
      );
      return false;
    }
  }

  clearConflictCheck(): void {
    this.context?.workspaceState.update(PortManager.CONFLICT_CHECK_KEY, undefined);
    ErrorHandler.debug('Cleared port conflict check flag');
  }

  private getStoredPort(): number | undefined {
    if (!this.context) {
      return undefined;
    }
    const stored = this.context.workspaceState.get<number>(PortManager.STORAGE_KEY);
    return stored;
  }

  private async storePort(port: number | undefined): Promise<void> {
    if (!this.context) {
      ErrorHandler.debug('Cannot store port: ExtensionContext not initialized');
      return;
    }
    if (port === undefined) {
      await this.context.workspaceState.update(PortManager.STORAGE_KEY, undefined);
      ErrorHandler.debug('Cleared stored port from workspace state');
    } else {
      await this.context.workspaceState.update(PortManager.STORAGE_KEY, port);
      ErrorHandler.debug(`Stored port ${port} in workspace state`);
    }
  }

  async findAvailablePort(): Promise<number | undefined> {
    const { min, max } = PortManager.PORT_RANGE;
    
    for (let port = min; port <= max; port++) {
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        this.selectedPort = port;
        await this.storePort(port);
        ErrorHandler.debug(`Found available port: ${port}`);
        return port;
      }
    }

    ErrorHandler.handle(
      new Error(`No available ports found in range ${min}-${max}`),
      'PortManager.findAvailablePort',
      true
    );
    return undefined;
  }

  async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          ErrorHandler.debug(`Port check error for ${port}: ${err.message}`);
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close(() => {
          resolve(true);
        });
      });

      server.listen(port, '127.0.0.1');
    });
  }

  async scanPortRange(
    onPortChecked?: (port: number, available: boolean) => void
  ): Promise<number[]> {
    const { min, max } = PortManager.PORT_RANGE;
    const availablePorts: number[] = [];

    for (let port = min; port <= max; port++) {
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        availablePorts.push(port);
      }
      
      if (onPortChecked) {
        onPortChecked(port, isAvailable);
      }
    }

    ErrorHandler.debug(`Scanned ports ${min}-${max}, found ${availablePorts.length} available`);
    return availablePorts;
  }

  getSelectedPort(): number | undefined {
    return this.selectedPort;
  }

  async setSelectedPort(port: number): Promise<void> {
    this.selectedPort = port;
    await this.storePort(port);
  }

  async clearSelectedPort(): Promise<void> {
    this.selectedPort = undefined;
    await this.storePort(undefined);
    this.clearConflictCheck();
  }

  getPortRange(): { min: number; max: number } {
    return { ...PortManager.PORT_RANGE };
  }

  async validatePortForWorkspace(port: number): Promise<boolean> {
    const isAvailable = await this.isPortAvailable(port);
    
    if (!isAvailable) {
      const resolution = await this.checkAndResolvePortConflict();
      return resolution.resolved;
    }
    
    return true;
  }
}

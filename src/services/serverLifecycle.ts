import * as vscode from 'vscode';
import * as net from 'net';
import { ErrorHandler } from '../utils/errorHandler';
import { PortManager } from './portManager';

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'crashed' | 'unknown';

export interface ServerHealth {
  status: ServerStatus;
  port: number | undefined;
  lastCheck: Date;
  error?: string;
}

export interface AutoStartConfig {
  enabled: boolean;
  command: string;
  args: string[];
  terminalName: string;
  startupDelayMs: number;
}

export interface CrashRecoveryConfig {
  enabled: boolean;
  maxRestarts: number;
  restartDelayMs: number;
  resetCrashCountAfterMs: number;
}

export class ServerLifecycle {
  private static readonly HEALTH_CHECK_INTERVAL = 5000;
  private static readonly DEFAULT_OPCODE_PORT = 4099;
  private static readonly DEFAULT_AUTO_START_DELAY = 3000;
  private static readonly DEFAULT_MAX_RESTARTS = 3;
  private static readonly DEFAULT_RESTART_DELAY = 5000;
  private static readonly DEFAULT_CRASH_RESET_TIME = 60000;
  private static instance: ServerLifecycle;
  private portManager: PortManager;
  private currentStatus: ServerStatus = 'unknown';
  private healthCheckTimer: NodeJS.Timeout | undefined;
  private lastHealth: ServerHealth | undefined;
  private context: vscode.ExtensionContext | undefined;
  private statusChangeListeners: Array<(health: ServerHealth) => void> = [];
  private autoStartTerminal: vscode.Terminal | undefined;
  private crashCount = 0;
  private lastCrashTime: Date | undefined;
  private isAutoStarting = false;
  private isAutoRestarting = false;
  private crashRecoveryConfig: CrashRecoveryConfig;

  private constructor() {
    this.portManager = PortManager.getInstance();
    this.crashRecoveryConfig = {
      enabled: true,
      maxRestarts: ServerLifecycle.DEFAULT_MAX_RESTARTS,
      restartDelayMs: ServerLifecycle.DEFAULT_RESTART_DELAY,
      resetCrashCountAfterMs: ServerLifecycle.DEFAULT_CRASH_RESET_TIME
    };
  }

  static getInstance(): ServerLifecycle {
    if (!ServerLifecycle.instance) {
      ServerLifecycle.instance = new ServerLifecycle();
    }
    return ServerLifecycle.instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    ErrorHandler.debug('ServerLifecycle initialized');
  }

  async detectOpenCodeServer(): Promise<boolean> {
    const port = this.getServerPort();
    
    if (!port) {
      ErrorHandler.debug('No port configured for OpenCode server detection');
      return false;
    }

    try {
      const isRunning = await this.checkServerHealth(port);
      
      if (isRunning) {
        this.currentStatus = 'running';
        ErrorHandler.debug(`OpenCode server detected on port ${port}`);
      } else {
        this.currentStatus = 'stopped';
        ErrorHandler.debug(`OpenCode server not detected on port ${port}`);
      }
      
      this.updateHealth();
      return isRunning;
    } catch (error) {
      this.currentStatus = 'unknown';
      ErrorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        'ServerLifecycle.detectOpenCodeServer',
        false
      );
      this.updateHealth();
      return false;
    }
  }

  private async checkServerHealth(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 1000;

      socket.setTimeout(timeout);

      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });

      try {
        socket.connect(port, '127.0.0.1');
      } catch {
        resolve(false);
      }
    });
  }

  private getServerPort(): number | undefined {
    const configuredPort = this.portManager.getSelectedPort();
    if (configuredPort) {
      return configuredPort;
    }
    return ServerLifecycle.DEFAULT_OPCODE_PORT;
  }

  private updateHealth(): void {
    this.lastHealth = {
      status: this.currentStatus,
      port: this.getServerPort(),
      lastCheck: new Date()
    };

    this.notifyStatusChangeListeners();
  }

  private notifyStatusChangeListeners(): void {
    if (this.lastHealth) {
      this.statusChangeListeners.forEach(listener => {
        try {
          listener(this.lastHealth!);
        } catch (error) {
          ErrorHandler.debug(`Error in status change listener: ${error}`);
        }
      });
    }
  }

  onStatusChange(listener: (health: ServerHealth) => void): vscode.Disposable {
    this.statusChangeListeners.push(listener);
    
    return new vscode.Disposable(() => {
      const index = this.statusChangeListeners.indexOf(listener);
      if (index > -1) {
        this.statusChangeListeners.splice(index, 1);
      }
    });
  }

  getCurrentStatus(): ServerStatus {
    return this.currentStatus;
  }

  getLastHealth(): ServerHealth | undefined {
    return this.lastHealth;
  }

  isServerRunning(): boolean {
    return this.currentStatus === 'running';
  }

  dispose(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    this.statusChangeListeners = [];
    if (this.autoStartTerminal) {
      this.autoStartTerminal.dispose();
      this.autoStartTerminal = undefined;
    }
  }

  async autoStartServer(config?: Partial<AutoStartConfig>): Promise<boolean> {
    if (this.isAutoStarting) {
      ErrorHandler.debug('Auto-start already in progress');
      return false;
    }

    if (this.currentStatus === 'running') {
      ErrorHandler.debug('Server already running, skipping auto-start');
      return true;
    }

    const autoConfig: AutoStartConfig = {
      enabled: true,
      command: 'opencode',
      args: ['serve', '--port', String(this.getServerPort() || ServerLifecycle.DEFAULT_OPCODE_PORT), '--print-logs'],
      terminalName: 'OpenCode Server (Auto)',
      startupDelayMs: ServerLifecycle.DEFAULT_AUTO_START_DELAY,
      ...config
    };

    if (!autoConfig.enabled) {
      ErrorHandler.debug('Auto-start is disabled');
      return false;
    }

    this.isAutoStarting = true;

    try {
      ErrorHandler.debug(`Auto-starting OpenCode server on port ${this.getServerPort()}...`);
      this.currentStatus = 'starting';
      this.updateHealth();

      const existingTerminal = vscode.window.terminals.find(t => t.name === autoConfig.terminalName);
      if (existingTerminal) {
        existingTerminal.dispose();
      }

      this.autoStartTerminal = vscode.window.createTerminal({
        name: autoConfig.terminalName
      });

      const command = `${autoConfig.command} ${autoConfig.args.join(' ')}`;
      this.autoStartTerminal.sendText(command, true);
      this.autoStartTerminal.show(true);

      ErrorHandler.debug(`Waiting ${autoConfig.startupDelayMs}ms for server to start...`);
      await this.delay(autoConfig.startupDelayMs);

      const isRunning = await this.detectOpenCodeServer();

      if (isRunning) {
        ErrorHandler.debug('Auto-start successful');
        this.crashCount = 0;
        this.lastCrashTime = undefined;
        return true;
      } else {
        ErrorHandler.debug('Auto-start failed - server not responding');
        this.currentStatus = 'crashed';
        this.updateHealth();
        return false;
      }
    } catch (error) {
      ErrorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        'ServerLifecycle.autoStartServer',
        false
      );
      this.currentStatus = 'crashed';
      this.updateHealth();
      return false;
    } finally {
      this.isAutoStarting = false;
    }
  }

  startHealthMonitoring(intervalMs?: number): void {
    if (this.healthCheckTimer) {
      ErrorHandler.debug('Health monitoring already active');
      return;
    }

    const interval = intervalMs || ServerLifecycle.HEALTH_CHECK_INTERVAL;
    ErrorHandler.debug(`Starting health monitoring (interval: ${interval}ms)`);

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, interval);

    this.performHealthCheck();
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      ErrorHandler.debug('Health monitoring stopped');
    }
  }

  private async performHealthCheck(): Promise<void> {
    const port = this.getServerPort();

    if (!port) {
      ErrorHandler.debug('No port configured for health check');
      return;
    }

    try {
      const wasRunning = this.currentStatus === 'running';
      const isRunning = await this.checkServerHealth(port);

      if (isRunning) {
        if (this.currentStatus !== 'running') {
          ErrorHandler.debug(`Server is now running on port ${port}`);
          this.currentStatus = 'running';
          this.crashCount = 0;
        }
      } else {
        if (wasRunning) {
          ErrorHandler.debug(`Server crashed (was running on port ${port})`);
          this.currentStatus = 'crashed';
          this.recordCrash();
        } else if (this.currentStatus !== 'stopped' && this.currentStatus !== 'crashed') {
          this.currentStatus = 'stopped';
        }
      }

      this.updateHealth();
    } catch (error) {
      ErrorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        'ServerLifecycle.performHealthCheck',
        false
      );
    }
  }

  private recordCrash(): void {
    this.crashCount++;
    this.lastCrashTime = new Date();
    ErrorHandler.debug(`Server crash recorded (count: ${this.crashCount})`);

    if (this.crashRecoveryConfig.enabled && this.shouldAttemptRestart()) {
      this.attemptAutoRestart();
    }
  }

  private shouldAttemptRestart(): boolean {
    if (this.crashCount > this.crashRecoveryConfig.maxRestarts) {
      ErrorHandler.debug(`Max restarts (${this.crashRecoveryConfig.maxRestarts}) exceeded, not restarting`);
      return false;
    }

    const timeSinceLastCrash = this.lastCrashTime
      ? Date.now() - this.lastCrashTime.getTime()
      : Infinity;

    if (timeSinceLastCrash > this.crashRecoveryConfig.resetCrashCountAfterMs) {
      ErrorHandler.debug('Crash count reset - time window exceeded');
      this.crashCount = 1;
      return true;
    }

    return true;
  }

  private async attemptAutoRestart(): Promise<void> {
    if (this.isAutoRestarting) {
      ErrorHandler.debug('Auto-restart already in progress');
      return;
    }

    this.isAutoRestarting = true;

    try {
      ErrorHandler.debug(`Attempting auto-restart ${this.crashCount}/${this.crashRecoveryConfig.maxRestarts}...`);
      this.currentStatus = 'starting';
      this.updateHealth();

      await this.delay(this.crashRecoveryConfig.restartDelayMs);

      const success = await this.autoStartServer();

      if (success) {
        ErrorHandler.debug('Auto-restart successful');
        this.crashCount = 0;
        this.lastCrashTime = undefined;
      } else {
        ErrorHandler.debug('Auto-restart failed');
        if (this.crashCount >= this.crashRecoveryConfig.maxRestarts) {
          this.currentStatus = 'crashed';
          this.updateHealth();
          ErrorHandler.handle(
            new Error(`Server crashed ${this.crashCount} times. Auto-restart limit exceeded.`),
            'ServerLifecycle.attemptAutoRestart',
            true
          );
        }
      }
    } catch (error) {
      ErrorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        'ServerLifecycle.attemptAutoRestart',
        false
      );
    } finally {
      this.isAutoRestarting = false;
    }
  }

  configureCrashRecovery(config: Partial<CrashRecoveryConfig>): void {
    this.crashRecoveryConfig = {
      ...this.crashRecoveryConfig,
      ...config
    };
    ErrorHandler.debug(`Crash recovery config updated: ${JSON.stringify(this.crashRecoveryConfig)}`);
  }

  getCrashRecoveryConfig(): CrashRecoveryConfig {
    return { ...this.crashRecoveryConfig };
  }

  resetCrashCount(): void {
    this.crashCount = 0;
    this.lastCrashTime = undefined;
    ErrorHandler.debug('Crash count reset manually');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

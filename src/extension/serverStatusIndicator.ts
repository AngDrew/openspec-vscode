import * as vscode from 'vscode';
import { ServerLifecycle, ServerHealth, ServerStatus } from '../services/serverLifecycle';
import { ErrorHandler } from '../utils/errorHandler';

export class ServerStatusIndicator {
  private statusBarItem: vscode.StatusBarItem;
  private serverLifecycle: ServerLifecycle;
  private statusChangeDisposable: vscode.Disposable | undefined;

  constructor() {
    this.serverLifecycle = ServerLifecycle.getInstance();
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'openspec.showServerStatus';
    this.updateStatusDisplay(this.serverLifecycle.getLastHealth());
  }

  initialize(): void {
    this.statusChangeDisposable = this.serverLifecycle.onStatusChange(
      (health: ServerHealth) => {
        this.updateStatusDisplay(health);
      }
    );

    this.statusBarItem.show();
    ErrorHandler.debug('ServerStatusIndicator initialized');
  }

  private updateStatusDisplay(health: ServerHealth | undefined): void {
    const status = health?.status || 'unknown';
    const { icon, text, tooltip } = this.getStatusDisplay(status, health);

    this.statusBarItem.text = `${icon} ${text}`;
    this.statusBarItem.tooltip = tooltip;

    switch (status) {
      case 'running':
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'starting':
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'crashed':
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      case 'stopped':
        this.statusBarItem.backgroundColor = undefined;
        break;
      default:
        this.statusBarItem.backgroundColor = undefined;
    }
  }

  private getStatusDisplay(
    status: ServerStatus,
    health: ServerHealth | undefined
  ): { icon: string; text: string; tooltip: string } {
    const port = health?.port;

    switch (status) {
      case 'running':
        return {
          icon: '$(check)',
          text: 'OpenCode',
          tooltip: `OpenCode server is running${port ? ` on port ${port}` : ''}. Click for options.`
        };
      case 'starting':
        return {
          icon: '$(sync~spin)',
          text: 'OpenCode',
          tooltip: 'OpenCode server is starting...'
        };
      case 'crashed':
        return {
          icon: '$(error)',
          text: 'OpenCode',
          tooltip: `OpenCode server has crashed${port ? ` (port ${port})` : ''}. Click to restart.`
        };
      case 'stopped':
        return {
          icon: '$(circle-outline)',
          text: 'OpenCode',
          tooltip: 'OpenCode server is stopped. Click to start.'
        };
      default:
        return {
          icon: '$(question)',
          text: 'OpenCode',
          tooltip: 'OpenCode server status unknown. Click to check.'
        };
    }
  }

  show(): void {
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  dispose(): void {
    if (this.statusChangeDisposable) {
      this.statusChangeDisposable.dispose();
    }
    this.statusBarItem.dispose();
  }
}

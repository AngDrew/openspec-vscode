import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export interface ErrorLogEntry {
  timestamp: number;
  level: LogLevel;
  context: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export class ErrorHandler {
  private static outputChannel: vscode.OutputChannel;
  private static logBuffer: ErrorLogEntry[] = [];
  private static readonly MAX_BUFFER_SIZE = 1000;
  private static debugEnabled = false;
  private static structuredLoggingEnabled = true;

  static initialize(): void {
    this.outputChannel = vscode.window.createOutputChannel('OpenSpec Extension');
    this.loadConfiguration();
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('openspec.debug')) {
        this.loadConfiguration();
      }
    });
  }

  private static loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('openspec');
    this.debugEnabled = config.get('debug.enabled', false);
    this.structuredLoggingEnabled = config.get('debug.structuredLogging', true);
  }

  static handle(error: Error, context: string, showMessage: boolean = true, metadata?: Record<string, unknown>): void {
    const message = `[${context}] ${error.message}`;
    const fullError = `${message}\n${error.stack}`;
    
    // Log to output channel
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.appendLine(fullError);
    
    // Store in buffer for export
    this.addToBuffer({
      timestamp: Date.now(),
      level: 'error',
      context,
      message: error.message,
      stack: error.stack,
      metadata
    });
    
    // Show to user if requested
    if (showMessage) {
      const showOutput = 'Show Output';
      const copyError = 'Copy Error';
      vscode.window.showErrorMessage(`OpenSpec Extension Error: ${message}`, showOutput, copyError)
        .then(selection => {
          if (selection === showOutput) {
            this.outputChannel.show();
          } else if (selection === copyError) {
            vscode.env.clipboard.writeText(fullError);
            vscode.window.showInformationMessage('Error copied to clipboard');
          }
        });
    }
    
    // Also log to console for debugging
    console.error(fullError);
  }

  static info(message: string, showNotification: boolean = false, context?: string): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.appendLine(`[INFO] ${message}`);
    
    this.addToBuffer({
      timestamp: Date.now(),
      level: 'info',
      context: context || 'general',
      message
    });
    
    if (showNotification) {
      vscode.window.showInformationMessage(message);
    }
  }

  static warning(message: string, showNotification: boolean = true, context?: string): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.appendLine(`[WARNING] ${message}`);
    
    this.addToBuffer({
      timestamp: Date.now(),
      level: 'warning',
      context: context || 'general',
      message
    });
    
    if (showNotification) {
      vscode.window.showWarningMessage(message);
    }
  }

  static debug(message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    
    // Only log debug messages if debug mode is enabled
    if (this.debugEnabled) {
      const contextStr = context ? `[${context}] ` : '';
      this.outputChannel.appendLine(`[DEBUG] ${contextStr}${message}`);
      
      if (metadata) {
        this.outputChannel.appendLine(`[DEBUG] Metadata: ${JSON.stringify(metadata, null, 2)}`);
      }
    }
    
    // Always store in buffer for troubleshooting
    this.addToBuffer({
      timestamp: Date.now(),
      level: 'debug',
      context: context || 'debug',
      message,
      metadata
    });
  }

  private static addToBuffer(entry: ErrorLogEntry): void {
    this.logBuffer.push(entry);
    
    // Keep buffer size limited
    if (this.logBuffer.length > this.MAX_BUFFER_SIZE) {
      this.logBuffer = this.logBuffer.slice(-this.MAX_BUFFER_SIZE);
    }
  }

  static showOutputChannel(): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.show();
  }

  static getLogBuffer(): ErrorLogEntry[] {
    return [...this.logBuffer];
  }

  static clearLogBuffer(): void {
    this.logBuffer = [];
  }

  static async exportLogs(): Promise<void> {
    if (this.logBuffer.length === 0) {
      vscode.window.showInformationMessage('No logs to export');
      return;
    }

    try {
      const logs = this.formatLogsForExport();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultUri = vscode.Uri.file(`openspec-logs-${timestamp}.json`);
      
      const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          'JSON Files': ['json'],
          'Text Files': ['txt'],
          'All Files': ['*']
        },
        title: 'Export OpenSpec Logs'
      });

      if (uri) {
        const encoder = new TextEncoder();
        const data = encoder.encode(logs);
        await vscode.workspace.fs.writeFile(uri, data);
        
        const openFile = 'Open File';
        const result = await vscode.window.showInformationMessage(
          `Logs exported to ${uri.fsPath}`,
          openFile
        );
        
        if (result === openFile) {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        }
      }
    } catch (error) {
      this.handle(
        error instanceof Error ? error : new Error(String(error)),
        'exporting logs',
        true
      );
    }
  }

  private static formatLogsForExport(): string {
    if (this.structuredLoggingEnabled) {
      return JSON.stringify({
        exportTimestamp: Date.now(),
        extensionVersion: vscode.extensions.getExtension('AngDrew.openspec-vscode')?.packageJSON.version || 'unknown',
        vscodeVersion: vscode.version,
        totalEntries: this.logBuffer.length,
        logs: this.logBuffer
      }, null, 2);
    } else {
      // Plain text format
      return this.logBuffer.map(entry => {
        const date = new Date(entry.timestamp).toISOString();
        const context = entry.context ? `[${entry.context}] ` : '';
        const stack = entry.stack ? `\n${entry.stack}` : '';
        const metadata = entry.metadata ? `\nMetadata: ${JSON.stringify(entry.metadata, null, 2)}` : '';
        return `[${date}] [${entry.level.toUpperCase()}] ${context}${entry.message}${stack}${metadata}`;
      }).join('\n\n');
    }
  }

  static getDebugStats(): { totalEntries: number; errors: number; warnings: number; info: number; debug: number } {
    const stats = { totalEntries: this.logBuffer.length, errors: 0, warnings: 0, info: 0, debug: 0 };
    
    for (const entry of this.logBuffer) {
      switch (entry.level) {
        case 'error':
          stats.errors++;
          break;
        case 'warning':
          stats.warnings++;
          break;
        case 'info':
          stats.info++;
          break;
        case 'debug':
          stats.debug++;
          break;
      }
    }
    
    return stats;
  }

  static isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  static setDebugEnabled(enabled: boolean): void {
    const config = vscode.workspace.getConfiguration('openspec');
    config.update('debug.enabled', enabled, true);
    this.debugEnabled = enabled;
  }

  static dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
    }
    this.logBuffer = [];
  }
}
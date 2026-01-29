import * as vscode from 'vscode';

export class ErrorHandler {
  private static outputChannel: vscode.OutputChannel;

  static initialize(): void {
    this.outputChannel = vscode.window.createOutputChannel('OpenSpec Extension');
  }

  static handle(error: Error, context: string, showMessage: boolean = true): void {
    const message = `[${context}] ${error.message}`;
    const fullError = `${message}\n${error.stack}`;
    
    // Log to output channel
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.appendLine(fullError);
    
    // Show to user if requested
    if (showMessage) {
      const showOutput = 'Show Output';
      vscode.window.showErrorMessage(`OpenSpec Extension Error: ${message}`, showOutput)
        .then(selection => {
          if (selection === showOutput) {
            this.outputChannel.show();
          }
        });
    }
    
    // Also log to console for debugging
    console.error(fullError);
  }

  static info(message: string, showNotification: boolean = false): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.appendLine(`[INFO] ${message}`);
    
    if (showNotification) {
      vscode.window.showInformationMessage(message);
    }
  }

  static warning(message: string, showNotification: boolean = true): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.appendLine(`[WARNING] ${message}`);
    
    if (showNotification) {
      vscode.window.showWarningMessage(message);
    }
  }

  static debug(message: string): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.appendLine(`[DEBUG] ${message}`);
  }

  static showOutputChannel(): void {
    if (!this.outputChannel) {
      this.initialize();
    }
    this.outputChannel.show();
  }

  static dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
    }
  }
}
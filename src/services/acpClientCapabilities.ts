import * as vscode from 'vscode';
import { ErrorHandler } from '../utils/errorHandler';
import {
  ReadTextFileRequest, ReadTextFileResponse,
  WriteTextFileRequest, WriteTextFileResponse,
  RequestPermissionRequest, RequestPermissionResponse,
  CreateTerminalRequest, CreateTerminalResponse,
  TerminalOutputRequest, TerminalOutputResponse,
  WaitForTerminalExitRequest, WaitForTerminalExitResponse,
  KillTerminalCommandRequest, KillTerminalCommandResponse,
  ReleaseTerminalRequest, ReleaseTerminalResponse,
} from './acpTypes';

export interface ManagedTerminal {
  id: string;
  terminal?: vscode.Terminal;
  proc?: ReturnType<typeof import('child_process').spawn>;
  output: string;
  outputByteLimit: number | null;
  truncated: boolean;
  exitCode: number | null;
  signal: string | null;
  exitResolve: (() => void) | null;
  exitPromise: Promise<void>;
}

export class AcpClientCapabilities {
  private terminalCounter = 0;
  private terminals = new Map<string, ManagedTerminal>();
  private allowedPermissions = new Set<string>(); // sessionId:toolCallId

  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    ErrorHandler.debug(`[ACP] Reading file: ${params.path}`);
    
    try {
      const uri = vscode.Uri.file(params.path);
      
      // Check open documents first (handles unsaved changes)
      const openDoc = vscode.workspace.textDocuments.find(
        doc => doc.uri.fsPath === uri.fsPath
      );

      let content: string;
      if (openDoc) {
        content = openDoc.getText();
        ErrorHandler.debug(`[ACP] Read from open document: ${params.path}`);
      } else {
        const fileContent = await vscode.workspace.fs.readFile(uri);
        content = new TextDecoder().decode(fileContent);
        ErrorHandler.debug(`[ACP] Read from file system: ${params.path}`);
      }

      // Apply line/limit if specified
      if (params.line !== undefined || params.limit !== undefined) {
        const lines = content.split('\n');
        const startLine = params.line ?? 0;
        const lineLimit = params.limit ?? lines.length;
        const selectedLines = lines.slice(startLine, startLine + lineLimit);
        content = selectedLines.join('\n');
      }

      return { content };
    } catch (error) {
      ErrorHandler.debug(`[ACP] Failed to read file ${params.path}: ${error}`);
      throw error;
    }
  }

  async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    ErrorHandler.debug(`[ACP] Writing file: ${params.path}`);
    
    try {
      const uri = vscode.Uri.file(params.path);
      const content = new TextEncoder().encode(params.content);
      
      // Ensure directory exists
      const dirUri = vscode.Uri.joinPath(uri, '..');
      try {
        await vscode.workspace.fs.createDirectory(dirUri);
      } catch {
        // Directory might already exist
      }
      
      await vscode.workspace.fs.writeFile(uri, content);
      
      // Open the file in the editor
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
      } catch {
        // File might not be a text file, ignore
      }
      
      ErrorHandler.debug(`[ACP] Successfully wrote file: ${params.path}`);
      return {};
    } catch (error) {
      ErrorHandler.debug(`[ACP] Failed to write file ${params.path}: ${error}`);
      throw error;
    }
  }

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const { sessionId, toolCall, options } = params;
    const permissionKey = `${sessionId}:${toolCall.toolCallId}`;
    
    // Check if already allowed
    if (this.allowedPermissions.has(permissionKey)) {
      return {
        outcome: {
          outcome: 'selected',
          optionId: 'allow_always'
        }
      };
    }

    // Show permission request to user
    const toolName = toolCall.title || 'Unknown tool';
    const message = `OpenCode wants to use: ${toolName}`;
    
    // Map options to VS Code dialog choices
    const choices: { [key: string]: string } = {};
    const optionButtons: string[] = [];
    
    for (const option of options) {
      let label: string;
      switch (option.kind) {
        case 'allow_once':
          label = 'Allow Once';
          break;
        case 'allow_always':
          label = 'Always Allow';
          break;
        case 'reject_once':
          label = 'Reject';
          break;
        case 'reject_always':
          label = 'Always Reject';
          break;
        default:
          label = option.name || option.optionId;
      }
      choices[label] = option.optionId;
      optionButtons.push(label);
    }

    const result = await vscode.window.showInformationMessage(
      message,
      { modal: false },
      ...optionButtons
    );

    if (!result) {
      // User dismissed the dialog
      return {
        outcome: {
          outcome: 'cancelled'
        }
      };
    }

    const selectedOptionId = choices[result];
    
    // Store if always allow
    if (selectedOptionId === 'allow_always') {
      this.allowedPermissions.add(permissionKey);
    }

    return {
      outcome: {
        outcome: 'selected',
        optionId: selectedOptionId
      }
    };
  }

  async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const terminalId = `term-${++this.terminalCounter}-${Date.now()}`;
    
    ErrorHandler.debug(`[ACP] Creating terminal: ${terminalId} for command: ${params.command}`);

    const { spawn } = await import('child_process');
    
    let exitResolve: () => void = () => {};
    const exitPromise = new Promise<void>((resolve) => {
      exitResolve = resolve;
    });

    const managedTerminal: ManagedTerminal = {
      id: terminalId,
      output: '',
      outputByteLimit: params.outputByteLimit ?? null,
      truncated: false,
      exitCode: null,
      signal: null,
      exitResolve,
      exitPromise
    };

    try {
      const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const cwd = params.cwd && params.cwd.trim() !== '' 
        ? params.cwd 
        : workspaceCwd || process.cwd();

      const envVars = params.env?.reduce(
        (acc, e) => ({ ...acc, [e.name]: e.value }),
        { ...process.env }
      ) || { ...process.env };

      const proc = spawn(params.command, params.args || [], {
        cwd,
        env: envVars,
        shell: true,
        windowsHide: process.platform === 'win32'
      });

      managedTerminal.proc = proc;

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.appendTerminalOutput(managedTerminal, text);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.appendTerminalOutput(managedTerminal, text);
      });

      proc.on('close', (code: number | null, signal: string | null) => {
        managedTerminal.exitCode = code;
        managedTerminal.signal = signal;
        if (managedTerminal.exitResolve) {
          managedTerminal.exitResolve();
        }
      });

      proc.on('error', (err: Error) => {
        managedTerminal.exitCode = 1;
        managedTerminal.output += `\nError: ${err.message}\n`;
        if (managedTerminal.exitResolve) {
          managedTerminal.exitResolve();
        }
      });

      // Create a VS Code terminal for visibility (optional, via Pseudoterminal)
      // For now, we just track the process internally

      this.terminals.set(terminalId, managedTerminal);
      ErrorHandler.debug(`[ACP] Terminal created: ${terminalId}`);

      return { terminalId };
    } catch (error) {
      ErrorHandler.debug(`[ACP] Failed to create terminal: ${error}`);
      throw error;
    }
  }

  async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }

    return {
      output: terminal.output,
      truncated: terminal.truncated
    };
  }

  async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }

    // Wait for the process to exit
    await terminal.exitPromise;

    return {
      exitCode: terminal.exitCode,
      signal: terminal.signal
    };
  }

  async killTerminal(params: KillTerminalCommandRequest): Promise<KillTerminalCommandResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }

    if (terminal.proc && !terminal.proc.killed) {
      terminal.proc.kill('SIGTERM');
    }

    return {};
  }

  async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (terminal) {
      if (terminal.proc && !terminal.proc.killed) {
        terminal.proc.kill('SIGTERM');
      }
      terminal.terminal?.dispose();
      this.terminals.delete(params.terminalId);
      ErrorHandler.debug(`[ACP] Terminal released: ${params.terminalId}`);
    }

    return {};
  }

  private appendTerminalOutput(terminal: ManagedTerminal, text: string): void {
    terminal.output += text;

    if (terminal.outputByteLimit !== null) {
      const byteLength = Buffer.byteLength(terminal.output, 'utf8');
      if (byteLength > terminal.outputByteLimit) {
        const encoded = Buffer.from(terminal.output, 'utf8');
        const sliced = encoded.slice(-terminal.outputByteLimit);
        terminal.output = sliced.toString('utf8');
        terminal.truncated = true;
      }
    }
  }

  dispose(): void {
    // Kill all terminals
    for (const terminal of this.terminals.values()) {
      if (terminal.proc && !terminal.proc.killed) {
        terminal.proc.kill('SIGTERM');
      }
      terminal.terminal?.dispose();
    }
    this.terminals.clear();
    this.allowedPermissions.clear();
  }
}

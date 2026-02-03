import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { ErrorHandler } from '../utils/errorHandler';

export interface RalphExecutionOptions {
  scriptPath?: string;
  changeId: string;
  count?: number;
  sessionId?: string;
  extraPrompt?: string;
  attachUrl?: string;
}

export interface RalphOutputLine {
  type: 'stdout' | 'stderr' | 'error' | 'exit' | 'progress';
  content: string;
  timestamp: number;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
}

export interface RalphExecutionResult {
  success: boolean;
  exitCode: number | null;
  output: RalphOutputLine[];
  error?: string;
  duration?: number;
  tasksCompleted?: number;
}

export type RalphOutputHandler = (line: RalphOutputLine) => void;
export type RalphProgressHandler = (progress: { current: number; total: number; message: string }) => void;

export class RalphService {
  private static instance: RalphService;
  private currentProcess: ChildProcess | null = null;
  private outputHandlers: RalphOutputHandler[] = [];
  private progressHandlers: RalphProgressHandler[] = [];
  private outputBuffer: RalphOutputLine[] = [];
  private startTime: number = 0;
  private tasksCompleted: number = 0;

  private constructor() {}

  static getInstance(): RalphService {
    if (!RalphService.instance) {
      RalphService.instance = new RalphService();
    }
    return RalphService.instance;
  }

  /**
   * Resolves the script path - supports workspace relative or absolute paths
   */
  async resolveScriptPath(scriptPath?: string): Promise<string | undefined> {
    // If no path provided, use default bundled script
    if (!scriptPath) {
      return this.getDefaultScriptPath();
    }

    // Check if it's an absolute path
    if (path.isAbsolute(scriptPath)) {
      const exists = await this.fileExists(scriptPath);
      if (exists) {
        return scriptPath;
      }
      ErrorHandler.debug(`Absolute script path not found: ${scriptPath}`, 'RalphService');
      return undefined;
    }

    // Try as workspace-relative path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = path.join(workspaceFolder.uri.fsPath, scriptPath);
      const exists = await this.fileExists(workspacePath);
      if (exists) {
        return workspacePath;
      }
    }

    // Try relative to extension
    const extensionPath = path.join(this.getExtensionPath(), scriptPath);
    const exists = await this.fileExists(extensionPath);
    if (exists) {
      return extensionPath;
    }

    ErrorHandler.debug(`Could not resolve script path: ${scriptPath}`, 'RalphService');
    return undefined;
  }

  /**
   * Gets the default bundled script path
   */
  private getDefaultScriptPath(): string | undefined {
    try {
      const extensionUri = this.getExtensionUri();
      if (!extensionUri) {
        return undefined;
      }
      const scriptUri = vscode.Uri.joinPath(extensionUri, 'ralph_opencode.mjs');
      return scriptUri.fsPath;
    } catch (error) {
      ErrorHandler.debug(`Failed to get default script path: ${error}`, 'RalphService');
      return undefined;
    }
  }

  /**
   * Gets the extension URI from the active extension context
   */
  private getExtensionUri(): vscode.Uri | undefined {
    // Try to get from extension context
    const extension = vscode.extensions.getExtension('openspec.openspec-vscode');
    if (extension) {
      return extension.extensionUri;
    }
    return undefined;
  }

  /**
   * Gets the extension path
   */
  private getExtensionPath(): string {
    const extensionUri = this.getExtensionUri();
    if (extensionUri) {
      return extensionUri.fsPath;
    }
    return '';
  }

  /**
   * Checks if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Executes the ralph script with the given options
   */
  async execute(options: RalphExecutionOptions): Promise<RalphExecutionResult> {
    // Resolve script path
    const scriptPath = await this.resolveScriptPath(options.scriptPath);
    if (!scriptPath) {
      const error = options.scriptPath
        ? `Script not found: ${options.scriptPath}`
        : 'Default ralph_opencode.mjs script not found';
      return {
        success: false,
        exitCode: null,
        output: [{
          type: 'error',
          content: error,
          timestamp: Date.now()
        }],
        error
      };
    }

    // Clear previous output
    this.outputBuffer = [];

    return new Promise((resolve) => {
      const args: string[] = [scriptPath];

      // Add attach URL
      if (options.attachUrl) {
        args.push('--attach', options.attachUrl);
      }

      // Add change ID
      if (options.changeId) {
        args.push('--change', options.changeId);
      }

      // Add count
      if (options.count && options.count > 1) {
        args.push('--count', String(options.count));
      }

      // Set up environment
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        OPENCODE_NPX_PKG: process.env.OPENCODE_NPX_PKG || 'opencode-ai@1.1.44'
      };

      if (options.sessionId) {
        env.OPENCODE_ATTACH_URL = options.attachUrl || 'http://localhost:4099';
      }

      if (options.extraPrompt) {
        env.OPENSPEC_EXTRA_PROMPT = options.extraPrompt;
      }

      ErrorHandler.debug(`Executing ralph script: node ${args.join(' ')}`, 'RalphService');

      // Track execution start time
      this.startTime = Date.now();
      this.tasksCompleted = 0;

      // Spawn the process
      this.currentProcess = spawn('node', args, {
        cwd: this.getWorkspaceRoot(),
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Handle stdout with progress detection
      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            const outputLine: RalphOutputLine = {
              type: 'stdout',
              content: line,
              timestamp: Date.now()
            };
            this.outputBuffer.push(outputLine);
            this.notifyOutputHandlers(outputLine);

            // Parse progress information from output
            this.parseProgressFromOutput(line);
          }
        }
      });

      // Handle stderr
      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            const outputLine: RalphOutputLine = {
              type: 'stderr',
              content: line,
              timestamp: Date.now()
            };
            this.outputBuffer.push(outputLine);
            this.notifyOutputHandlers(outputLine);
          }
        }
      });

      // Handle process exit
      this.currentProcess.on('exit', (code) => {
        const duration = Date.now() - this.startTime;
        const exitLine: RalphOutputLine = {
          type: 'exit',
          content: `Process exited with code ${code}`,
          timestamp: Date.now()
        };
        this.outputBuffer.push(exitLine);
        this.notifyOutputHandlers(exitLine);

        this.currentProcess = null;

        resolve({
          success: code === 0,
          exitCode: code,
          output: [...this.outputBuffer],
          duration,
          tasksCompleted: this.tasksCompleted
        });
      });

      // Handle process error
      this.currentProcess.on('error', (error) => {
        const duration = Date.now() - this.startTime;
        const errorLine: RalphOutputLine = {
          type: 'error',
          content: `Process error: ${error.message}`,
          timestamp: Date.now()
        };
        this.outputBuffer.push(errorLine);
        this.notifyOutputHandlers(errorLine);

        this.currentProcess = null;

        resolve({
          success: false,
          exitCode: null,
          output: [...this.outputBuffer],
          error: error.message,
          duration,
          tasksCompleted: this.tasksCompleted
        });
      });
    });
  }

  /**
   * Parses progress information from script output
   */
  private parseProgressFromOutput(line: string): void {
    // Look for task completion patterns
    const taskMatch = line.match(/Task\s+(\d+\.\d+)\s+completed/i) ||
                     line.match(/Completed.*task.*(\d+\.\d+)/i) ||
                     line.match(/-\s*\[x\]\s*(\d+\.\d+)/i);
    if (taskMatch) {
      this.tasksCompleted++;
      this.notifyProgressHandlers({
        current: this.tasksCompleted,
        total: this.tasksCompleted + 1, // Estimate
        message: `Completed task ${taskMatch[1]}`
      });
      return;
    }

    // Look for iteration progress
    const iterMatch = line.match(/Iteration\s+(\d+)\/(\d+)/i) ||
                     line.match(/Running\s+iteration\s+(\d+).*of\s+(\d+)/i);
    if (iterMatch) {
      const current = parseInt(iterMatch[1], 10);
      const total = parseInt(iterMatch[2], 10);
      this.notifyProgressHandlers({
        current,
        total,
        message: `Iteration ${current} of ${total}`
      });
      return;
    }

    // Look for processing indicators
    if (line.includes('Processing') || line.includes('Executing') || line.includes('Running')) {
      this.notifyProgressHandlers({
        current: this.tasksCompleted,
        total: Math.max(this.tasksCompleted + 1, 1),
        message: line.substring(0, 100) // Truncate long messages
      });
    }
  }

  /**
   * Registers a progress handler for execution progress updates
   */
  onProgress(handler: RalphProgressHandler): vscode.Disposable {
    this.progressHandlers.push(handler);

    return new vscode.Disposable(() => {
      const index = this.progressHandlers.indexOf(handler);
      if (index > -1) {
        this.progressHandlers.splice(index, 1);
      }
    });
  }

  /**
   * Notifies all registered progress handlers
   */
  private notifyProgressHandlers(progress: { current: number; total: number; message: string }): void {
    for (const handler of this.progressHandlers) {
      try {
        handler(progress);
      } catch (error) {
        ErrorHandler.debug(`Error in progress handler: ${error}`, 'RalphService');
      }
    }

    // Also emit as a special output line
    const progressLine: RalphOutputLine = {
      type: 'progress',
      content: progress.message,
      timestamp: Date.now(),
      progress
    };
    this.notifyOutputHandlers(progressLine);
  }

  /**
   * Cancels the current execution
   */
  cancel(): boolean {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      return true;
    }
    return false;
  }

  /**
   * Checks if a process is currently running
   */
  isRunning(): boolean {
    return this.currentProcess !== null;
  }

  /**
   * Registers an output handler for real-time output
   */
  onOutput(handler: RalphOutputHandler): vscode.Disposable {
    this.outputHandlers.push(handler);

    // Send existing buffered output to new handler
    for (const line of this.outputBuffer) {
      handler(line);
    }

    return new vscode.Disposable(() => {
      const index = this.outputHandlers.indexOf(handler);
      if (index > -1) {
        this.outputHandlers.splice(index, 1);
      }
    });
  }

  /**
   * Notifies all registered output handlers
   */
  private notifyOutputHandlers(line: RalphOutputLine): void {
    for (const handler of this.outputHandlers) {
      try {
        handler(line);
      } catch (error) {
        ErrorHandler.debug(`Error in output handler: ${error}`, 'RalphService');
      }
    }
  }

  /**
   * Gets the workspace root path
   */
  private getWorkspaceRoot(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }
    return process.cwd();
  }

  /**
   * Clears the output buffer
   */
  clearOutputBuffer(): void {
    this.outputBuffer = [];
  }

  /**
   * Gets the current output buffer
   */
  getOutputBuffer(): RalphOutputLine[] {
    return [...this.outputBuffer];
  }
}

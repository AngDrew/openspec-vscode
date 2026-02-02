import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as net from 'net';
import { CacheManager } from './cache';
import { ErrorHandler } from './errorHandler';

export class WorkspaceUtils {
  private static cache = CacheManager.getInstance();

  static async isOpenSpecInitialized(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    const cacheKey = `is-initialized-${workspaceFolder.uri.fsPath}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const openspecPath = path.join(workspaceFolder.uri.fsPath, 'openspec');
    try {
      const stats = await fs.stat(openspecPath);
      const result = stats.isDirectory();
      this.cache.set(cacheKey, result, 60 * 1000); // Cache for 1 minute
      return result;
    } catch (error) {
      ErrorHandler.debug(`Failed to check OpenSpec initialization: ${error}`);
      return false;
    }
  }

  static getOpenSpecRoot(workspaceFolder: vscode.WorkspaceFolder): string {
    return path.join(workspaceFolder.uri.fsPath, 'openspec');
  }

  static getChangesDir(workspaceFolder: vscode.WorkspaceFolder): string {
    return path.join(this.getOpenSpecRoot(workspaceFolder), 'changes');
  }

  static getSpecsDir(workspaceFolder: vscode.WorkspaceFolder): string {
    return path.join(this.getOpenSpecRoot(workspaceFolder), 'specs');
  }

  static getArchiveDir(workspaceFolder: vscode.WorkspaceFolder): string {
    return path.join(this.getChangesDir(workspaceFolder), 'archive');
  }

  static async hasAnyChangeArtifacts(changeDir: string): Promise<boolean> {
    try {
      const proposalPath = path.join(changeDir, 'proposal.md');
      const designPath = path.join(changeDir, 'design.md');
      const tasksPath = path.join(changeDir, 'tasks.md');
      const specsDir = path.join(changeDir, 'specs');

      if (await this.fileExists(proposalPath)) return true;
      if (await this.fileExists(designPath)) return true;
      if (await this.fileExists(tasksPath)) return true;

      if (await this.fileExists(specsDir)) {
        const specDirs = await this.listDirectories(specsDir);
        for (const specName of specDirs) {
          const specMd = path.join(specsDir, specName, 'spec.md');
          if (await this.fileExists(specMd)) return true;
        }
      }

      return false;
    } catch (error) {
      ErrorHandler.debug(`Failed to check artifacts in ${changeDir}: ${error}`);
      return false;
    }
  }

  static async isScaffoldOnlyActiveChange(changeDir: string): Promise<boolean> {
    // A scaffold-only change contains ONLY `.openspec.yaml` at the change root.
    // No proposal/design/tasks/specs files exist yet.
    try {
      const items = await fs.readdir(changeDir, { withFileTypes: true });
      let hasOpenSpecYaml = false;
      let hasOtherEntries = false;

      for (const item of items) {
        if (item.name === '.DS_Store' && item.isFile()) {
          continue;
        }
        if (item.name === 'Thumbs.db' && item.isFile()) {
          continue;
        }
        if (item.name === '.openspec.yaml' && item.isFile()) {
          hasOpenSpecYaml = true;
          continue;
        }

        // Allow an empty `specs/` directory (optionally containing only `.gitkeep`).
        if (item.name === 'specs' && item.isDirectory()) {
          try {
            const specEntries = await fs.readdir(path.join(changeDir, 'specs'), { withFileTypes: true });
            const nonIgnorable = specEntries.filter(entry => {
              if (!entry.isFile()) return true;
              return entry.name !== '.gitkeep' && entry.name !== '.DS_Store' && entry.name !== 'Thumbs.db';
            });
            if (nonIgnorable.length === 0) {
              continue;
            }
          } catch {
            // If we can't read it, treat it as non-empty to be safe.
          }
        }

        hasOtherEntries = true;
        break;
      }

      return hasOpenSpecYaml && !hasOtherEntries;
    } catch (error) {
      ErrorHandler.debug(`Failed to check scaffold-only change in ${changeDir}: ${error}`);
      return false;
    }
  }

  static async hasNoTasks(changeDir: string): Promise<boolean> {
    // Returns true if tasks.md does not exist in the change directory.
    // Fast-forward is available when there are no tasks yet.
    try {
      const tasksPath = path.join(changeDir, 'tasks.md');
      const hasTasks = await this.fileExists(tasksPath);
      return !hasTasks;
    } catch (error) {
      ErrorHandler.debug(`Failed to check tasks.md in ${changeDir}: ${error}`);
      return true; // Assume no tasks if we can't check
    }
  }

  static async validateTasksFormat(changeDir: string): Promise<{
    hasTasksFile: boolean;
    isValid: boolean;
    taskCount: number;
    error?: string;
  }> {
    try {
      const tasksPath = path.join(changeDir, 'tasks.md');
      const hasTasksFile = await this.fileExists(tasksPath);

      if (!hasTasksFile) {
        return { hasTasksFile: false, isValid: false, taskCount: 0, error: 'tasks.md not found' };
      }

      const content = await this.readFile(tasksPath);

      // Check for valid task lines: - [ ] 1.1 Task or - [x] 1.1 Task
      // Pattern: checkbox marker, space, numeric ID (e.g., 1.1, 1.2.1), space, content
      const taskPattern = /^- \[[ x]\] [0-9]+(\.[0-9]+)*\s/gm;
      const matches = content.match(taskPattern);
      const taskCount = matches ? matches.length : 0;

      if (taskCount === 0) {
        return {
          hasTasksFile: true,
          isValid: false,
          taskCount: 0,
          error: 'No valid task entries found (expected format: "- [ ] 1.1 Task description")'
        };
      }

      return { hasTasksFile: true, isValid: true, taskCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      ErrorHandler.debug(`Failed to validate tasks format in ${changeDir}: ${errorMsg}`);
      return {
        hasTasksFile: false,
        isValid: false,
        taskCount: 0,
        error: `Failed to read tasks.md: ${errorMsg}`
      };
    }
  }

  static async isPortOpen(host: string, port: number, timeoutMs: number = 350): Promise<boolean> {
    return await new Promise((resolve) => {
      const socket = new net.Socket();

      const done = (result: boolean) => {
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        resolve(result);
      };

      socket.setTimeout(timeoutMs);

      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));

      try {
        socket.connect(port, host);
      } catch {
        done(false);
      }
    });
  }

  static async isOpenCodeServerListening(timeoutMs: number = 350): Promise<boolean> {
    const port = 4099;
    const hosts = ['127.0.0.1', '::1', 'localhost'];

    for (const host of hosts) {
      if (await this.isPortOpen(host, port, timeoutMs)) {
        return true;
      }
    }

    return false;
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async readFile(filePath: string): Promise<string> {
    const cacheKey = `file-${filePath}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      this.cache.set(cacheKey, content, 30 * 1000); // Cache for 30 seconds
      return content;
    } catch (error) {
      ErrorHandler.handle(error as Error, `Failed to read file: ${filePath}`, true);
      throw error;
    }
  }

  static async listDirectories(dirPath: string): Promise<string[]> {
    const cacheKey = `dirs-${dirPath}`;
    const cached = this.cache.get<string[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const directories = items
        .filter(item => item.isDirectory())
        .map(item => item.name);
      
      this.cache.set(cacheKey, directories, 10 * 1000); // Cache for 10 seconds
      return directories;
    } catch (error) {
      ErrorHandler.debug(`Failed to list directories in ${dirPath}: ${error}`);
      return [];
    }
  }

  static async listFiles(dirPath: string, extension: string = '.md'): Promise<string[]> {
    const cacheKey = `files-${dirPath}-${extension}`;
    const cached = this.cache.get<string[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const files = items
        .filter(item => item.isFile() && item.name.endsWith(extension))
        .map(item => item.name);
      
      this.cache.set(cacheKey, files, 10 * 1000); // Cache for 10 seconds
      return files;
    } catch (error) {
      ErrorHandler.debug(`Failed to list files in ${dirPath}: ${error}`);
      return [];
    }
  }

  static async countRequirementsInSpec(specPath: string): Promise<number> {
    const cacheKey = `requirements-${specPath}`;
    const cached = this.cache.get<number>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const content = await this.readFile(specPath);
      const requirementMatches = content.match(/^### Requirement:/gm);
      const count = requirementMatches ? requirementMatches.length : 0;
      
      this.cache.set(cacheKey, count, 60 * 1000); // Cache for 1 minute
      return count;
    } catch (error) {
      ErrorHandler.debug(`Failed to count requirements in ${specPath}: ${error}`);
      return 0;
    }
  }

  // Method to clear cache for a specific path
  static invalidateCache(filePath?: string): void {
    if (filePath) {
      // Invalidate all cache entries related to this path
      this.cache.clear(); // For simplicity, clear all cache
    } else {
      this.cache.clear(); // Clear all cache
    }
  }

  static async hasFile(dirPath: string, fileName: string): Promise<boolean> {
    const filePath = path.join(dirPath, fileName);
    return await this.fileExists(filePath);
  }

  static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      ErrorHandler.debug(`Error getting file size for ${filePath}: ${error}`);
      return 0;
    }
  }

  static async readFileWithSizeCheck(
    filePath: string, 
    maxSize: number = 500_000
  ): Promise<{ content: string; isTooLarge: boolean; error?: string }> {
    try {
      const fileSize = await this.getFileSize(filePath);
      
      if (fileSize > maxSize) {
        return {
          content: '',
          isTooLarge: true,
          error: `File too large (${(fileSize / 1024).toFixed(1)}KB). Maximum size for preview is ${(maxSize / 1024).toFixed(0)}KB.`
        };
      }
      
      const content = await this.readFile(filePath);
      return {
        content,
        isTooLarge: false
      };
      
    } catch (error) {
      return {
        content: '',
        isTooLarge: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
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
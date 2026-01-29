import * as vscode from 'vscode';
import * as path from 'path';
import { TreeItemData } from '../types';
import { WorkspaceUtils } from '../utils/workspace';

export class OpenSpecExplorerProvider implements vscode.TreeDataProvider<TreeItemData> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemData | undefined | null | void> = new vscode.EventEmitter<TreeItemData | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItemData | undefined | null | void> = this._onDidChangeTreeData.event;

  private _workspaceFolder: vscode.WorkspaceFolder | undefined;

  constructor() {
    this.updateWorkspaceFolder();
  }

  refresh(): void {
    this.updateWorkspaceFolder();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemData): vscode.TreeItem {
    const collapsibleState = element.type === 'folder' 
      ? vscode.TreeItemCollapsibleState.Collapsed 
      : (element.children && element.children.length > 0) 
        ? vscode.TreeItemCollapsibleState.Collapsed 
        : vscode.TreeItemCollapsibleState.None;
    
    const treeItem = new vscode.TreeItem(element.label, collapsibleState);

    treeItem.id = element.id;
    treeItem.tooltip = this.getTooltip(element);
    treeItem.contextValue = element.contextValue || 'default';
    
    if (element.iconPath) {
      treeItem.iconPath = new vscode.ThemeIcon(element.iconPath);
    } else if (element.type === 'change') {
      const isActive = element.metadata?.isActive;
      treeItem.iconPath = new vscode.ThemeIcon(isActive ? 'circle-outline' : 'check-circle');
    } else if (element.type === 'spec') {
      treeItem.iconPath = new vscode.ThemeIcon('file-text');
    } else if (element.type === 'folder') {
      treeItem.iconPath = new vscode.ThemeIcon('folder');
    }

    if (element.path) {
      if (element.type === 'spec') {
        treeItem.command = {
          command: 'vscode.open',
          title: 'Open Spec',
          arguments: [vscode.Uri.file(element.path)]
        };
      } else if (element.type === 'change') {
        treeItem.command = {
          command: 'openspec.viewDetails',
          title: 'View Details',
          arguments: [element]
        };
      }
    }

    return treeItem;
  }

  getChildren(element?: TreeItemData): Thenable<TreeItemData[]> {
    if (!this._workspaceFolder) {
      return Promise.resolve([this.getWelcomeItem()]);
    }

    return WorkspaceUtils.isOpenSpecInitialized(this._workspaceFolder).then(isInitialized => {
      if (!isInitialized) {
        return [this.getWelcomeItem()];
      }

      if (!element) {
        return this.getRootItems();
      }

      if (element.type === 'folder') {
        if (element.id === 'changes') {
          return this.getChangesItems();
        } else if (element.id === 'active-changes' || element.id === 'completed-changes') {
          return Promise.resolve(element.children || []);
        } else if (element.id === 'specs') {
          return this.getSpecsItems();
        }
      }

      return Promise.resolve([]);
    });
  }

  private getWelcomeItem(): TreeItemData {
    return {
      id: 'welcome',
      label: 'OpenSpec workspace not detected',
      type: 'welcome',
      contextValue: 'welcome'
    };
  }

  private getRootItems(): TreeItemData[] {
    return [
      {
        id: 'changes',
        label: 'Changes',
        type: 'folder',
        iconPath: 'folder-opened',
        children: [] // Will be populated lazily
      },
      {
        id: 'specs',
        label: 'Specifications',
        type: 'folder', 
        iconPath: 'folder',
        children: [] // Will be populated lazily
      }
    ];
  }

  private async getChangesItems(): Promise<TreeItemData[]> {
    if (!this._workspaceFolder) {
      return [];
    }

    const items: TreeItemData[] = [];

    // Active changes
    const changesDir = WorkspaceUtils.getChangesDir(this._workspaceFolder);
    const activeChanges = await this.getActiveChanges(changesDir);
    
    if (activeChanges.length > 0) {
      const activeFolder = {
        id: 'active-changes',
        label: `Active Changes (${activeChanges.length})`,
        type: 'folder' as const,
        iconPath: 'circle-outline',
        children: activeChanges
      };
      items.push(activeFolder);
    }

    // Completed changes
    const archiveDir = WorkspaceUtils.getArchiveDir(this._workspaceFolder);
    const completedChanges = await this.getCompletedChanges(archiveDir);
    
    if (completedChanges.length > 0) {
      const completedFolder = {
        id: 'completed-changes',
        label: `Completed Changes (${completedChanges.length})`,
        type: 'folder' as const,
        iconPath: 'check-circle',
        children: completedChanges
      };
      items.push(completedFolder);
    }

    return items;
  }

  private async getActiveChanges(changesDir: string): Promise<TreeItemData[]> {
    const changeNames = await WorkspaceUtils.listDirectories(changesDir);
    console.log(`[OpenSpec] Looking for changes in: ${changesDir}`);
    console.log(`[OpenSpec] Found directories: ${JSON.stringify(changeNames)}`);
    const items: TreeItemData[] = [];

    for (const changeName of changeNames) {
      if (changeName === 'archive') continue; // Skip archive directory

      const changePath = path.join(changesDir, changeName);

      items.push({
        id: `change-${changeName}`,
        label: changeName,
        type: 'change',
        path: changePath,
        contextValue: 'change:active',
        metadata: {
          isActive: true,
          status: 'in-progress'
        }
      });

    }

    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  private async getCompletedChanges(archiveDir: string): Promise<TreeItemData[]> {
    const changeNames = await WorkspaceUtils.listDirectories(archiveDir);
    const items: TreeItemData[] = [];

    for (const changeName of changeNames) {
      const changePath = path.join(archiveDir, changeName);

      items.push({
        id: `change-${changeName}`,
        label: changeName,
        type: 'change',
        path: changePath,
        contextValue: 'change:completed',
        metadata: {
          isActive: false,
          status: 'completed'
        }
      });
    }

    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  private async getSpecsItems(): Promise<TreeItemData[]> {
    if (!this._workspaceFolder) {
      return [];
    }

    const specsDir = WorkspaceUtils.getSpecsDir(this._workspaceFolder);
    const specNames = await WorkspaceUtils.listDirectories(specsDir);
    const items: TreeItemData[] = [];

    for (const specName of specNames) {
      const specPath = path.join(specsDir, specName);
      const specMdPath = path.join(specPath, 'spec.md');
      
      let requirementCount = 0;
      if (await WorkspaceUtils.fileExists(specMdPath)) {
        requirementCount = await WorkspaceUtils.countRequirementsInSpec(specMdPath);
      }

      items.push({
        id: `spec-${specName}`,
        label: `${specName} (${requirementCount} requirements)`,
        type: 'spec',
        path: specMdPath,
        contextValue: 'spec',
        metadata: {
          requirementCount
        }
      });
    }

    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  private getTooltip(element: TreeItemData): string {
    if (element.type === 'change') {
      const isActive = element.metadata?.isActive;
      const status = element.metadata?.status;
      return `${element.label} - ${isActive ? 'Active' : 'Completed'} (${status})`;
    }
    
    if (element.type === 'spec') {
      const count = element.metadata?.requirementCount || 0;
      return `${element.label} - ${count} requirements`;
    }

    return element.label;
  }

  private updateWorkspaceFolder(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    console.log(`[OpenSpec] Workspace folders: ${JSON.stringify(workspaceFolders?.map(f => f.uri.fsPath) || [])}`);
    if (workspaceFolders && workspaceFolders.length > 0) {
      this._workspaceFolder = workspaceFolders[0];
      console.log(`[OpenSpec] Selected workspace: ${this._workspaceFolder.uri.fsPath}`);
    } else {
      this._workspaceFolder = undefined;
    }
  }
}
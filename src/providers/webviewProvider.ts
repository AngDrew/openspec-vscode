import * as vscode from 'vscode';
import * as path from 'path';
import { marked } from 'marked';
import { WorkspaceUtils } from '../utils/workspace';
import { TreeItemData } from '../types';

export class OpenSpecWebviewProvider implements vscode.WebviewPanelSerializer {
  private _panels = new Map<string, vscode.WebviewPanel>();
  private _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    
    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: true,
      headerPrefix: ''
    });
  }

  async deserializeWebviewPanel(_webviewPanel: vscode.WebviewPanel, _state: any) {
    console.log('Deserializing webview panel');
    // Handle panel restoration if needed
  }

  async showDetails(item: TreeItemData): Promise<void> {
    if (!item.path) {
      vscode.window.showErrorMessage('No path available for this item');
      return;
    }

    const panelKey = `details-${item.id}`;
    
    if (this._panels.has(panelKey)) {
      this._panels.get(panelKey)!.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'openspec.details',
      `OpenSpec: ${item.label}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          this._extensionUri,
          vscode.Uri.file(path.dirname(item.path))
        ],
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = await this.getHtmlContent(panel.webview, item);
    this.setupWebviewMessageHandling(panel, item);

    panel.onDidDispose(() => {
      this._panels.delete(panelKey);
    });

    this._panels.set(panelKey, panel);
  }

  private async getHtmlContent(webview: vscode.Webview, item: TreeItemData): Promise<string> {
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'script.js'));

    let proposalContent = '';
    let tasksContent = '';
    
    if (item.type === 'change' && item.path) {
      try {
        const proposalPath = path.join(item.path, 'proposal.md');
        const tasksPath = path.join(item.path, 'tasks.md');
        
        if (await WorkspaceUtils.fileExists(proposalPath)) {
          const proposalMarkdown = await WorkspaceUtils.readFile(proposalPath);
          proposalContent = marked(proposalMarkdown);
        }
        
        if (await WorkspaceUtils.fileExists(tasksPath)) {
          const tasksMarkdown = await WorkspaceUtils.readFile(tasksPath);
          tasksContent = this.renderTasksWithCheckboxes(tasksMarkdown);
        }
      } catch (error) {
        console.error('Error reading change files:', error);
      }
    }

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
          <title>OpenSpec: ${item.label}</title>
          <link href="${stylesUri}" rel="stylesheet">
      </head>
      <body>
          <div class="container">
              <header class="header">
                  <h1>${item.label}</h1>
                  <div class="status">
                      ${item.metadata?.isActive ? 
                        '<span class="badge active">Active Change</span>' : 
                        '<span class="badge completed">Completed Change</span>'}
                  </div>
              </header>

              <div class="content">
                  ${proposalContent ? `
                      <div class="collapsible-section" data-section="proposal">
                          <button class="section-header" tabindex="0" aria-expanded="true" aria-controls="proposal-content">
                              <span class="section-title">Proposal</span>
                              <span class="collapse-icon">▼</span>
                          </button>
                          <div id="proposal-content" class="section-content markdown-content">
                              ${proposalContent}
                          </div>
                      </div>
                  ` : ''}

                  ${tasksContent ? `
                      <div class="collapsible-section" data-section="tasks">
                          <button class="section-header" tabindex="0" aria-expanded="true" aria-controls="tasks-content">
                              <span class="section-title">Tasks</span>
                              <span class="collapse-icon">▼</span>
                          </button>
                          <div id="tasks-content" class="section-content tasks-content">
                              ${tasksContent}
                          </div>
                      </div>
                  ` : ''}

                  <div class="collapsible-section" data-section="files">
                      <button class="section-header" tabindex="0" aria-expanded="true" aria-controls="files-content">
                          <span class="section-title">Files</span>
                          <span class="collapse-icon">▼</span>
                      </button>
                      <div id="files-content" class="section-content files-list">
                          ${await this.renderFilesList(item)}
                      </div>
                  </div>
              </div>
          </div>
          <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }

  private renderTasksWithCheckboxes(tasksMarkdown: string): string {
    const lines = tasksMarkdown.split('\n');
    const taskStack: TaskItem[] = [];
    let nonTaskContent = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
      
      if (taskMatch) {
        const [, indent, checked, text] = taskMatch;
        const indentLevel = Math.floor(indent.length / 2); // Assuming 2 spaces per level
        const isChecked = checked === 'x';
        const taskId = `task-${i}`;
        
        const taskItem: TaskItem = {
          id: taskId,
          text: text,
          checked: isChecked,
          indentLevel: indentLevel,
          hasChildren: false,
          children: []
        };
        
        // Find parent task
        while (taskStack.length > indentLevel) {
          taskStack.pop();
        }
        
        if (taskStack.length === 0) {
          // This is a top-level task, add to stack
          taskStack.push(taskItem);
        } else {
          // This is a child task, update parent
          const parent = taskStack[taskStack.length - 1];
          parent.hasChildren = true;
          parent.children.push(taskItem);
        }
      } else {
        // Handle headers
        const headerMatch = line.match(/^(#+)\s+(.+)$/);
        if (headerMatch) {
          const [, level, text] = headerMatch;
          const headerLevel = level.length;
          nonTaskContent += `<h${headerLevel + 2}>${text}</h${headerLevel + 2}>`;
        }
        // Regular text
        else if (line.trim()) {
          nonTaskContent += `<p>${line}</p>`;
        } else {
          nonTaskContent += '\n';
        }
      }
    }
    
    // Render tasks and non-task content
    return nonTaskContent + this.renderTaskHierarchy(taskStack);
  }
  
  private renderTaskItem(task: TaskItem): string {
    const hasIcon = task.hasChildren || task.children.length > 0;
    const iconClass = hasIcon ? 'task-expand-icon' : '';
    const iconText = task.children.length > 0 ? '▼' : '';
    
    return `
      <div class="task-item" data-task-id="${task.id}" data-indent="${task.indentLevel}">
        <div class="task-wrapper">
          ${hasIcon ? `<button class="task-toggle ${iconClass}" aria-expanded="true" aria-controls="${task.id}-children">${iconText}</button>` : ''}
          <input type="checkbox" ${task.checked ? 'checked' : ''} disabled>
          <span class="task-text">${task.text}</span>
        </div>
        ${task.children.length > 0 ? `
          <div id="${task.id}-children" class="task-children">
            ${this.renderTaskChildren(task.children)}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  private renderTaskChildren(children: TaskItem[]): string {
    return children.map(child => this.renderTaskItem(child)).join('');
  }
  
  private renderTaskHierarchy(taskStack: TaskItem[]): string {
    let output = '';
    const processedTopLevel = new Set<string>();
    
    // Render top-level tasks first
    for (const task of taskStack) {
      if (task.indentLevel === 0 && !processedTopLevel.has(task.id)) {
        output += this.renderTaskItem(task);
        processedTopLevel.add(task.id);
      }
    }
    
    return output;
  }

  private async renderFilesList(item: TreeItemData): Promise<string> {
    if (!item.path) {
      return '<p>No files available</p>';
    }

    try {
      const files = await WorkspaceUtils.listFiles(item.path);
      if (files.length === 0) {
        return '<p>No files found</p>';
      }

      return files.map(file => {
        const filePath = path.join(item.path!, file);
        const fileName = path.basename(filePath);
        
        // Escape special characters in file path for HTML attributes
        const escapedPath = filePath.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        
        return `
          <div class="file-item">
            <button class="file-toggle" 
                    data-filepath="${escapedPath}"
                    aria-expanded="false"
                    aria-label="Toggle preview for ${fileName}">
              <span class="file-icon">📄</span>
              <span class="file-name">${file}</span>
              <span class="expand-icon">▶</span>
            </button>
            <div class="file-content" hidden>
              <pre><code></code></pre>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      return '<p>Error loading files</p>';
    }
  }

  private setupWebviewMessageHandling(panel: vscode.WebviewPanel, _item: TreeItemData): void {
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openFile') {
        const fileUri = vscode.Uri.parse(message.uri);
        await vscode.commands.executeCommand('vscode.open', fileUri);
      } else if (message.type === 'loadFileContent') {
        try {
          const fileUri = vscode.Uri.file(message.filepath);
          
          // Check file size first (500KB limit)
          const stats = await vscode.workspace.fs.stat(fileUri);
          const maxFileSize = 500 * 1024; // 500KB
          
          if (stats.size > maxFileSize) {
            panel.webview.postMessage({
              type: 'fileContentError',
              filepath: message.filepath,
              error: `File is too large (${Math.round(stats.size / 1024)}KB). Please open files larger than 500KB in the editor.`
            });
            return;
          }
          
          // Read file content
          const contentBuffer = await vscode.workspace.fs.readFile(fileUri);
          const content = Buffer.from(contentBuffer).toString('utf8');
          
          panel.webview.postMessage({
            type: 'fileContentLoaded',
            filepath: message.filepath,
            content: content
          });
        } catch (error) {
          panel.webview.postMessage({
            type: 'fileContentError',
            filepath: message.filepath,
            error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    });
  }
}

interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
  indentLevel: number;
  hasChildren: boolean;
  children: TaskItem[];
}
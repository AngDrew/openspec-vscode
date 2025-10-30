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
                      <section class="section">
                          <h2>Proposal</h2>
                          <div class="markdown-content">
                              ${proposalContent}
                          </div>
                      </section>
                  ` : ''}

                  ${tasksContent ? `
                      <section class="section">
                          <h2>Tasks</h2>
                          <div class="tasks-content">
                              ${tasksContent}
                          </div>
                      </section>
                  ` : ''}

                  <section class="section">
                      <h2>Files</h2>
                      <div class="files-list">
                          ${await this.renderFilesList(item)}
                      </div>
                  </section>
              </div>
          </div>
          <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }

  private renderTasksWithCheckboxes(tasksMarkdown: string): string {
    // Convert markdown task lists to HTML with interactive checkboxes
    return tasksMarkdown
      .split('\n')
      .map(line => {
        const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
        if (taskMatch) {
          const [, indent, checked, text] = taskMatch;
          const isChecked = checked === 'x';
          return `${indent}<div class="task-item">
            <input type="checkbox" ${isChecked ? 'checked' : ''} disabled>
            <span class="task-text">${text}</span>
          </div>`;
        }
        
        // Handle headers
        const headerMatch = line.match(/^(#+)\s+(.+)$/);
        if (headerMatch) {
          const [, level, text] = headerMatch;
          const headerLevel = level.length;
          return `<h${headerLevel + 2}>${text}</h${headerLevel + 2}>`;
        }
        
        // Regular text
        return line ? `<p>${line}</p>` : '';
      })
      .join('\n');
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
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
    
    if (item.type === 'change' && item.path) {
      try {
        const proposalPath = path.join(item.path, 'proposal.md');
        
        if (await WorkspaceUtils.fileExists(proposalPath)) {
          const proposalMarkdown = await WorkspaceUtils.readFile(proposalPath);
          proposalContent = marked(proposalMarkdown);
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

                  ${await this.renderFilesList(item)}
              </div>
          </div>
          <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }



  private async renderFilesList(item: TreeItemData): Promise<string> {
    if (!item.path) {
      return '';
    }

    try {
      const files = await WorkspaceUtils.listFiles(item.path);
      if (files.length === 0) {
        return '';
      }

      const fileSections = await Promise.all(files.map(async (file) => {
        const filePath = path.join(item.path!, file);
        const fileName = path.basename(filePath);
        const fileExtension = path.extname(fileName).toLowerCase();
        const isMarkdown = fileExtension === '.md';
        
        // Escape special characters in file path for HTML attributes
        const escapedPath = filePath.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const sectionId = `file-${file.replace(/[^a-zA-Z0-9]/g, '-')}`;
        
        // Pre-load and render markdown files
        let contentHtml = '';
        if (isMarkdown && await WorkspaceUtils.fileExists(filePath)) {
          try {
            const fileContent = await WorkspaceUtils.readFile(filePath);
            contentHtml = marked(fileContent);
          } catch (error) {
            console.error(`Error reading markdown file ${filePath}:`, error);
            contentHtml = '<p>Error loading file content</p>';
          }
        }
        
        return `
          <div class="collapsible-section" data-section="file">
            <button class="section-header file-header" 
                    tabindex="0" 
                    aria-expanded="false" 
                    aria-controls="${sectionId}-content"
                    data-filepath="${escapedPath}"
                    data-file-type="${isMarkdown ? 'markdown' : 'code'}">
              <span class="section-title">
                <span class="file-icon">${isMarkdown ? '📝' : '📄'}</span>
                ${file}
              </span>
              <span class="collapse-icon">▶</span>
            </button>
            <div id="${sectionId}-content" class="section-content ${isMarkdown ? 'markdown-content' : 'code-content'}" hidden>
              ${contentHtml || '<pre class="file-preview"><code></code></pre>'}
            </div>
          </div>
        `;
      }));
      
      return fileSections.join('');
    } catch (error) {
      console.error('Error rendering files list:', error);
      return '';
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
          const fileExtension = path.extname(fileUri.fsPath).toLowerCase();
          const isMarkdown = fileExtension === '.md';
          
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
          
          // Process content based on file type
          let processedContent = content;
          if (isMarkdown) {
            processedContent = marked(content);
          }
          
          panel.webview.postMessage({
            type: 'fileContentLoaded',
            filepath: message.filepath,
            content: processedContent,
            fileType: isMarkdown ? 'markdown' : 'code'
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


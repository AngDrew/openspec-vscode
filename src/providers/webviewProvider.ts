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

    const panelKey = 'details';
    
    if (this._panels.has(panelKey)) {
      const existingPanel = this._panels.get(panelKey)!;
      // Update the title to reflect the current change
      existingPanel.title = `OpenSpec: ${item.label}`;
      // Update the HTML content
      existingPanel.webview.html = await this.getHtmlContent(existingPanel.webview, item);
      existingPanel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'openspec.details',
      `OpenSpec: ${item.label}`,
      vscode.ViewColumn.Active,
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
    this.setupWebviewMessageHandling(panel, item, panelKey);

    panel.onDidDispose(() => {
      this._panels.delete(panelKey);
    });

    this._panels.set(panelKey, panel);
  }

  private async getHtmlContent(webview: vscode.Webview, item: TreeItemData): Promise<string> {
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'script.js'));

    const { proposalContent, tasksContent, specsList, summaryHtml } = await this.buildChangeContent(item);

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
          <title>OpenSpec: ${item.label}</title>
          <link href="${stylesUri}" rel="stylesheet">
      </head>
      <body>
          <div class="container">
              <header class="header">
                  <div class="header-title">
                    <h1>${item.label}</h1>
                    ${this.renderStatusBadge(item)}
                  </div>
                  ${summaryHtml}
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
                          <div id="tasks-content" class="section-content markdown-content">
                              ${tasksContent}
                          </div>
                      </div>
                  ` : ''}

                  ${specsList ? `
                      <div class="collapsible-section" data-section="specs">
                          <button class="section-header" tabindex="0" aria-expanded="true" aria-controls="specs-content">
                              <span class="section-title">Specifications</span>
                              <span class="collapse-icon">▼</span>
                          </button>
                          <div id="specs-content" class="section-content specs-list">
                              ${specsList}
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
      const files = (await WorkspaceUtils.listFiles(item.path, ''))
        .filter(fileName => fileName !== 'proposal.md' && fileName !== 'tasks.md');
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
        
        return `
          <div class="collapsible-section" data-section="file">
            <button class="section-header file-header" 
                    tabindex="0" 
                    aria-expanded="false" 
                    aria-controls="${sectionId}-content"
                    data-filepath="${escapedPath}"
                    data-file-type="${isMarkdown ? 'markdown' : 'code'}">
              <span class="section-title">
                <span class="file-chip" aria-hidden="true">${isMarkdown ? 'MD' : 'FILE'}</span>
                ${file}
              </span>
              <span class="collapse-icon">▶</span>
            </button>
            <div id="${sectionId}-content" class="section-content ${isMarkdown ? 'markdown-content' : 'code-content'}" hidden>
              <pre class="file-preview"><code>Loading preview…</code></pre>
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

  private renderStatusBadge(item: TreeItemData): string {
    const isActive = item.metadata?.isActive;
    if (isActive === undefined) {
      return '';
    }
    const badgeClass = isActive ? 'badge active' : 'badge completed';
    const label = isActive ? 'Active' : 'Completed';
    return `<span class="${badgeClass}">${label}</span>`;
  }

  private async buildChangeContent(item: TreeItemData): Promise<{
    proposalContent: string;
    tasksContent: string;
    specsList: string;
    summaryHtml: string;
  }> {
    let proposalContent = '';
    let tasksContent = '';
    let specsList = '';
    let summaryHtml = '';

    if (item.type !== 'change' || !item.path) {
      return { proposalContent, tasksContent, specsList, summaryHtml };
    }

    try {
      const proposalPath = path.join(item.path, 'proposal.md');
      if (await WorkspaceUtils.fileExists(proposalPath)) {
        const proposalMarkdown = await WorkspaceUtils.readFile(proposalPath);
        proposalContent = marked(proposalMarkdown);
      }
    } catch (error) {
      console.error('Error reading proposal file:', error);
    }

    try {
      const tasksPath = path.join(item.path, 'tasks.md');
      if (await WorkspaceUtils.fileExists(tasksPath)) {
        const tasksMarkdown = await WorkspaceUtils.readFile(tasksPath);
        tasksContent = marked(tasksMarkdown);
      }
    } catch (error) {
      console.error('Error reading tasks file:', error);
    }

    try {
      const specsDir = path.join(item.path, 'specs');
      if (await WorkspaceUtils.fileExists(specsDir)) {
        const capabilityDirs = await WorkspaceUtils.listDirectories(specsDir);
        if (capabilityDirs.length > 0) {
          const specLinks: string[] = [];
          for (const capability of capabilityDirs) {
            const specPath = path.join(specsDir, capability, 'spec.md');
            if (await WorkspaceUtils.fileExists(specPath)) {
              const escapedPath = specPath.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
              specLinks.push(`<button class="spec-link" data-filepath="${escapedPath}" aria-label="Open ${capability} spec">
                <span class="codicon codicon-file-text"></span>
                ${capability} spec
              </button>`);
            }
          }
          specsList = specLinks.join('');
        }
      }
    } catch (error) {
      console.error('Error building specs list:', error);
    }

    // Summary section removed as requested
    
    return { proposalContent, tasksContent, specsList, summaryHtml };
  }

  private async buildSummary(changePath: string): Promise<string> {
    const openspecRoot = this.findOpenSpecRoot(changePath);
    if (!openspecRoot) {
      return '';
    }

    const specsDir = path.join(openspecRoot, 'specs');
    const changesDir = path.join(openspecRoot, 'changes');
    const archiveDir = path.join(changesDir, 'archive');

    const specNames = await WorkspaceUtils.listDirectories(specsDir);
    let requirementTotal = 0;
    for (const specName of specNames) {
      const specMd = path.join(specsDir, specName, 'spec.md');
      if (await WorkspaceUtils.fileExists(specMd)) {
        requirementTotal += await WorkspaceUtils.countRequirementsInSpec(specMd);
      }
    }

    const activeChanges = (await WorkspaceUtils.listDirectories(changesDir)).filter(name => name !== 'archive');
    const completedChanges = await WorkspaceUtils.listDirectories(archiveDir);

    return `
      <div class="summary">
        <div class="summary-item"><span class="summary-label">Specs</span><span class="summary-value">${specNames.length}</span></div>
        <div class="summary-item"><span class="summary-label">Requirements</span><span class="summary-value">${requirementTotal}</span></div>
        <div class="summary-item"><span class="summary-label">Active Changes</span><span class="summary-value">${activeChanges.length}</span></div>
        <div class="summary-item"><span class="summary-label">Completed</span><span class="summary-value">${completedChanges.length}</span></div>
      </div>
    `;
  }

  private findOpenSpecRoot(changePath: string): string | null {
    const parts = changePath.split(path.sep);
    const openspecIndex = parts.lastIndexOf('openspec');
    if (openspecIndex === -1) {
      return null;
    }
    return parts.slice(0, openspecIndex + 1).join(path.sep);
  }

  private setupWebviewMessageHandling(panel: vscode.WebviewPanel, _item: TreeItemData, _panelKey: string): void {
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openFile') {
        const fileUri = message.filepath
          ? vscode.Uri.file(message.filepath)
          : vscode.Uri.parse(message.uri);
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


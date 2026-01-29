import * as vscode from 'vscode';
import * as path from 'path';
import { marked } from 'marked';
import { WorkspaceUtils } from '../utils/workspace';
import { ErrorHandler } from '../utils/errorHandler';
import { TreeItemData } from '../types';

export class OpenSpecWebviewProvider implements vscode.WebviewPanelSerializer {
  private _panels = new Map<string, vscode.WebviewPanel>();
  private _extensionUri: vscode.Uri;

  private escapeAttr(value: string): string {
    return value.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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

  async deserializeWebviewPanel(_webviewPanel: vscode.WebviewPanel, _state: unknown) {
    ErrorHandler.debug('Deserializing webview panel');
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

    const { proposalContent, designContent, tasksContent, specsList, summaryHtml } = await this.buildChangeContent(item);

    const escapeAttr = (value: string): string => this.escapeAttr(value);

    const proposalFilePath = item.type === 'change' && item.path ? path.join(item.path, 'proposal.md') : '';
    const designFilePath = item.type === 'change' && item.path ? path.join(item.path, 'design.md') : '';
    const tasksFilePath = item.type === 'change' && item.path ? path.join(item.path, 'tasks.md') : '';

    const renderArtifactActions = (filePath: string, label: string): string => {
      if (!filePath) {
        return '';
      }
      return `
        <div class="artifact-actions">
          <button type="button" class="artifact-open" data-open-file="${escapeAttr(filePath)}" aria-label="Open ${label}">
            Open ${label}
          </button>
        </div>
      `;
    };

    const isEmptyChange = item.type === 'change'
      && typeof item.path === 'string'
      && !(await WorkspaceUtils.hasAnyChangeArtifacts(item.path));

    const emptyStateHtml = isEmptyChange ? this.renderEmptyStatePanel(item) : '';
    const isOpenCodeListening = await WorkspaceUtils.isOpenCodeServerListening();
    const openCodeDotClass = isOpenCodeListening ? 'opencode-dot is-started' : 'opencode-dot is-stopped';
    const openCodeDotTooltip = isOpenCodeListening ? 'OpenCode started' : 'OpenCode not started';
    const openCodeStartLabel = isOpenCodeListening ? 'OpenCode Running' : 'Start OpenCode';
    const openCodeStartTooltip = isOpenCodeListening
      ? 'OpenCode already started'
      : 'Start OpenCode server on port 4099';
 
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
                    <div class="header-title-left">
                      <h1>${item.label}</h1>
                      ${this.renderStatusBadge(item)}
                    </div>
                     <div class="header-controls">
                       <button
                         type="button"
                         class="${openCodeDotClass}"
                         title="${openCodeDotTooltip}"
                         aria-label="${openCodeDotTooltip}"
                         data-opencode-status="${isOpenCodeListening ? 'started' : 'stopped'}"
                       ></button>
                       <button
                         type="button"
                         class="opencode-start"
                         data-opencode-start
                         ${isOpenCodeListening ? 'disabled aria-disabled="true"' : ''}
                         title="${openCodeStartTooltip}"
                         aria-label="${openCodeStartTooltip}"
                       >${openCodeStartLabel}</button>
                     </div>
                    </div>
                    ${summaryHtml}
                </header>

              <div class="content">
                    ${emptyStateHtml}
                    ${proposalContent ? `
                         <div class="collapsible-section" data-section="proposal">
                             <button class="section-header" tabindex="0" aria-expanded="true" aria-controls="proposal-content">
                                 <span class="section-title">Proposal</span>
                                 <span class="collapse-icon">▼</span>
                             </button>
                             <div id="proposal-content" class="section-content markdown-content">
                                 ${renderArtifactActions(proposalFilePath, 'proposal.md')}
                                 ${proposalContent}
                             </div>
                         </div>
                     ` : ''}

                    ${designContent ? `
                        <div class="collapsible-section" data-section="design">
                            <button class="section-header" tabindex="0" aria-expanded="true" aria-controls="design-content">
                                <span class="section-title">Design</span>
                                <span class="collapse-icon">▼</span>
                            </button>
                            <div id="design-content" class="section-content markdown-content">
                                ${renderArtifactActions(designFilePath, 'design.md')}
                                ${designContent}
                            </div>
                        </div>
                    ` : ''}

                    ${tasksContent ? `
                        <div class="collapsible-section" data-section="tasks">
                            <button class="section-header" tabindex="0" aria-expanded="true" aria-controls="tasks-content">
                                <span class="section-title">Tasks</span>
                                <span class="collapse-icon">▼</span>
                            </button>
                            <div
                              id="tasks-content"
                              class="section-content markdown-content"
                              data-openspec-artifact-file="${escapeAttr(tasksFilePath)}"
                            >
                                ${renderArtifactActions(tasksFilePath, 'tasks.md')}
                                <div data-openspec-artifact-body>
                                  ${tasksContent}
                                </div>
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

  private renderEmptyStatePanel(item: TreeItemData): string {
    const changeId = item.type === 'change' ? item.label : '';
    const isActive = item.metadata?.isActive === true;
    const isScaffoldOnly = item.metadata?.isScaffoldOnly === true;
    const actionLabel = (isActive && isScaffoldOnly) ? 'Fast-forward artifacts' : 'Attach to OpenCode';
    const actionTooltip = (isActive && isScaffoldOnly)
      ? `Fast-forward: populate ${changeId}`
      : 'Attach to OpenCode at http://localhost:4099';
    const actionIcon = (isActive && isScaffoldOnly) ? '&gt;&gt;' : '&gt;';
    const hint = (isActive && isScaffoldOnly)
      ? `Runs: opencode run --attach localhost:4099 --continue "use openspec ff skill to populate ${changeId}"`
      : 'Runs the bundled Ralph runner (no workspace files created)';

    return `
      <section class="empty-state" aria-label="Empty change">
        <h2 class="empty-state-title">No artifacts yet</h2>
        <p class="empty-state-body">This change has no proposal, design, tasks, or specs. Add an artifact to get started.</p>
        <div class="empty-state-actions">
          <button
            type="button"
            class="cta-button"
            ${isActive && isScaffoldOnly
              ? `data-openspec-ff-change="${this.escapeAttr(changeId)}"`
              : 'data-opencode-attach="http://localhost:4099"'}
            aria-label="${this.escapeAttr(actionTooltip)}"
          >${actionLabel}<span class="cta-icon" aria-hidden="true">${actionIcon}</span></button>
          <p class="empty-state-hint">${hint}</p>
        </div>
      </section>
    `;
  }



  private async renderFilesList(item: TreeItemData): Promise<string> {
    if (!item.path) {
      return '';
    }

    try {
      const files = (await WorkspaceUtils.listFiles(item.path, ''))
        .filter(fileName => fileName !== 'proposal.md' && fileName !== 'design.md' && fileName !== 'tasks.md');
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
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'rendering files list', false);
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
    designContent: string;
    tasksContent: string;
    specsList: string;
    summaryHtml: string;
  }> {
    let proposalContent = '';
    let designContent = '';
    let tasksContent = '';
    let specsList = '';
    let summaryHtml = '';

    if (item.type !== 'change' || !item.path) {
      return { proposalContent, designContent, tasksContent, specsList, summaryHtml };
    }

    try {
      const proposalPath = path.join(item.path, 'proposal.md');
      if (await WorkspaceUtils.fileExists(proposalPath)) {
        const proposalMarkdown = await WorkspaceUtils.readFile(proposalPath);
        proposalContent = marked(proposalMarkdown);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'reading proposal.md', false);
    }

    try {
      const designPath = path.join(item.path, 'design.md');
      if (await WorkspaceUtils.fileExists(designPath)) {
        const designMarkdown = await WorkspaceUtils.readFile(designPath);
        designContent = marked(designMarkdown);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'reading design.md', false);
    }

    try {
      const tasksPath = path.join(item.path, 'tasks.md');
      if (await WorkspaceUtils.fileExists(tasksPath)) {
        const tasksMarkdown = await WorkspaceUtils.readFile(tasksPath);
        tasksContent = marked(tasksMarkdown);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'reading tasks.md', false);
    }

    try {
      // Specs are scoped to the selected change:
      // `openspec/changes/<change>/specs/*/spec.md` (or archived change path).
      // Prefer `item.path/specs`, but fall back to `item.path/<change>/specs` if needed.
      const directSpecsDir = path.join(item.path, 'specs');
      const nestedSpecsDir = path.join(item.path, item.label, 'specs');

      const specsDir = (await WorkspaceUtils.fileExists(directSpecsDir))
        ? directSpecsDir
        : ((await WorkspaceUtils.fileExists(nestedSpecsDir)) ? nestedSpecsDir : directSpecsDir);

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
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorHandler.handle(err, 'building specs list', false);
    }

    // Summary section removed as requested
    
    return { proposalContent, designContent, tasksContent, specsList, summaryHtml };
  }

  private async buildSummary(_changePath: string): Promise<string> {
    // Always scope to the workspace-root ./openspec folder.
    // Do not infer an OpenSpec root from arbitrary/nested paths.
    const openspecRoot = this.getWorkspaceOpenSpecRoot();
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

  private getWorkspaceOpenSpecRoot(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }
    return WorkspaceUtils.getOpenSpecRoot(workspaceFolder);
  }

  private setupWebviewMessageHandling(panel: vscode.WebviewPanel, item: TreeItemData, _panelKey: string): void {
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openFile') {
        const fileUri = message.filepath
          ? vscode.Uri.file(message.filepath)
          : vscode.Uri.parse(message.uri);
        const preview = typeof message.preview === 'boolean' ? message.preview : true;
        await vscode.commands.executeCommand('vscode.open', fileUri, { preview });
      } else if (message.type === 'opencodeAttachClicked') {
        const url = typeof message.url === 'string' ? message.url : 'http://localhost:4099';
        // Task 4.3: generate runner + run it attached in a terminal
        await vscode.commands.executeCommand('openspec.opencode.runRunnerAttached', url);
      } else if (message.type === 'openspecFastForwardClicked') {
        const changeId = typeof message.changeId === 'string' ? message.changeId : '';
        if (!changeId || item.type !== 'change' || item.label !== changeId) {
          return;
        }
        // Delegate to the explorer command implementation so the same safeguards apply.
        await vscode.commands.executeCommand('openspec.ffChange', item);

        // Best-effort refresh so the empty state/button updates as artifacts appear.
        try {
          panel.webview.html = await this.getHtmlContent(panel.webview, item);
        } catch {
          // ignore
        }
      } else if (message.type === 'opencodeDotClicked') {
        // Task 2.2: UI-only control. Backend command wiring is handled in task 2.3.
        const status = typeof message.status === 'string' ? message.status : undefined;
        if (status === 'started') {
          return;
        }
 
        vscode.commands.executeCommand('openspec.opencode.startServer');
      } else if (message.type === 'opencodeStartClicked') {
        // Explicit button (in addition to the dot) to start `opencode serve --port 4099`.
        vscode.commands.executeCommand('openspec.opencode.startServer');
      } else if (message.type === 'opencodeStatusRequest') {
        try {
          const isListening = await WorkspaceUtils.isOpenCodeServerListening();
          panel.webview.postMessage({
            type: 'opencodeStatusResponse',
            isListening
          });
        } catch (error) {
          panel.webview.postMessage({
            type: 'opencodeStatusResponse',
            isListening: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
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

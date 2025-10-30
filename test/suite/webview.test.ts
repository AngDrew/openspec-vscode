import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { OpenSpecWebviewProvider } from '../../src/providers/webviewProvider';
import { TreeItemData } from '../../src/types';

suite('Webview Provider Test Suite', () => {
  let webviewProvider: OpenSpecWebviewProvider;
  const testExtensionUri = vscode.Uri.file(path.join(__dirname, '../../../'));

  setup(() => {
    webviewProvider = new OpenSpecWebviewProvider(testExtensionUri);
  });

  test('Should create webview provider', () => {
    assert.ok(webviewProvider);
  });

  test('Should generate file links with correct attributes', async () => {
    const testItem: TreeItemData = {
      id: 'test-change',
      label: 'Test Change',
      path: path.join(__dirname, '../../../openspec/changes/add-vscode-extension'),
      type: 'change',
      metadata: { isActive: true }
    };

    // Create a mock webview
    const mockWebview: vscode.Webview = {
      asWebviewUri: (uri: vscode.Uri) => uri.toString(),
      cspSource: 'test-csp',
      html: ''
    } as any;

    // Test HTML content generation
    const htmlContent = await (webviewProvider as any).getHtmlContent(mockWebview, testItem);
    
    // Verify that file links are generated with correct attributes
    assert.ok(htmlContent.includes('data-command="vscode.open"'), 'HTML should contain file links with vscode.open command');
    assert.ok(htmlContent.includes('class="file-link"'), 'HTML should contain file links with correct CSS class');
    assert.ok(htmlContent.includes('data-args='), 'HTML should contain file links with data arguments');
  });

  test('Should handle file open messages correctly', async () => {
    const testItem: TreeItemData = {
      id: 'test-change',
      label: 'Test Change',
      path: path.join(__dirname, '../../../openspec/changes/add-vscode-extension'),
      type: 'change',
      metadata: { isActive: true }
    };

    // Create a mock panel with message handling
    let receivedMessage: any = null;
    const mockPanel: vscode.WebviewPanel = {
      webview: {
        onDidReceiveMessage: (callback: (message: any) => any) => {
          // Simulate receiving an openFile message
          const testMessage = {
            type: 'openFile',
            uri: vscode.Uri.file(path.join(testItem.path!, 'proposal.md')).toString()
          };
          receivedMessage = callback(testMessage);
        }
      }
    } as any;

    // Test message handling setup
    (webviewProvider as any).setupWebviewMessageHandling(mockPanel, testItem);
    
    // Verify that message handling is set up (the callback should be callable)
    assert.ok(receivedMessage !== null, 'Message handling should be set up');
  });
});
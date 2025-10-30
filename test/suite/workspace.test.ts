import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceUtils } from '../../src/utils/workspace';

suite('Workspace Utils Test Suite', () => {
  let workspaceFolder: vscode.WorkspaceFolder;

  suiteSetup(() => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder found for testing');
    }
    workspaceFolder = workspaceFolders[0];
  });

  test('Should detect OpenSpec workspace', async () => {
    const isInitialized = await WorkspaceUtils.isOpenSpecInitialized(workspaceFolder);
    assert.strictEqual(typeof isInitialized, 'boolean');
  });

  test('Should return correct paths', () => {
    const rootPath = WorkspaceUtils.getOpenSpecRoot(workspaceFolder);
    const changesPath = WorkspaceUtils.getChangesDir(workspaceFolder);
    const specsPath = WorkspaceUtils.getSpecsDir(workspaceFolder);
    const archivePath = WorkspaceUtils.getArchiveDir(workspaceFolder);

    assert.ok(rootPath.endsWith('openspec'));
    assert.ok(changesPath.endsWith('openspec/changes'));
    assert.ok(specsPath.endsWith('openspec/specs'));
    assert.ok(archivePath.endsWith('openspec/changes/archive'));
  });

  test('Should handle file existence checks', async () => {
    const exists = await WorkspaceUtils.fileExists(workspaceFolder.uri.fsPath);
    assert.strictEqual(exists, true);
  });

  test('Should handle non-existent files', async () => {
    const nonExistentPath = `${workspaceFolder.uri.fsPath}/non-existent-file.txt`;
    const exists = await WorkspaceUtils.fileExists(nonExistentPath);
    assert.strictEqual(exists, false);
  });
});
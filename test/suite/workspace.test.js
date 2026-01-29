"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const workspace_1 = require("../../src/utils/workspace");
suite('Workspace Utils Test Suite', () => {
    let workspaceFolder;
    suiteSetup(() => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder found for testing');
        }
        workspaceFolder = workspaceFolders[0];
    });
    test('Should detect OpenSpec workspace', async () => {
        const isInitialized = await workspace_1.WorkspaceUtils.isOpenSpecInitialized(workspaceFolder);
        assert.strictEqual(typeof isInitialized, 'boolean');
    });
    test('Should return correct paths', () => {
        const rootPath = workspace_1.WorkspaceUtils.getOpenSpecRoot(workspaceFolder);
        const changesPath = workspace_1.WorkspaceUtils.getChangesDir(workspaceFolder);
        const specsPath = workspace_1.WorkspaceUtils.getSpecsDir(workspaceFolder);
        const archivePath = workspace_1.WorkspaceUtils.getArchiveDir(workspaceFolder);
        assert.ok(rootPath.endsWith('openspec'));
        assert.ok(changesPath.endsWith('openspec/changes'));
        assert.ok(specsPath.endsWith('openspec/specs'));
        assert.ok(archivePath.endsWith('openspec/changes/archive'));
    });
    test('Should handle file existence checks', async () => {
        const exists = await workspace_1.WorkspaceUtils.fileExists(workspaceFolder.uri.fsPath);
        assert.strictEqual(exists, true);
    });
    test('Should handle non-existent files', async () => {
        const nonExistentPath = `${workspaceFolder.uri.fsPath}/non-existent-file.txt`;
        const exists = await workspace_1.WorkspaceUtils.fileExists(nonExistentPath);
        assert.strictEqual(exists, false);
    });
});
//# sourceMappingURL=workspace.test.js.map
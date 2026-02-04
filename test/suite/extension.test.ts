import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('AngDrew.openspec-vscode-dev'));
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('AngDrew.openspec-vscode-dev');
    if (extension) {
      await extension.activate();
      assert.ok(true);
    } else {
      assert.fail('Extension not found');
    }
  });

  test('Should register commands', async () => {
    const commands = await vscode.commands.getCommands();
    
    const expectedCommands = [
      'openspec.chat.open',
      'openspec.chat.messageSent',
      'openspec.chat.cancelStreaming'
    ];

    expectedCommands.forEach(command => {
      assert.ok(commands.includes(command), `Command ${command} should be registered`);
    });
  });
});

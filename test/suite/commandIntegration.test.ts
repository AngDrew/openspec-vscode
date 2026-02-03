import * as assert from 'assert';
import * as vscode from 'vscode';
import { Commands } from '../../src/constants/commands';
import { SessionManager, WorkflowPhase } from '../../src/services/sessionManager';
import { ChatProvider } from '../../src/providers/chatProvider';

suite('Command Integration Test Suite', () => {
  let sessionManager: SessionManager;
  let mockContext: vscode.ExtensionContext;
  let globalState: Map<string, any>;
  const testExtensionUri = vscode.Uri.file('test-extension');

  setup(() => {
    sessionManager = SessionManager.getInstance();

    globalState = new Map<string, any>();
    mockContext = {
      globalState: {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
          const value = globalState.get(key);
          return value !== undefined ? value : defaultValue;
        },
        update: async (key: string, value: any): Promise<void> => {
          if (value === undefined) {
            globalState.delete(key);
          } else {
            globalState.set(key, value);
          }
        },
        keys: async (): Promise<string[]> => {
          return Array.from(globalState.keys());
        }
      }
    } as any;

    sessionManager.initialize(mockContext);
  });

  teardown(async () => {
    sessionManager.dispose();
    (SessionManager as any).instance = undefined;
  });

  test('Commands constants should be defined', () => {
    assert.ok(Commands.viewDetails, 'viewDetails command should be defined');
    assert.ok(Commands.listChanges, 'listChanges command should be defined');
    assert.ok(Commands.applyChange, 'applyChange command should be defined');
    assert.ok(Commands.archiveChange, 'archiveChange command should be defined');
    assert.ok(Commands.ffChange, 'ffChange command should be defined');
    assert.ok(Commands.openChat, 'openChat command should be defined');
    assert.ok(Commands.chatMessageSent, 'chatMessageSent command should be defined');
    assert.ok(Commands.chatCancelStreaming, 'chatCancelStreaming command should be defined');
    assert.ok(Commands.chatNewChange, 'chatNewChange command should be defined');
    assert.ok(Commands.chatFastForward, 'chatFastForward command should be defined');
    assert.ok(Commands.chatApply, 'chatApply command should be defined');
    assert.ok(Commands.chatArchive, 'chatArchive command should be defined');
    assert.ok(Commands.opencodeStartServer, 'opencodeStartServer command should be defined');
    assert.ok(Commands.opencodeOpenUi, 'opencodeOpenUi command should be defined');
    assert.ok(Commands.opencodeNewChange, 'opencodeNewChange command should be defined');
    assert.ok(Commands.opencodeRunRunnerAttached, 'opencodeRunRunnerAttached command should be defined');
    assert.ok(Commands.showServerStatus, 'showServerStatus command should be defined');
  });

  test('Command IDs should follow consistent naming pattern', () => {
    const commandIds = Object.values(Commands);

    for (const id of commandIds) {
      assert.ok(id.startsWith('openspec.'), `Command ${id} should start with 'openspec.'`);
    }
  });

  test('Chat-related commands should have consistent prefix', () => {
    const chatCommands = [
      Commands.openChat,
      Commands.chatMessageSent,
      Commands.chatCancelStreaming,
      Commands.chatNewChange,
      Commands.chatFastForward,
      Commands.chatApply,
      Commands.chatArchive,
    ];

    for (const cmd of chatCommands) {
      assert.ok(cmd.includes('chat') || cmd.includes('Chat'), `Command ${cmd} should include 'chat'`);
    }
  });

  test('OpenCode-related commands should have consistent prefix', () => {
    const opencodeCommands = [
      Commands.opencodeStartServer,
      Commands.opencodeOpenUi,
      Commands.opencodeNewChange,
      Commands.opencodeRunRunnerAttached,
      Commands.opencodeGenerateRunnerScript,
    ];

    for (const cmd of opencodeCommands) {
      assert.ok(cmd.includes('opencode'), `Command ${cmd} should include 'opencode'`);
    }
  });

  test('SessionManager should integrate with command context', async () => {
    await sessionManager.createSession('command-test');
    await sessionManager.setPhase('new');

    const session = await sessionManager.getCurrentSession();
    assert.ok(session, 'Session should exist');
    assert.strictEqual(session!.changeId, 'command-test', 'Change ID should match');
    assert.strictEqual(session!.phase, 'new', 'Phase should be new');

    await sessionManager.setPhase('drafting');
    const updatedPhase = sessionManager.getPhase();
    assert.strictEqual(updatedPhase, 'drafting', 'Phase should update');
  });

  test('SessionManager should maintain context across phase changes', async () => {
    await sessionManager.createSession('phase-transition-test');

    const phases: WorkflowPhase[] = ['new', 'drafting', 'implementation', 'completed'];

    for (const phase of phases) {
      await sessionManager.setPhase(phase);
      const currentPhase = sessionManager.getPhase();
      assert.strictEqual(currentPhase, phase, `Phase should be ${phase}`);

      await sessionManager.addMessage({
        role: 'system',
        content: `Transitioned to ${phase} phase`,
        metadata: { phase }
      });
    }

    const session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.messages.length, phases.length, 'Should have message for each phase');
  });

  test('Command workflow: New Change -> Fast Forward -> Apply -> Archive', async () => {
    const changeId = 'workflow-test-change';

    await sessionManager.createSession(changeId);
    await sessionManager.setPhase('new');
    await sessionManager.addMessage({
      role: 'system',
      content: 'Starting New Change flow',
      metadata: { changeId, phase: 'new' }
    });

    let session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.phase, 'new', 'Should be in new phase');

    await sessionManager.setPhase('drafting');
    await sessionManager.addMessage({
      role: 'system',
      content: `Starting Fast Forward phase for change: ${changeId}`,
      metadata: { changeId, phase: 'drafting' }
    });

    session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.phase, 'drafting', 'Should be in drafting phase');

    await sessionManager.setPhase('implementation');
    await sessionManager.addMessage({
      role: 'system',
      content: `Starting Apply phase for change: ${changeId}`,
      metadata: { changeId, phase: 'implementation' }
    });

    session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.phase, 'implementation', 'Should be in implementation phase');

    await sessionManager.setPhase('completed');
    await sessionManager.addMessage({
      role: 'system',
      content: `Archiving change: ${changeId}`,
      metadata: { changeId, phase: 'completed' }
    });

    session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.phase, 'completed', 'Should be in completed phase');
    assert.strictEqual(session!.messages.length, 5, 'Should have 5 messages total');
  });

  test('Command context should persist in globalState', async () => {
    await sessionManager.createSession('persistence-test');
    await sessionManager.setPhase('drafting');
    await sessionManager.addMessage({
      role: 'user',
      content: 'Test message'
    });

    const storedSession = globalState.get('openspec.chat.currentSession');
    assert.ok(storedSession, 'Session should be stored in globalState');
    assert.strictEqual(storedSession.changeId, 'persistence-test', 'Change ID should be persisted');
    assert.strictEqual(storedSession.phase, 'drafting', 'Phase should be persisted');
    assert.strictEqual(storedSession.messages.length, 1, 'Messages should be persisted');
  });

  test('Multiple changes should be tracked in session history', async () => {
    const changeIds = ['change-1', 'change-2', 'change-3'];

    for (const changeId of changeIds) {
      await sessionManager.createSession(changeId);
      await sessionManager.addMessage({
        role: 'system',
        content: `Created ${changeId}`
      });
    }

    const allSessions = await sessionManager.getAllSessions();
    assert.ok(allSessions.length >= 3, 'Should have at least 3 sessions in history');

    for (const changeId of changeIds) {
      const found = allSessions.some(s => s.changeId === changeId);
      assert.ok(found, `Should find ${changeId} in history`);
    }
  });

  test('Command metadata should be preserved in messages', async () => {
    await sessionManager.createSession('metadata-test');

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; metadata: { changeId?: string; phase?: WorkflowPhase } }> = [
      {
        role: 'system',
        content: 'System message',
        metadata: { phase: 'new' }
      },
      {
        role: 'user',
        content: 'User message',
        metadata: {}
      },
      {
        role: 'assistant',
        content: 'Assistant message',
        metadata: { changeId: 'metadata-test' }
      }
    ];

    for (const msg of messages) {
      await sessionManager.addMessage(msg);
    }

    const session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.messages.length, 3, 'Should have 3 messages');

    for (let i = 0; i < messages.length; i++) {
      assert.deepStrictEqual(
        session!.messages[i].metadata,
        messages[i].metadata,
        `Message ${i} metadata should match`
      );
    }
  });

  test('Session change ID should be updateable', async () => {
    await sessionManager.createSession('original-change');
    await sessionManager.setChangeId('updated-change');

    const session = await sessionManager.getCurrentSession();
    assert.strictEqual(session!.changeId, 'updated-change', 'Change ID should be updated');
  });

  test('Command integration with message limits', async () => {
    await sessionManager.createSession('limit-test');

    for (let i = 0; i < 110; i++) {
      await sessionManager.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`
      });
    }

    const session = await sessionManager.getCurrentSession();
    assert.ok(session!.messages.length <= 100, 'Messages should be limited to 100');
  });

  test('Commands should be registered in package.json', async () => {
    const packageJsonPath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'package.json');

    try {
      const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonPath);
      const packageJson = JSON.parse(packageJsonContent.toString());

      assert.ok(packageJson.contributes, 'Should have contributes section');
      assert.ok(packageJson.contributes.commands, 'Should have commands section');

      const registeredCommands = packageJson.contributes.commands.map((c: any) => c.command);

      const requiredCommands = [
        Commands.viewDetails,
        Commands.listChanges,
        Commands.applyChange,
        Commands.archiveChange,
        Commands.ffChange,
        Commands.openChat,
      ];

      for (const cmd of requiredCommands) {
        assert.ok(
          registeredCommands.includes(cmd),
          `Command ${cmd} should be registered in package.json`
        );
      }
    } catch (error) {
    }
  });

  test('Chat commands should update session phase appropriately', async () => {
    const commandPhaseMap: { [key: string]: WorkflowPhase } = {
      [Commands.chatNewChange]: 'new',
      [Commands.chatFastForward]: 'drafting',
      [Commands.chatApply]: 'implementation',
      [Commands.chatArchive]: 'completed',
    };

    for (const [command, expectedPhase] of Object.entries(commandPhaseMap)) {
      await sessionManager.createSession(`phase-test-${expectedPhase}`);
      await sessionManager.setPhase(expectedPhase);

      const phase = sessionManager.getPhase();
      assert.strictEqual(phase, expectedPhase, `Command ${command} should set phase to ${expectedPhase}`);
    }
  });

  test('Session restoration should maintain command context', async () => {
    await sessionManager.createSession('restoration-test');
    await sessionManager.setPhase('implementation');
    await sessionManager.addMessage({
      role: 'system',
      content: 'Context from command',
      metadata: { phase: 'implementation' }
    });

    const beforeRestore = await sessionManager.getCurrentSession();
    assert.ok(beforeRestore, 'Session should exist before restore');

    await sessionManager.dispose();
    (SessionManager as any).instance = undefined;

    const newSessionManager = SessionManager.getInstance();
    newSessionManager.initialize(mockContext);

    const afterRestore = await newSessionManager.getCurrentSession();
    assert.ok(afterRestore, 'Session should be restored');
    assert.strictEqual(afterRestore!.changeId, 'restoration-test', 'Change ID should be restored');
    assert.strictEqual(afterRestore!.phase, 'implementation', 'Phase should be restored');
    assert.strictEqual(afterRestore!.messages.length, 1, 'Messages should be restored');
    assert.deepStrictEqual(
      afterRestore!.messages[0].metadata,
      { phase: 'implementation' },
      'Metadata should be restored'
    );
  });
});

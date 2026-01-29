import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

function normSlashes(p: string) {
  return p.replace(/\\/g, '/');
}

async function pathExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

suite('Ralph Runner Test Suite', () => {
  test('Default run (no --count) completes exactly one task and exits 0', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-vscode-runner-'));

    try {
      const changeName = 'test-change';
      const tasksFile = path.join(tmpRoot, 'openspec', 'changes', changeName, 'tasks.md');
      await fs.mkdir(path.dirname(tasksFile), { recursive: true });

      await fs.writeFile(
        tasksFile,
        [
          '## Tasks',
          '',
          '- [ ] 1.1 First task',
          '- [ ] 1.2 Second task',
          '',
        ].join('\n'),
        'utf8'
      );

      const fakeBin = path.join(tmpRoot, 'fake-bin');
      await fs.mkdir(fakeBin, { recursive: true });

      const opencodeJs = path.join(fakeBin, 'opencode.js');
      await fs.writeFile(
        opencodeJs,
        [
          "const fs = require('fs');",
          '',
          'function readStdin() {',
          '  return new Promise((resolve) => {',
          "    let buf = '';",
          "    process.stdin.setEncoding('utf8');",
          "    process.stdin.on('data', (c) => (buf += c));",
          "    process.stdin.on('end', () => resolve(buf));",
          '  });',
          '}',
          '',
          'function markTaskDone(tasksFile, tid) {',
          "  const text = fs.readFileSync(tasksFile, 'utf8');",
          '  const needle = `- [ ] ${tid}`;',
          "  if (!text.includes(needle)) return false;",
          "  const updated = text.replace(needle, `- [x] ${tid}`);",
          "  fs.writeFileSync(tasksFile, updated, 'utf8');",
          '  return true;',
          '}',
          '',
          '(async () => {',
          '  // The runner passes the full prompt via stdin.',
          '  const input = await readStdin();',
          "  const tidMatch = input.match(/^Work on EXACTLY ONE task: ([0-9]+(\\.[0-9]+)*)$/m);",
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!tidMatch || !fileMatch) {",
          "    process.stderr.write('fake opencode: missing tid/tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tid = tidMatch[1];",
          "  const tasksFile = fileMatch[1].trim();",
          '  if (!markTaskDone(tasksFile, tid)) {',
          "    process.stderr.write(`fake opencode: could not mark ${tid} in ${tasksFile}\\n`);",
          '    process.exit(3);',
          '  }',
          '  process.exit(0);',
          '})();',
          '',
        ].join('\n'),
        'utf8'
      );

      const isWin = process.platform === 'win32';
      if (isWin) {
        const opencodeCmd = path.join(fakeBin, 'opencode.cmd');
        await fs.writeFile(
          opencodeCmd,
          ['@echo off', 'node "%~dp0opencode.js" %*'].join('\r\n') + '\r\n',
          'utf8'
        );
      } else {
        const opencodeSh = path.join(fakeBin, 'opencode');
        await fs.writeFile(opencodeSh, ['#!/usr/bin/env sh', 'node "$(dirname "$0")/opencode.js" "$@"'].join('\n') + '\n', 'utf8');
        await fs.chmod(opencodeSh, 0o755);
      }

      assert.ok(await pathExists(tasksFile), `Expected tasks file to exist at ${tasksFile}`);

      const runnerPath = path.join(__dirname, '..', '..', 'ralph_opencode.mjs');
      const env = {
        ...process.env,
        OPENCODE_NPX_PKG: 'this-should-not-be-used',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      };

      const res = spawnSync(process.execPath, [runnerPath, '--change', changeName], {
        cwd: tmpRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      assert.strictEqual(res.status, 0, `Runner should exit 0. stderr=\n${res.stderr}`);
      assert.ok(res.stdout.includes('Tasks/run  : 1'), 'Runner should default tasks-per-run to 1');

      const updated = await fs.readFile(tasksFile, 'utf8');
      assert.ok(updated.includes('- [x] 1.1'), 'Runner should complete the first task');
      assert.ok(updated.includes('- [ ] 1.2'), 'Runner should stop after completing exactly one task');

      // Helpful assertion when debugging path issues.
      assert.ok(normSlashes(res.stdout).includes(normSlashes(`Tasks file : openspec/changes/${changeName}/tasks.md`)));
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('--count 3 completes up to 3 tasks and stops (while preserving per-task verification)', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-vscode-runner-'));

    try {
      const changeName = 'test-change';
      const tasksFile = path.join(tmpRoot, 'openspec', 'changes', changeName, 'tasks.md');
      await fs.mkdir(path.dirname(tasksFile), { recursive: true });

      await fs.writeFile(
        tasksFile,
        [
          '## Tasks',
          '',
          '- [ ] 1.1 First task',
          '- [ ] 1.2 Second task',
          '- [ ] 1.3 Third task',
          '- [ ] 1.4 Fourth task',
          '- [ ] 1.5 Fifth task',
          '',
        ].join('\n'),
        'utf8'
      );

      const fakeBin = path.join(tmpRoot, 'fake-bin');
      await fs.mkdir(fakeBin, { recursive: true });

      const opencodeJs = path.join(fakeBin, 'opencode.js');
      await fs.writeFile(
        opencodeJs,
        [
          "const fs = require('fs');",
          '',
          'function readStdin() {',
          '  return new Promise((resolve) => {',
          "    let buf = '';",
          "    process.stdin.setEncoding('utf8');",
          "    process.stdin.on('data', (c) => (buf += c));",
          "    process.stdin.on('end', () => resolve(buf));",
          '  });',
          '}',
          '',
          'function markTaskDone(tasksFile, tid) {',
          "  const text = fs.readFileSync(tasksFile, 'utf8');",
          '  const needle = `- [ ] ${tid}`;',
          "  if (!text.includes(needle)) return false;",
          "  const updated = text.replace(needle, `- [x] ${tid}`);",
          "  fs.writeFileSync(tasksFile, updated, 'utf8');",
          '  return true;',
          '}',
          '',
          '(async () => {',
          '  const input = await readStdin();',
          "  const tidMatch = input.match(/^Work on EXACTLY ONE task: ([0-9]+(\\.[0-9]+)*)$/m);",
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!tidMatch || !fileMatch) {",
          "    process.stderr.write('fake opencode: missing tid/tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tid = tidMatch[1];",
          "  const tasksFile = fileMatch[1].trim();",
          '  if (!markTaskDone(tasksFile, tid)) {',
          "    process.stderr.write(`fake opencode: could not mark ${tid} in ${tasksFile}\\n`);",
          '    process.exit(3);',
          '  }',
          '  process.exit(0);',
          '})();',
          '',
        ].join('\n'),
        'utf8'
      );

      const isWin = process.platform === 'win32';
      if (isWin) {
        const opencodeCmd = path.join(fakeBin, 'opencode.cmd');
        await fs.writeFile(opencodeCmd, ['@echo off', 'node "%~dp0opencode.js" %*'].join('\r\n') + '\r\n', 'utf8');
      } else {
        const opencodeSh = path.join(fakeBin, 'opencode');
        await fs.writeFile(opencodeSh, ['#!/usr/bin/env sh', 'node "$(dirname "$0")/opencode.js" "$@"'].join('\n') + '\n', 'utf8');
        await fs.chmod(opencodeSh, 0o755);
      }

      assert.ok(await pathExists(tasksFile), `Expected tasks file to exist at ${tasksFile}`);

      const runnerPath = path.join(__dirname, '..', '..', 'ralph_opencode.mjs');
      const env = {
        ...process.env,
        OPENCODE_NPX_PKG: 'this-should-not-be-used',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      };

      const res = spawnSync(process.execPath, [runnerPath, '--change', changeName, '--count', '3'], {
        cwd: tmpRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      assert.strictEqual(res.status, 0, `Runner should exit 0. stderr=\n${res.stderr}`);
      assert.ok(res.stdout.includes('Tasks/run  : 3'), 'Runner should report tasks-per-run=3');

      const updated = await fs.readFile(tasksFile, 'utf8');
      assert.ok(updated.includes('- [x] 1.1'), 'Runner should complete the first task');
      assert.ok(updated.includes('- [x] 1.2'), 'Runner should complete the second task');
      assert.ok(updated.includes('- [x] 1.3'), 'Runner should complete the third task');
      assert.ok(updated.includes('- [ ] 1.4'), 'Runner should stop after completing 3 tasks');
      assert.ok(updated.includes('- [ ] 1.5'), 'Runner should stop after completing 3 tasks');
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('--count 3 stops early when all tasks are complete', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-vscode-runner-'));

    try {
      const changeName = 'test-change';
      const tasksFile = path.join(tmpRoot, 'openspec', 'changes', changeName, 'tasks.md');
      await fs.mkdir(path.dirname(tasksFile), { recursive: true });

      await fs.writeFile(
        tasksFile,
        [
          '## Tasks',
          '',
          '- [ ] 1.1 First task',
          '- [ ] 1.2 Second task',
          '',
        ].join('\n'),
        'utf8'
      );

      const fakeBin = path.join(tmpRoot, 'fake-bin');
      await fs.mkdir(fakeBin, { recursive: true });

      const opencodeJs = path.join(fakeBin, 'opencode.js');
      await fs.writeFile(
        opencodeJs,
        [
          "const fs = require('fs');",
          '',
          'function readStdin() {',
          '  return new Promise((resolve) => {',
          "    let buf = '';",
          "    process.stdin.setEncoding('utf8');",
          "    process.stdin.on('data', (c) => (buf += c));",
          "    process.stdin.on('end', () => resolve(buf));",
          '  });',
          '}',
          '',
          'function markTaskDone(tasksFile, tid) {',
          "  const text = fs.readFileSync(tasksFile, 'utf8');",
          '  const needle = `- [ ] ${tid}`;',
          "  if (!text.includes(needle)) return false;",
          "  const updated = text.replace(needle, `- [x] ${tid}`);",
          "  fs.writeFileSync(tasksFile, updated, 'utf8');",
          '  return true;',
          '}',
          '',
          '(async () => {',
          '  const input = await readStdin();',
          "  const tidMatch = input.match(/^Work on EXACTLY ONE task: ([0-9]+(\\.[0-9]+)*)$/m);",
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!tidMatch || !fileMatch) {",
          "    process.stderr.write('fake opencode: missing tid/tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tid = tidMatch[1];",
          "  const tasksFile = fileMatch[1].trim();",
          '  if (!markTaskDone(tasksFile, tid)) {',
          "    process.stderr.write(`fake opencode: could not mark ${tid} in ${tasksFile}\\n`);",
          '    process.exit(3);',
          '  }',
          '  process.exit(0);',
          '})();',
          '',
        ].join('\n'),
        'utf8'
      );

      const isWin = process.platform === 'win32';
      if (isWin) {
        const opencodeCmd = path.join(fakeBin, 'opencode.cmd');
        await fs.writeFile(opencodeCmd, ['@echo off', 'node "%~dp0opencode.js" %*'].join('\r\n') + '\r\n', 'utf8');
      } else {
        const opencodeSh = path.join(fakeBin, 'opencode');
        await fs.writeFile(opencodeSh, ['#!/usr/bin/env sh', 'node "$(dirname "$0")/opencode.js" "$@"'].join('\n') + '\n', 'utf8');
        await fs.chmod(opencodeSh, 0o755);
      }

      assert.ok(await pathExists(tasksFile), `Expected tasks file to exist at ${tasksFile}`);

      const runnerPath = path.join(__dirname, '..', '..', 'ralph_opencode.mjs');
      const env = {
        ...process.env,
        OPENCODE_NPX_PKG: 'this-should-not-be-used',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      };

      const res = spawnSync(process.execPath, [runnerPath, '--change', changeName, '--count', '3'], {
        cwd: tmpRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      assert.strictEqual(res.status, 0, `Runner should exit 0. stderr=\n${res.stderr}`);
      assert.ok(res.stdout.includes('All tasks completed. Stopping early'), 'Runner should stop early when all tasks are done');

      const updated = await fs.readFile(tasksFile, 'utf8');
      assert.ok(updated.includes('- [x] 1.1'), 'Runner should complete the first task');
      assert.ok(updated.includes('- [x] 1.2'), 'Runner should complete the second task');
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('--count 3 enforces per-task check-off verification (fails if task not marked done)', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-vscode-runner-'));

    try {
      const changeName = 'test-change';
      const tasksFile = path.join(tmpRoot, 'openspec', 'changes', changeName, 'tasks.md');
      await fs.mkdir(path.dirname(tasksFile), { recursive: true });

      await fs.writeFile(
        tasksFile,
        [
          '## Tasks',
          '',
          '- [ ] 1.1 First task',
          '- [ ] 1.2 Second task',
          '- [ ] 1.3 Third task',
          '',
        ].join('\n'),
        'utf8'
      );

      const fakeBin = path.join(tmpRoot, 'fake-bin');
      await fs.mkdir(fakeBin, { recursive: true });

      const opencodeJs = path.join(fakeBin, 'opencode.js');
      await fs.writeFile(
        opencodeJs,
        [
          "const fs = require('fs');",
          '',
          'function readStdin() {',
          '  return new Promise((resolve) => {',
          "    let buf = '';",
          "    process.stdin.setEncoding('utf8');",
          "    process.stdin.on('data', (c) => (buf += c));",
          "    process.stdin.on('end', () => resolve(buf));",
          '  });',
          '}',
          '',
          'function markTaskDone(tasksFile, tid) {',
          "  const text = fs.readFileSync(tasksFile, 'utf8');",
          '  const needle = `- [ ] ${tid}`;',
          "  if (!text.includes(needle)) return false;",
          "  const updated = text.replace(needle, `- [x] ${tid}`);",
          "  fs.writeFileSync(tasksFile, updated, 'utf8');",
          '  return true;',
          '}',
          '',
          '(async () => {',
          '  const input = await readStdin();',
          "  const tidMatch = input.match(/^Work on EXACTLY ONE task: ([0-9]+(\\.[0-9]+)*)$/m);",
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!tidMatch || !fileMatch) {",
          "    process.stderr.write('fake opencode: missing tid/tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tid = tidMatch[1];",
          "  const tasksFile = fileMatch[1].trim();",
          '  // Simulate a no-op run that exits 0 but fails to check off task 1.2.',
          "  if (tid === '1.2') {",
          '    process.exit(0);',
          '  }',
          '  if (!markTaskDone(tasksFile, tid)) {',
          "    process.stderr.write(`fake opencode: could not mark ${tid} in ${tasksFile}\\n`);",
          '    process.exit(3);',
          '  }',
          '  process.exit(0);',
          '})();',
          '',
        ].join('\n'),
        'utf8'
      );

      const isWin = process.platform === 'win32';
      if (isWin) {
        const opencodeCmd = path.join(fakeBin, 'opencode.cmd');
        await fs.writeFile(opencodeCmd, ['@echo off', 'node "%~dp0opencode.js" %*'].join('\r\n') + '\r\n', 'utf8');
      } else {
        const opencodeSh = path.join(fakeBin, 'opencode');
        await fs.writeFile(opencodeSh, ['#!/usr/bin/env sh', 'node "$(dirname "$0")/opencode.js" "$@"'].join('\n') + '\n', 'utf8');
        await fs.chmod(opencodeSh, 0o755);
      }

      assert.ok(await pathExists(tasksFile), `Expected tasks file to exist at ${tasksFile}`);

      const runnerPath = path.join(__dirname, '..', '..', 'ralph_opencode.mjs');
      const env = {
        ...process.env,
        OPENCODE_NPX_PKG: 'this-should-not-be-used',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      };

      const res = spawnSync(process.execPath, [runnerPath, '--change', changeName, '--count', '3'], {
        cwd: tmpRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      assert.strictEqual(res.status, 3, `Runner should exit 3 when a task is not checked off. stderr=\n${res.stderr}`);
      assert.ok(
        (res.stderr || '').includes('was NOT marked done') || (res.stdout || '').includes('was NOT marked done'),
        'Runner should explain that it refuses to continue when the task is not marked done'
      );

      const updated = await fs.readFile(tasksFile, 'utf8');
      assert.ok(updated.includes('- [x] 1.1'), 'Runner should have completed the first task');
      assert.ok(updated.includes('- [ ] 1.2'), 'Runner should not treat the second task as complete');
      assert.ok(updated.includes('- [ ] 1.3'), 'Runner should not proceed beyond the failed verification task');
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('Invalid --count values fail fast with exit code 64 and do not start the loop', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-vscode-runner-'));

    try {
      const changeName = 'test-change';
      const tasksFile = path.join(tmpRoot, 'openspec', 'changes', changeName, 'tasks.md');
      await fs.mkdir(path.dirname(tasksFile), { recursive: true });

      const initialTasks = ['## Tasks', '', '- [ ] 1.1 First task', '- [ ] 1.2 Second task', ''].join('\n');
      await fs.writeFile(tasksFile, initialTasks, 'utf8');

      const fakeBin = path.join(tmpRoot, 'fake-bin');
      await fs.mkdir(fakeBin, { recursive: true });

      const markerFile = path.join(tmpRoot, 'opencode-was-invoked.txt');
      const opencodeJs = path.join(fakeBin, 'opencode.js');
      await fs.writeFile(
        opencodeJs,
        [
          "const fs = require('fs');",
          "const path = require('path');",
          '',
          '(async () => {',
          '  const marker = process.env.OPENCODE_MARKER_FILE;',
          '  if (marker) {',
          "    fs.writeFileSync(marker, 'invoked', 'utf8');",
          '  }',
          "  process.stderr.write('fake opencode should not be invoked for invalid --count\\n');",
          '  process.exit(1);',
          '})();',
          '',
        ].join('\n'),
        'utf8'
      );

      const isWin = process.platform === 'win32';
      if (isWin) {
        const opencodeCmd = path.join(fakeBin, 'opencode.cmd');
        await fs.writeFile(opencodeCmd, ['@echo off', 'node "%~dp0opencode.js" %*'].join('\r\n') + '\r\n', 'utf8');
      } else {
        const opencodeSh = path.join(fakeBin, 'opencode');
        await fs.writeFile(opencodeSh, ['#!/usr/bin/env sh', 'node "$(dirname "$0")/opencode.js" "$@"'].join('\n') + '\n', 'utf8');
        await fs.chmod(opencodeSh, 0o755);
      }

      assert.ok(await pathExists(tasksFile), `Expected tasks file to exist at ${tasksFile}`);

      const runnerPath = path.join(__dirname, '..', '..', 'ralph_opencode.mjs');
      const env = {
        ...process.env,
        OPENCODE_NPX_PKG: 'this-should-not-be-used',
        OPENCODE_MARKER_FILE: markerFile,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      };

      const cases: Array<{ label: string; args: string[] }> = [
        { label: '--count 0', args: ['--count', '0'] },
        { label: '--count -1', args: ['--count', '-1'] },
        { label: '--count 1.2', args: ['--count', '1.2'] },
        { label: '--count abc', args: ['--count', 'abc'] },
        { label: '--count (missing)', args: ['--count'] },
        { label: '--count=0', args: ['--count=0'] },
        { label: '--count=-1', args: ['--count=-1'] },
        { label: '--count=abc', args: ['--count=abc'] },
      ];

      for (const c of cases) {
        const res = spawnSync(process.execPath, [runnerPath, '--change', changeName, ...c.args], {
          cwd: tmpRoot,
          env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        assert.strictEqual(res.status, 64, `Expected exit code 64 for ${c.label}. stderr=\n${res.stderr}`);
        assert.ok(!/== Iteration\s+\d+\s*\//.test(res.stdout || ''), `Runner should not start loop for ${c.label}`);

        const after = await fs.readFile(tasksFile, 'utf8');
        assert.strictEqual(after, initialTasks, `Tasks file should not be modified for ${c.label}`);
        assert.ok(!(await pathExists(markerFile)), `opencode should not be invoked for ${c.label}`);
      }
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

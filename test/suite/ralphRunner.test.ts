import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

function parseTaskIdsFromRunnerPrompt(input: string): string[] {
  const lines = String(input || '').split(/\r?\n/);
  const ids: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!inList) {
      if (line === 'Task IDs (complete in order):') {
        inList = true;
      }
      continue;
    }

    if (!line.trim()) {
      break;
    }

    const m = line.match(/^\s*-\s*([0-9]+(\.[0-9]+)*)\s*$/);
    if (m) {
      ids.push(m[1]);
    }
  }

  return ids;
}

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
  test('Default run (no --count) includes one task per run and continues until done', async () => {
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
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!fileMatch) {",
          "    process.stderr.write('fake opencode: missing tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tasksFile = fileMatch[1].trim();",
          '  const ids = (function parseIds(text) {',
          "    const lines = String(text || '').split(/\\r?\\n/);",
          '    const out = [];',
          '    let inList = false;',
          '    for (const raw of lines) {',
          '      const line = raw.trimEnd();',
          "      if (!inList) {",
          "        if (line === 'Task IDs (complete in order):') inList = true;",
          '        continue;',
          '      }',
          '      if (!line.trim()) break;',
          "      const m = line.match(/^\\s*-\\s*([0-9]+(\\.[0-9]+)*)\\s*$/);",
          '      if (m) out.push(m[1]);',
          '    }',
          '    return out;',
          '  })(input);',
          '  if (!ids || ids.length === 0) {',
          "    process.stderr.write('fake opencode: missing task ids list in input\\n');",
          '    process.exit(2);',
          '  }',
          '  // Default behavior: mark ONLY the first task done (simulates conservative agent behavior).',
          '  const tid = ids[0];',
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

      const runnerPath = path.join(__dirname, '..', '..', '..', '..', 'ralph_opencode.mjs');
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
      assert.ok(res.stdout.includes('All tasks completed'), 'Runner should run until all tasks are complete');

      const updated = await fs.readFile(tasksFile, 'utf8');
      assert.ok(updated.includes('- [x] 1.1'), 'Runner should complete the first task');
      assert.ok(updated.includes('- [x] 1.2'), 'Runner should complete the second task');

      // Helpful assertion when debugging path issues.
      assert.ok(normSlashes(res.stdout).includes(normSlashes(`Tasks file : openspec/changes/${changeName}/tasks.md`)));
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('--count 3 includes up to 3 tasks per run and continues until done (while preserving per-task verification)', async () => {
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
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!fileMatch) {",
          "    process.stderr.write('fake opencode: missing tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tasksFile = fileMatch[1].trim();",
          '  const ids = (function parseIds(text) {',
          "    const lines = String(text || '').split(/\\r?\\n/);",
          '    const out = [];',
          '    let inList = false;',
          '    for (const raw of lines) {',
          '      const line = raw.trimEnd();',
          "      if (!inList) {",
          "        if (line === 'Task IDs (complete in order):') inList = true;",
          '        continue;',
          '      }',
          '      if (!line.trim()) break;',
          "      const m = line.match(/^\\s*-\\s*([0-9]+(\\.[0-9]+)*)\\s*$/);",
          '      if (m) out.push(m[1]);',
          '    }',
          '    return out;',
          '  })(input);',
          '  if (!ids || ids.length === 0) {',
          "    process.stderr.write('fake opencode: missing task ids list in input\\n');",
          '    process.exit(2);',
          '  }',
          '  // Batch behavior: mark ALL requested tasks done.',
          '  for (const tid of ids) {',
          '    if (!markTaskDone(tasksFile, tid)) {',
          "      process.stderr.write(`fake opencode: could not mark ${tid} in ${tasksFile}\\n`);",
          '      process.exit(3);',
          '    }',
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

      const runnerPath = path.join(__dirname, '..', '..', '..', '..', 'ralph_opencode.mjs');
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
      assert.ok(res.stdout.includes('All tasks completed'), 'Runner should run until all tasks are complete');

      const updated = await fs.readFile(tasksFile, 'utf8');
      assert.ok(updated.includes('- [x] 1.1'), 'Runner should complete the first task');
      assert.ok(updated.includes('- [x] 1.2'), 'Runner should complete the second task');
      assert.ok(updated.includes('- [x] 1.3'), 'Runner should complete the third task');
      assert.ok(updated.includes('- [x] 1.4'), 'Runner should complete the fourth task');
      assert.ok(updated.includes('- [x] 1.5'), 'Runner should complete the fifth task');
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
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!fileMatch) {",
          "    process.stderr.write('fake opencode: missing tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tasksFile = fileMatch[1].trim();",
          '  const ids = (function parseIds(text) {',
          "    const lines = String(text || '').split(/\\r?\\n/);",
          '    const out = [];',
          '    let inList = false;',
          '    for (const raw of lines) {',
          '      const line = raw.trimEnd();',
          "      if (!inList) {",
          "        if (line === 'Task IDs (complete in order):') inList = true;",
          '        continue;',
          '      }',
          '      if (!line.trim()) break;',
          "      const m = line.match(/^\\s*-\\s*([0-9]+(\\.[0-9]+)*)\\s*$/);",
          '      if (m) out.push(m[1]);',
          '    }',
          '    return out;',
          '  })(input);',
          '  if (!ids || ids.length === 0) {',
          "    process.stderr.write('fake opencode: missing task ids list in input\\n');",
          '    process.exit(2);',
          '  }',
          '  // Batch behavior: mark ALL requested tasks done.',
          '  for (const tid of ids) {',
          '    if (!markTaskDone(tasksFile, tid)) {',
          "      process.stderr.write(`fake opencode: could not mark ${tid} in ${tasksFile}\\n`);",
          '      process.exit(3);',
          '    }',
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

      const runnerPath = path.join(__dirname, '..', '..', '..', '..', 'ralph_opencode.mjs');
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
      assert.ok(res.stdout.includes('All tasks completed'), 'Runner should stop early when all tasks are done');

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
          "  const fileMatch = input.match(/^Tasks file: (.+)$/m);",
          "  if (!fileMatch) {",
          "    process.stderr.write('fake opencode: missing tasks file in input\\n');",
          '    process.exit(2);',
          '  }',
          "  const tasksFile = fileMatch[1].trim();",
          '  const ids = (function parseIds(text) {',
          "    const lines = String(text || '').split(/\\r?\\n/);",
          '    const out = [];',
          '    let inList = false;',
          '    for (const raw of lines) {',
          '      const line = raw.trimEnd();',
          "      if (!inList) {",
          "        if (line === 'Task IDs (complete in order):') inList = true;",
          '        continue;',
          '      }',
          '      if (!line.trim()) break;',
          "      const m = line.match(/^\\s*-\\s*([0-9]+(\\.[0-9]+)*)\\s*$/);",
          '      if (m) out.push(m[1]);',
          '    }',
          '    return out;',
          '  })(input);',
          '  if (!ids || ids.length === 0) {',
          "    process.stderr.write('fake opencode: missing task ids list in input\\n');",
          '    process.exit(2);',
          '  }',
          '  // Simulate a no-op run that exits 0 but fails to check off the FIRST task in the batch.',
          '  // The runner should treat this as "no progress" and abort before moving on.',
          '  for (let i = 0; i < ids.length; i++) {',
          '    const tid = ids[i];',
          '    if (i === 0) {',
          '      continue;',
          '    }',
          '    if (!markTaskDone(tasksFile, tid)) {',
          "      process.stderr.write(`fake opencode: could not mark ${tid} in ${tasksFile}\\n`);",
          '      process.exit(3);',
          '    }',
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

      const runnerPath = path.join(__dirname, '..', '..', '..', '..', 'ralph_opencode.mjs');
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
        (res.stderr || '').includes('Refusing to continue') || (res.stdout || '').includes('Refusing to continue'),
        'Runner should explain that it refuses to continue when tasks are not checked off as expected'
      );

      const updated = await fs.readFile(tasksFile, 'utf8');
      assert.ok(updated.includes('- [ ] 1.1'), 'Runner should not treat the first task as complete');
      assert.ok(updated.includes('- [x] 1.2'), 'fake opencode marks later tasks, but runner should still abort');
      assert.ok(updated.includes('- [x] 1.3'), 'fake opencode marks later tasks, but runner should still abort');
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  test('--count does not include cross-parent task IDs in the prompt', async () => {
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
          '## Other Section',
          '',
          '- [ ] 2.1 Third task',
          '',
        ].join('\n'),
        'utf8'
      );

      const fakeBin = path.join(tmpRoot, 'fake-bin');
      await fs.mkdir(fakeBin, { recursive: true });

      const inputCaptureFile = path.join(tmpRoot, 'opencode-input.txt');
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
          '(async () => {',
          '  const input = await readStdin();',
          '  const capture = process.env.OPENCODE_INPUT_CAPTURE;',
          '  if (capture) {',
          "    fs.writeFileSync(capture, input, 'utf8');",
          '  }',
          '  // Do not modify tasks; runner should abort due to no progress.',
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

      const runnerPath = path.join(__dirname, '..', '..', '..', '..', 'ralph_opencode.mjs');
      const env = {
        ...process.env,
        OPENCODE_NPX_PKG: 'this-should-not-be-used',
        OPENCODE_INPUT_CAPTURE: inputCaptureFile,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      };

      const res = spawnSync(process.execPath, [runnerPath, '--change', changeName, '--count', '3'], {
        cwd: tmpRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Fake opencode exits 0 but makes no progress, so the runner should refuse to continue.
      assert.strictEqual(res.status, 3, `Runner should exit 3 when no tasks were marked done. stderr=\n${res.stderr}`);
      assert.ok(await pathExists(inputCaptureFile), 'Expected fake opencode to capture stdin prompt');

      const captured = await fs.readFile(inputCaptureFile, 'utf8');
      const ids = parseTaskIdsFromRunnerPrompt(captured);
      assert.deepStrictEqual(ids, ['1.1', '1.2'], 'Runner should stop batching at the parent boundary');

      assert.ok(
        !captured.includes('## Other Section'),
        'Runner prompt task details should not leak subsequent section headers'
      );
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

      const runnerPath = path.join(__dirname, '..', '..', '..', '..', 'ralph_opencode.mjs');
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

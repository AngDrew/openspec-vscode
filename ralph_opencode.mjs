#!/usr/bin/env node
// Cross-platform Node runner mirroring ralph_opencode.sh.

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

function die(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function printHelp() {
  process.stdout.write(
    `Usage: ralph_opencode.mjs [--attach URL] [--change CHANGE] [--count N]\n\nOptions:\n` +
    `  --attach URL     Attach to an opencode server (e.g. http://localhost:4096)\n` +
    `  --change CHANGE  Target change id under openspec/changes/<change>\n` +
    `  --count N        Run up to N tasks in this invocation (default: 1)\n\nEnv:\n` +
    `  OPENCODE_ATTACH_URL  Same as --attach\n` +
    `  OPENSPEC_CHANGE      Same as --change\n` +
    `  OPENCODE_NPX_PKG     Fallback npx package (default: opencode-ai@1.1.40)\n`
  );
}

function escapeRegexLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runCapture(cmd, args) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error,
  };
}

function isNotFound(err) {
  if (!err) return false;
  const anyErr = err;
  return anyErr && (anyErr.code === 'ENOENT' || String(anyErr.message || '').includes('ENOENT'));
}

function pickNpxCommand() {
  // Prefer the npx bundled with this Node installation (works on Windows/macOS/Linux)
  // before falling back to PATH lookup.
  const dir = path.dirname(process.execPath);
  const isWin = process.platform === 'win32';
  const candidate = isWin ? path.join(dir, 'npx.cmd') : path.join(dir, 'npx');
  if (fs.existsSync(candidate)) return candidate;
  return 'npx';
}

function shouldUseShell(cmd) {
  if (process.platform !== 'win32') return false;
  const lower = String(cmd || '').toLowerCase();
  // Windows batch scripts (.cmd/.bat) require a shell (cmd.exe) when spawned.
  // Node can execute .exe directly, but attempting to CreateProcess a .cmd path
  // can result in EINVAL on some environments.
  return lower.endsWith('.cmd') || lower.endsWith('.bat');
}

function runInherit(cmd, args, input, options = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: shouldUseShell(cmd),
    ...options,
  });

  return {
    status: res.status,
    error: res.error,
  };
}

function runOpencodeWithFallback(opencodeArgs, input) {
  const direct = runInherit('opencode', opencodeArgs, input);
  if (!direct.error) {
    return direct;
  }

  if (!isNotFound(direct.error)) {
    return direct;
  }

  const pkg = (process.env.OPENCODE_NPX_PKG || 'opencode-ai@1.1.40').trim();
  const npxCmd = pickNpxCommand();
  const npxArgs = ['-y', pkg, ...opencodeArgs];
  const viaNpx = runInherit(npxCmd, npxArgs, input);
  return viaNpx;
}

function parseArgs(argv) {
  const out = {
    attachUrl: process.env.OPENCODE_ATTACH_URL || process.env.ATTACH_URL || '',
    changeName: process.env.OPENSPEC_CHANGE || '',
    count: 1,
  };

  function parseCountValue(raw) {
    const s = String(raw ?? '').trim();
    // Require a strict base-10 integer (no decimals, no exponent, no sign).
    if (!/^[0-9]+$/.test(s)) {
      die('ERROR: --count must be an integer >= 1', 64);
    }
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n) || n < 1) {
      die('ERROR: --count must be an integer >= 1', 64);
    }
    return n;
  }

  const args = [...argv];
  while (args.length > 0) {
    const a = args[0];
    if (a === '--attach') {
      if (args.length < 2 || !args[1]) {
        die('ERROR: --attach requires a URL argument', 64);
      }
      out.attachUrl = args[1];
      args.splice(0, 2);
      continue;
    }
    if (a.startsWith('--attach=')) {
      out.attachUrl = a.slice('--attach='.length);
      args.splice(0, 1);
      continue;
    }
    if (a === '--change') {
      if (args.length < 2 || !args[1]) {
        die('ERROR: --change requires a change id argument', 64);
      }
      out.changeName = args[1];
      args.splice(0, 2);
      continue;
    }
    if (a.startsWith('--change=')) {
      out.changeName = a.slice('--change='.length);
      args.splice(0, 1);
      continue;
    }
    if (a === '--count') {
      if (args.length < 2 || !args[1]) {
        die('ERROR: --count requires an integer argument', 64);
      }
      out.count = parseCountValue(args[1]);
      args.splice(0, 2);
      continue;
    }
    if (a.startsWith('--count=')) {
      out.count = parseCountValue(a.slice('--count='.length));
      args.splice(0, 1);
      continue;
    }
    if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }

    die(`ERROR: Unknown argument: ${a}`, 64);
  }

  return out;
}

function pickFirstChangeNameFromOpenSpecList(output) {
  const lines = output.split(/\r?\n/);
  let inChanges = false;
  for (const line of lines) {
    if (!inChanges) {
      if (/^Changes:\s*$/.test(line.trimEnd())) {
        inChanges = true;
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    const first = trimmed.split(/\s+/)[0];
    if (first) return first;
  }
  return '';
}

function isTaskLine(line) {
  return /^- \[[ x]\] [0-9]+(\.[0-9]+)*([\s]|$)/.test(line);
}

function findNextUncheckedTaskId(tasksText) {
  const re = /^- \[ \] ([0-9]+(\.[0-9]+)*)([\s]|$)/m;
  const m = tasksText.match(re);
  return m ? m[1] : '';
}

function allDone(tasksText) {
  return !/^- \[ \] [0-9]+(\.[0-9]+)*([\s]|$)/m.test(tasksText);
}

function isTaskDone(tasksText, tid) {
  const tidRe = escapeRegexLiteral(tid);
  const re = new RegExp(`^- \\[x\\] ${tidRe}([\\s]|$)`, 'm');
  return re.test(tasksText);
}

function extractTaskBlock(tasksText, tid) {
  const tidRe = escapeRegexLiteral(tid);
  const startRe = new RegExp(`^- \\[[ x]\\] ${tidRe}([\\s]|$)`);
  const lines = tasksText.split(/\r?\n/);

  let inBlock = false;
  const block = [];
  for (const line of lines) {
    if (inBlock && isTaskLine(line) && !startRe.test(line)) {
      break;
    }
    if (!inBlock && startRe.test(line)) {
      inBlock = true;
    }
    if (inBlock) {
      block.push(line);
    }
  }

  const out = block.join('\n').trimEnd();
  return out;
}

const { attachUrl, changeName: changeNameArg, count: tasksPerRun } = parseArgs(process.argv.slice(2));
const maxIters = Number.parseInt(process.env.MAX_ITERS || '30', 10);
const maxItersSafe = Number.isFinite(maxIters) && maxIters > 0 ? maxIters : 30;

let changeName = (changeNameArg || '').trim();
if (!changeName) {
  const listRes = runCapture('openspec', ['list']);
  if (listRes.error) {
    die(`ERROR: Failed to run openspec list: ${String(listRes.error)}`);
  }
  if (listRes.status !== 0) {
    die('ERROR: Could not determine CHANGE_NAME from: openspec list');
  }

  changeName = pickFirstChangeNameFromOpenSpecList(listRes.stdout);
  if (!changeName) {
    die('ERROR: Could not determine CHANGE_NAME from: openspec list');
  }
}

const tasksFile = path.join('openspec', 'changes', changeName, 'tasks.md');
if (!fs.existsSync(tasksFile)) {
  die(`ERROR: tasks file not found: ${tasksFile}`);
}

process.stdout.write(`Change     : ${changeName}\n`);
process.stdout.write(`Tasks file : ${tasksFile}\n`);
process.stdout.write(`Max iters  : ${maxItersSafe}\n`);
process.stdout.write(`Tasks/run  : ${tasksPerRun}\n`);
if (attachUrl) {
  process.stdout.write(`Attach     : ${attachUrl}\n`);
}
process.stdout.write('\n');

let completedThisRun = 0;
for (let iter = 1; iter <= maxItersSafe; iter++) {
  if (completedThisRun >= tasksPerRun) {
    process.stdout.write(`Reached tasks-per-run limit (${tasksPerRun}). Stopping early (iteration ${iter}).\n`);
    process.exit(0);
  }

  const tasksTextBefore = fs.readFileSync(tasksFile, 'utf8');
  if (allDone(tasksTextBefore)) {
    process.stdout.write(`All tasks completed. Stopping early (iteration ${iter}).\n`);
    process.exit(0);
  }

  const tid = findNextUncheckedTaskId(tasksTextBefore);
  if (!tid) {
    die(`ERROR: Could not find next unchecked task in ${tasksFile}`, 2);
  }

  process.stdout.write(`== Iteration ${iter} / ${maxItersSafe} : task ${tid} ==\n`);

  const taskBlock = extractTaskBlock(tasksTextBefore, tid);
  if (!taskBlock) {
    die(`ERROR: Could not extract task block for task ${tid} from ${tasksFile}`, 2);
  }

  const opencodeArgs = ['run'];
  if (attachUrl) {
    opencodeArgs.push('--attach', attachUrl);
  }
  opencodeArgs.push('use skills openspec-apply-change to apply');

  const prompt = `Target change: ${changeName}\n` +
    `Tasks file: ${tasksFile}\n\n` +
    `Work on EXACTLY ONE task: ${tid}\n` +
    `Task details (verbatim from tasks.md):\n` +
    `${taskBlock}\n\n` +
    `- Only implement work for task ${tid}\n` +
    `- Do NOT start or modify other task ids\n` +
    `- If it is a test/qa/review and it fail, fix it\n` +
    `- When finished, mark ONLY task ${tid} as done in ${tasksFile} by changing:\n` +
    `  - [ ] ${tid}  ->  - [x] ${tid}\n`;

  const runRes = runOpencodeWithFallback(opencodeArgs, prompt);
  if (runRes.error) {
    if (isNotFound(runRes.error)) {
      die(
        'ERROR: opencode command not found (ENOENT).\n' +
        'Install opencode and ensure it is on PATH, then restart your terminal.\n' +
        'Tip: this runner will also try `npx -y opencode-ai@1.1.40` as a fallback if available.\n' +
        'Quick check: run `opencode --help` in this terminal.',
        127
      );
    }
    die(`ERROR: Failed to run opencode: ${String(runRes.error)}`);
  }
  if (runRes.status !== 0) {
    die(`ERROR: opencode exited with status ${String(runRes.status)}`);
  }

  const tasksTextAfter = fs.readFileSync(tasksFile, 'utf8');
  if (!isTaskDone(tasksTextAfter, tid)) {
    die(`Task ${tid} was NOT marked done in ${tasksFile} after iteration ${iter}.\nRefusing to continue to avoid looping blindly.`, 3);
  }

  completedThisRun += 1;
  process.stdout.write(`Task ${tid} completed.\n\n`);
}

const tasksTextAfterLoop = fs.readFileSync(tasksFile, 'utf8');
if (allDone(tasksTextAfterLoop)) {
  process.stdout.write('All tasks completed.\n');
  process.exit(0);
}

process.stdout.write(`Hit MAX_ITERS=${maxItersSafe} but tasks still remain unfinished.\n`);
process.exit(4);

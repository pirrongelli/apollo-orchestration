#!/usr/bin/env node
// Regression tests for check-features-immutable.mjs.
// Run: node --test examples/loops/check-features-immutable.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), 'check-features-immutable.mjs');
const BASELINE = [
  { id: 'F1', description: 'first feature entry', verify: 'npm test -- f1', status: 'fail' },
  { id: 'F2', description: 'second feature entry', verify: 'npm test -- f2', status: 'fail' },
];

// Spin up a throwaway git repo with `content` committed as features.json.
// Returns { dir, run } where run(workingContent) writes the working-tree file
// (raw string) and runs the checker, returning { code, out }.
function makeRepo(committedRaw) {
  const dir = mkdtempSync(join(tmpdir(), 'featimm-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, 'features.json'), committedRaw);
  git('add', 'features.json');
  git('commit', '-q', '-m', 'baseline');
  const run = (workingRaw) => {
    if (workingRaw !== undefined) writeFileSync(join(dir, 'features.json'), workingRaw);
    try {
      const out = execFileSync('node', [CHECKER, 'features.json'], { cwd: dir, encoding: 'utf8' });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
    }
  };
  return { dir, run };
}

test('status flip (fail→pass) is allowed', () => {
  const { dir, run } = makeRepo(JSON.stringify(BASELINE));
  const flipped = BASELINE.map((f) => ({ ...f, status: 'pass' }));
  const { code, out } = run(JSON.stringify(flipped));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.match(out, /immutable OK/);
});

test('appending a new entry is allowed', () => {
  const { dir, run } = makeRepo(JSON.stringify(BASELINE));
  const appended = [...BASELINE, { id: 'F3', description: 'new appended entry', verify: 'npm test -- f3', status: 'fail' }];
  const { code, out } = run(JSON.stringify(appended));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.match(out, /1 appended/);
});

test('adding a new entry ahead of baseline entries is allowed (order not significant)', () => {
  // The contract is id-keyed: existing entries preserved unchanged, new ones
  // added. Position is not significant, so inserting F3 before F1/F2 passes
  // as long as F1/F2 survive unedited.
  const { dir, run } = makeRepo(JSON.stringify(BASELINE));
  const inserted = [
    { id: 'F3', description: 'inserted ahead of baseline', verify: 'npm test -- f3', status: 'fail' },
    ...BASELINE,
  ];
  const { code, out } = run(JSON.stringify(inserted));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.match(out, /immutable OK/);
  assert.match(out, /1 appended/);
});

test('removing an entry is a violation (exit 1)', () => {
  const { dir, run } = makeRepo(JSON.stringify(BASELINE));
  const { code, out } = run(JSON.stringify([BASELINE[0]]));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 1);
  assert.match(out, /removed: F2/);
});

test('editing description/verify is a violation (exit 1)', () => {
  const { dir, run } = makeRepo(JSON.stringify(BASELINE));
  const edited = [{ ...BASELINE[0], description: 'tampered' }, BASELINE[1]];
  const { code, out } = run(JSON.stringify(edited));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 1);
  assert.match(out, /edited description: F1/);
});

test('no committed baseline → OK (exit 0)', () => {
  // Commit an unrelated file so HEAD exists but features.json is not in it.
  const dir = mkdtempSync(join(tmpdir(), 'featimm-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, 'README'), 'x');
  git('add', 'README');
  git('commit', '-q', '-m', 'init');
  writeFileSync(join(dir, 'features.json'), JSON.stringify(BASELINE));
  let code, out;
  try {
    out = execFileSync('node', [CHECKER, 'features.json'], { cwd: dir, encoding: 'utf8' });
    code = 0;
  } catch (e) {
    code = e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.match(out, /no committed baseline/);
});

test('run outside a git repo (no HEAD) → fails closed, not treated as "no baseline" (exit 1)', () => {
  // A missing/broken git environment must not green the gate. The working
  // file is valid JSON so the checker gets past the initial read and hits
  // the git HEAD verification, which fails because this dir is not a repo.
  const dir = mkdtempSync(join(tmpdir(), 'featimm-'));
  writeFileSync(join(dir, 'features.json'), JSON.stringify(BASELINE));
  let code, out;
  try {
    out = execFileSync('node', [CHECKER, 'features.json'], { cwd: dir, encoding: 'utf8' });
    code = 0;
  } catch (e) {
    code = e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 1);
  assert.match(out, /IMMUTABILITY CHECK ERROR/);
});

test('committed baseline exists but is unparseable → fails closed (exit 1)', () => {
  // Baseline committed as invalid JSON; working file is valid so the checker
  // gets past the working-file parse and hits the HEAD read/parse.
  const { dir, run } = makeRepo('{ this is not valid json');
  const { code, out } = run(JSON.stringify(BASELINE));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 1);
  assert.match(out, /IMMUTABILITY CHECK ERROR/);
});

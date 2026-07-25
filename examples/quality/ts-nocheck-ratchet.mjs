#!/usr/bin/env node
// `@ts-nocheck` inventory + ratchet.
//
// A file carrying `@ts-nocheck` opts out of type checking completely, so the
// typecheck ratchet sees nothing wrong with it — a silent hole in the type
// gate. ESLint's ban-ts-comment permits the directive here (many legacy files
// rely on it), so the control is: the set of files using it may only shrink.
//
// Usage:
//   node ts-nocheck-ratchet.mjs            # check
//   node ts-nocheck-ratchet.mjs --update    # rewrite baseline
//   node ts-nocheck-ratchet.mjs --list      # print the inventory

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { compareFileSets } from './ratchet-lib.mjs';

const BASELINE_PATH = 'config/quality-baselines.json';

function parseArgs(argv) {
  return {
    update: argv.includes('--update'),
    list: argv.includes('--list'),
    json: argv.includes('--json'),
  };
}

function readBaselineFile() {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (err) {
    console.error(`ts-nocheck-ratchet: ${BASELINE_PATH} is not valid JSON (${err.message}).`);
    process.exit(2);
  }
}

/** Tracked TS/TSX files containing the directive, repo-relative and sorted. */
function currentFiles() {
  try {
    // All TS-family extensions: .mts/.cts are valid TypeScript and would
    // otherwise be a hole. .js/.mjs/.cjs are deliberately EXCLUDED: checkJs is
    // not enabled, so the directive is inert there, and the tooling in this
    // directory contains the literal string itself (which would self-match).
    const out = execFileSync(
      'git',
      ['grep', '-l', '--', '@ts-nocheck', '*.ts', '*.tsx', '*.mts', '*.cts'],
      { encoding: 'utf8' },
    );
    return out.split('\n').map((s) => s.trim()).filter(Boolean).sort();
  } catch (err) {
    // git grep exits 1 when there are no matches — that is a clean inventory,
    // not an error. Any other status is a real failure and must not read as zero.
    if (err.status === 1) return [];
    console.error(`ts-nocheck-ratchet: git grep failed (${err.message}).`);
    process.exit(2);
  }
}

const args = parseArgs(process.argv.slice(2));
const current = currentFiles();
const baselineFile = readBaselineFile();

if (args.list) {
  console.log(`@ts-nocheck inventory — ${current.length} file(s):`);
  for (const f of current) console.log(`  ${f}`);
  process.exit(0);
}

if (args.update) {
  const before = baselineFile.tsNocheck?.files?.length;
  const next = {
    ...baselineFile,
    tsNocheck: {
      total: current.length,
      files: current,
      updatedAt: new Date().toISOString().slice(0, 10),
      note: 'Files opting out of type checking. This set may only shrink — a new @ts-nocheck fails the gate. Removing one is progress: regenerate with npm run quality:ts-nocheck -- --update.',
    },
  };
  mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(
    `ts-nocheck-ratchet: baseline written — ${current.length} file(s)` +
      (typeof before === 'number' ? ` (was ${before}, delta ${current.length - before >= 0 ? '+' : ''}${current.length - before})` : ''),
  );
  if (typeof before === 'number' && current.length > before) {
    const added = current.filter((f) => !(baselineFile.tsNocheck?.files ?? []).includes(f));
    console.log('  NOTE: this RAISES the baseline — more files now skip type checking:');
    for (const f of added) console.log(`    + ${f}`);
    console.log('  Expect to justify each one in review.');
  }
  process.exit(0);
}

const result = compareFileSets(baselineFile.tsNocheck?.files ?? null, current);

if (args.json) {
  console.log(JSON.stringify({ current, result }, null, 2));
} else {
  console.log(`\n@ts-nocheck ratchet — baseline ${result.baselineCount ?? 'none'}, current ${current.length}`);
  if (result.removed?.length) {
    console.log('  removed (progress):');
    for (const f of result.removed) console.log(`    ${f}`);
    console.log('  Lower the baseline with: npm run quality:ts-nocheck -- --update');
  }
  if (result.added?.length) {
    console.log('  NEW @ts-nocheck (not allowed):');
    for (const f of result.added) console.log(`    ${f}`);
  }
  if (result.reason) console.log(`  ${result.reason}`);
  if (result.ok && !result.removed?.length) console.log('  OK — no new type-check opt-outs.\n');
}

if (!result.ok) {
  console.error(
    'ts-nocheck-ratchet: FAILED — this change adds @ts-nocheck to a file.\n' +
      'A file with @ts-nocheck is invisible to the typecheck ratchet, so type errors in it\n' +
      'can never be caught. Fix the types instead, or narrow the suppression to the specific\n' +
      'line with @ts-expect-error and a description.',
  );
  process.exit(1);
}

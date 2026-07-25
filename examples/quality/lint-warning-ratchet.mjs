#!/usr/bin/env node
// ESLint WARNING ratchet.
//
// `npm run lint` is `eslint .` with no --max-warnings, so warnings never fail a
// build and accumulate unnoticed (they reached triple digits in the codebase this came from, up from ~20 as
// rules were added). Errors are gated; warnings were not. This closes that:
// the committed baseline may only go down.
//
// Usage:
//   node lint-warning-ratchet.mjs            # check
//   node lint-warning-ratchet.mjs --update    # rewrite baseline
//   node lint-warning-ratchet.mjs --report <eslint.json>
//
// --update is deliberately a local, reviewable act: raising the baseline shows
// up in the diff and has to be justified like any other change.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { aggregateEslintWarnings, compareWarningCounts, sortByRule, sortByFileRule } from './ratchet-lib.mjs';

const BASELINE_PATH = 'config/quality-baselines.json';

function parseArgs(argv) {
  const args = { update: false, report: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--update') args.update = true;
    else if (argv[i] === '--report' && argv[i + 1]) { args.report = argv[i + 1]; i += 1; }
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

function readBaselineFile() {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (err) {
    console.error(`lint-warning-ratchet: ${BASELINE_PATH} is not valid JSON (${err.message}).`);
    process.exit(2);
  }
}

function runEslintJson() {
  // ESLint exits non-zero when it reports errors; the JSON still lands on
  // stdout, and compareWarningCounts fails on any error anyway.
  try {
    return execFileSync('npx', ['eslint', '.', '--format', 'json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    console.error(`lint-warning-ratchet: could not run ESLint — ${err.message}`);
    process.exit(2);
  }
}

const args = parseArgs(process.argv.slice(2));
const raw = args.report ? readFileSync(args.report, 'utf8') : runEslintJson();
let eslintJson;
try {
  eslintJson = JSON.parse(raw);
} catch (err) {
  console.error(`lint-warning-ratchet: ESLint output was not JSON (${err.message}).`);
  process.exit(2);
}

const current = aggregateEslintWarnings(eslintJson);
const baselineFile = readBaselineFile();

if (args.update) {
  const next = {
    ...baselineFile,
    lintWarnings: {
      total: current.total,
      byRule: sortByRule(current.byRule),
      byFileRule: sortByFileRule(current.byFileRule),
      updatedAt: new Date().toISOString().slice(0, 10),
      note: 'ESLint warnings may only decrease. Regenerate with npm run quality:lint-ratchet -- --update and justify any increase in review.',
    },
  };
  mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const before = baselineFile.lintWarnings?.total;
  console.log(
    `lint-warning-ratchet: baseline written — ${current.total} warnings` +
      (typeof before === 'number' ? ` (was ${before}, delta ${current.total - before >= 0 ? '+' : ''}${current.total - before})` : ''),
  );
  if (typeof before === 'number' && current.total > before) {
    console.log('  NOTE: this RAISES the baseline. Expect to justify it in review.');
  }
  process.exit(0);
}

const result = compareWarningCounts(baselineFile.lintWarnings ?? null, current);

if (args.json) {
  console.log(JSON.stringify({ current, result }, null, 2));
} else {
  console.log(`\nESLint warning ratchet — baseline ${result.baselineTotal ?? 'none'}, current ${current.total}`);
  if (current.errors > 0) {
    console.log(`  ${current.errors} ERROR(s) present — fix those first (\`npm run lint\`).`);
  }
  if (result.improvements?.length) {
    console.log('  improved:');
    for (const i of result.improvements) console.log(`    ${i.rule}: ${i.baseline} → ${i.current}`);
    console.log(`  Lower the baseline with: npm run quality:lint-ratchet -- --update`);
  }
  if (result.regressions?.length) {
    console.log('  REGRESSIONS:');
    for (const r of result.regressions) {
      const where = r.file ? ` in ${r.file}` : '';
      console.log(`    ${r.rule}${where}: ${r.baseline} → ${r.current}  (+${r.current - r.baseline})`);
    }
    console.log('  If a warning MOVED rather than being added, run quality:lint-ratchet:update and say so in the PR.');
  }
  if (result.reason) console.log(`  ${result.reason}`);
  console.log(result.ok ? '\n  OK — no new warnings.\n' : '');
}

if (!result.ok) {
  console.error(
    'lint-warning-ratchet: FAILED — this change adds ESLint warnings.\n' +
      'Fix them, or if a rule was intentionally made stricter, run\n' +
      '  npm run quality:lint-ratchet -- --update\n' +
      'and justify the new baseline in the PR.',
  );
  process.exit(1);
}

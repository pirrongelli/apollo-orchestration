#!/usr/bin/env node
// CRAP (Change Risk Anti-Patterns) report.
//
// Ranks functions by how risky they are to change: high cyclomatic complexity
// combined with low test coverage. Advisory everywhere; a breach on a money or
// auth surface (see CRITICAL_PATH_PATTERNS in crap-lib.mjs) fails with --gate.
//
// Usage:
//   node scripts/quality/crap-report.mjs                       # top offenders, repo-wide
//   node scripts/quality/crap-report.mjs --changed-only         # only files changed vs base
//   node scripts/quality/crap-report.mjs --gate                 # fail if a critical path breaches
//   node scripts/quality/crap-report.mjs --json                 # machine-readable
//
// Flags:
//   --lcov <path>     coverage report (default: coverage/merged.lcov, then coverage/lcov.info)
//   --base <ref>      base ref for --changed-only (default: origin/main)
//   --top <n>         rows to print (default: 20)
//   --max-crap <n>    ceiling for critical paths (default: 30)
//   --warn-crap <n>   advisory threshold (default: 20)
//   --gate            exit 1 when a critical path exceeds --max-crap
//   --gate-all        apply the ceiling to every file, not just critical paths
//   --require-coverage  exit 1 when a money/auth file has NO coverage data at all
//                       (only meaningful after a FULL coverage run)
//   --changed-only    restrict to files changed vs --base
//   --json            emit JSON instead of a table
//
// Coverage note: there are two different "no coverage" cases and conflating
// them makes the gate useless.
//   1. The file is absent from the LCOV report  → coverage was never COLLECTED
//      (e.g. a scoped run). Not scored; listed as a coverage gap. Gate on it
//      only with --require-coverage, after a full coverage run.
//   2. The file IS in the report but a function has no executed lines → that
//      function genuinely is untested and scores 0% coverage.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import process from 'node:process';

import {
  crapScore,
  parseLcovLineHits,
  rangeCoverageRatio,
  analyzeSource,
  isCriticalPath,
  isTestFile,
  normalizePath,
} from './crap-lib.mjs';

const DEFAULT_LCOV_CANDIDATES = ['coverage/merged.lcov', 'coverage/lcov.info'];
// Replace with the source roots of your own project.
const SOURCE_GLOB_DIRS = ['src', 'functions'];
const SOURCE_EXT = /\.(ts|tsx)$/;

function parseArgs(argv) {
  const args = {
    lcov: null,
    base: 'origin/main',
    top: 20,
    maxCrap: 30,
    warnCrap: 20,
    gate: false,
    gateAll: false,
    changedOnly: false,
    json: false,
    requireCoverage: false,
    complexityOnly: false,
    maxComplexity: 15,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--lcov' && next) args.lcov = next, i += 1;
    else if (token === '--base' && next) args.base = next, i += 1;
    else if (token === '--top' && next) args.top = Number.parseInt(next, 10), i += 1;
    else if (token === '--max-crap' && next) args.maxCrap = Number.parseFloat(next), i += 1;
    else if (token === '--warn-crap' && next) args.warnCrap = Number.parseFloat(next), i += 1;
    else if (token === '--gate') args.gate = true;
    else if (token === '--gate-all') args.gateAll = true;
    else if (token === '--require-coverage') args.requireCoverage = true;
    else if (token === '--complexity-only') args.complexityOnly = true;
    else if (token === '--max-complexity' && next) args.maxComplexity = Number.parseFloat(next), i += 1;
    else if (token === '--changed-only') args.changedOnly = true;
    else if (token === '--json') args.json = true;
    else if (token === '--help' || token === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 28).join('\n'));
      process.exit(0);
    }
  }
  return args;
}

function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf8' }).trim();
}

function listSourceFiles() {
  const out = git(['ls-files', ...SOURCE_GLOB_DIRS]);
  return out.split('\n').filter((f) => SOURCE_EXT.test(f) && !isTestFile(f));
}

function listChangedFiles(base) {
  let range;
  try {
    const mergeBase = git(['merge-base', base, 'HEAD']);
    range = `${mergeBase}..HEAD`;
  } catch {
    console.error(`crap-report: cannot resolve base '${base}' — falling back to repo-wide scan.`);
    return null;
  }
  const committed = git(['diff', '--name-only', '--diff-filter=ACMR', range]).split('\n');
  const working = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']).split('\n');
  const all = new Set([...committed, ...working].filter(Boolean));
  return [...all].filter((f) => SOURCE_EXT.test(f) && !isTestFile(f));
}

/**
 * Line ranges added/modified per file, so the gate can hold a PR accountable
 * for the functions it actually touched instead of every pre-existing offender
 * that happens to live in the same file. Without this the gate blocks
 * unrelated work on old debt and gets switched off within a week.
 * @returns {Map<string, Array<[number, number]>>|null}
 */
function changedLineRanges(base) {
  const ranges = new Map();
  const add = (file, start, count) => {
    if (count === 0) return; // pure deletion: no new lines to attribute
    const list = ranges.get(file) ?? [];
    list.push([start, start + Math.max(count, 1) - 1]);
    ranges.set(file, list);
  };
  const collect = (diffArgs) => {
    let out;
    try {
      out = git(diffArgs);
    } catch {
      return;
    }
    let currentFile = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('+++ b/')) {
        currentFile = line.slice(6).trim();
      } else if (line.startsWith('@@') && currentFile) {
        const m = /\+(\d+)(?:,(\d+))?/.exec(line);
        if (m) add(currentFile, Number.parseInt(m[1], 10), m[2] === undefined ? 1 : Number.parseInt(m[2], 10));
      }
    }
  };
  try {
    const mergeBase = git(['merge-base', base, 'HEAD']);
    collect(['diff', '-U0', '--diff-filter=ACMR', `${mergeBase}..HEAD`]);
  } catch {
    return null;
  }
  collect(['diff', '-U0', '--diff-filter=ACMR', 'HEAD']);
  return ranges;
}

/** True when a function's line span intersects any changed hunk. */
function isTouched(changedRanges, file, startLine, endLine) {
  if (!changedRanges) return true; // unknown diff → do not silently exempt
  const hunks = changedRanges.get(file);
  if (!hunks || hunks.length === 0) return false;
  return hunks.some(([hStart, hEnd]) => hStart <= endLine && hEnd >= startLine);
}

function resolveLcov(explicit) {
  const candidates = explicit ? [explicit] : DEFAULT_LCOV_CANDIDATES;
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function fmtCoverage(ratio) {
  return ratio === null ? 'unknown' : `${(ratio * 100).toFixed(0)}%`;
}

/**
 * Coverage-free mode: rank functions by cyclomatic complexity and optionally
 * gate on a ceiling. Complexity is the half of CRAP that needs no test run, so
 * this is what a pull request can afford to check on every push.
 */
async function runComplexityOnly(args, ts) {
  const files = args.changedOnly ? (listChangedFiles(args.base) ?? listSourceFiles()) : listSourceFiles();
  const changedRanges = args.changedOnly ? changedLineRanges(args.base) : null;
  const rows = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    let functions;
    try {
      functions = analyzeSource(ts, readFileSync(file, 'utf8'), file);
    } catch (err) {
      console.error(`crap-report: skipped ${file} (parse error: ${err.message})`);
      continue;
    }
    const critical = isCriticalPath(file);
    for (const fn of functions) {
      rows.push({
        file,
        function: fn.name,
        line: fn.startLine,
        complexity: fn.complexity,
        critical,
        touched: args.changedOnly ? isTouched(changedRanges, file, fn.startLine, fn.endLine) : true,
      });
    }
  }
  rows.sort((a, b) => b.complexity - a.complexity);
  // Ratchet: only functions this change actually touched can fail the gate.
  const breaches = rows.filter(
    (r) => r.touched && (args.gateAll || r.critical) && r.complexity > args.maxComplexity,
  );

  if (args.json) {
    console.log(JSON.stringify({
      mode: 'complexity-only',
      scope: args.changedOnly ? `changed vs ${args.base}` : 'repo-wide',
      maxComplexity: args.maxComplexity,
      totals: { functions: rows.length, breaches: breaches.length },
      top: rows.slice(0, args.top),
      breaches,
    }, null, 2));
  } else {
    const scope = args.changedOnly ? `changed vs ${args.base}` : 'repo-wide';
    console.log(`\nCyclomatic complexity — ${scope} (no coverage needed)`);
    console.log(`Ceiling ${args.maxComplexity} on money/auth paths ($). ` +
      `FAIL = this change owns it; debt = pre-existing, untouched.\n` +
      `Full CRAP (complexity + coverage) runs in the nightly coverage job.\n`);
    const shown = rows.slice(0, Math.max(0, args.top));
    if (shown.length === 0) {
      console.log('  no functions in scope.');
    } else {
      console.log('    cx  function @ file:line');
      console.log('  ' + '-'.repeat(72));
      for (const r of shown) {
        const over = r.complexity > args.maxComplexity && (args.gateAll || r.critical);
        const flag = over ? (r.touched ? 'FAIL' : 'debt') : '    ';
        console.log(`  ${flag} ${r.critical ? '$' : ' '}${String(r.complexity).padStart(3)}  ${r.function} @ ${r.file}:${r.line}`);
      }
    }
    console.log(`\n  ${rows.length} functions analysed.`);
    if (breaches.length > 0) {
      console.log(`\n  ${breaches.length} function(s) over the ${args.maxComplexity} ceiling on gated paths:`);
      for (const b of breaches) {
        console.log(`    - ${b.function} @ ${b.file}:${b.line} — complexity ${b.complexity}`);
      }
      console.log(`\n  A function this branchy cannot be meaningfully tested as one unit.\n` +
        `  Split it, or if it is pre-existing and untouched, it is out of scope for this PR.`);
    }
  }

  if (args.gate && breaches.length > 0) {
    console.error(`\ncrap-report: FAILED — ${breaches.length} function(s) exceed complexity ${args.maxComplexity} on gated paths.`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ts = (await import('typescript')).default;

  // --complexity-only needs no coverage at all: it is the per-PR fast gate,
  // answering "did this change add an untestably complex function?" without
  // waiting on a test suite.
  if (args.complexityOnly) {
    await runComplexityOnly(args, ts);
    return;
  }

  const lcovPath = resolveLcov(args.lcov);
  if (!lcovPath) {
    console.error(
      `crap-report: no coverage report found (looked for ${DEFAULT_LCOV_CANDIDATES.join(', ')}).\n` +
        `Run your test suite with coverage enabled (and merge frontend/backend LCOV files if\n` +
        `they're produced separately), then pass --lcov <path>, or use --complexity-only.`,
    );
    process.exit(2);
  }
  const lineHitsByFile = parseLcovLineHits(readFileSync(lcovPath, 'utf8'));

  // LCOV paths may be absolute or repo-relative; index by suffix for matching.
  const coverageIndex = new Map();
  for (const [file, hits] of lineHitsByFile) {
    coverageIndex.set(normalizePath(file), hits);
  }
  const coverageFor = (repoRelative) => {
    if (coverageIndex.has(repoRelative)) return coverageIndex.get(repoRelative);
    for (const [covPath, hits] of coverageIndex) {
      if (covPath.endsWith(`/${repoRelative}`) || covPath.endsWith(repoRelative)) return hits;
    }
    return null;
  };

  const files = args.changedOnly ? (listChangedFiles(args.base) ?? listSourceFiles()) : listSourceFiles();
  const changedRanges = args.changedOnly ? changedLineRanges(args.base) : null;
  const touchedOf = (file, fn) =>
    args.changedOnly ? isTouched(changedRanges, file, fn.startLine, fn.endLine) : true;

  const rows = [];
  /** Files with no coverage data at all — coverage not collected, not necessarily untested. */
  const instrumentedGaps = [];
  for (const file of files) {
    if (!existsSync(file)) continue; // deleted in working tree
    let functions;
    try {
      functions = analyzeSource(ts, readFileSync(file, 'utf8'), file);
    } catch (err) {
      console.error(`crap-report: skipped ${file} (parse error: ${err.message})`);
      continue;
    }
    const hits = coverageFor(file);
    const critical = isCriticalPath(file);
    // A file absent from the coverage report means coverage was not COLLECTED
    // for it (e.g. a scoped run), which is not the same as "0% covered".
    // Scoring those as zero turns every partial run into a wall of false
    // breaches, so they are tracked separately and surfaced via --require-coverage.
    if (!hits) {
      instrumentedGaps.push({ file, critical, functions: functions.length });
      for (const fn of functions) {
        rows.push({
          file,
          function: fn.name,
          line: fn.startLine,
          complexity: fn.complexity,
          coverage: null,
          crap: null,
          critical,
          noCoverageData: true,
          touched: touchedOf(file, fn),
        });
      }
      continue;
    }
    for (const fn of functions) {
      // The file is instrumented, so a genuinely untested function still has
      // DA records with zero hits. NO instrumented lines in range means the
      // range carries no executable code (overload signature, type-only body)
      // — that is unknown, not zero, and must not be scored.
      const ratio = rangeCoverageRatio(hits, fn.startLine, fn.endLine);
      rows.push({
        file,
        function: fn.name,
        line: fn.startLine,
        complexity: fn.complexity,
        coverage: ratio,
        crap: ratio === null ? null : Number(crapScore(fn.complexity, ratio).toFixed(2)),
        critical,
        noCoverageData: ratio === null,
        touched: touchedOf(file, fn),
      });
    }
  }

  const scoredRows = rows.filter((r) => r.crap !== null).sort((a, b) => b.crap - a.crap);
  // Ratchet: only functions this change actually touched can fail the gate.
  const breaches = scoredRows.filter(
    (r) => r.touched && (args.gateAll || r.critical) && r.crap > args.maxCrap,
  );
  // Money/auth files the coverage run never touched: a real signal ("no tests
  // at all") ONLY when the report is complete, so it gates behind an opt-in flag.
  const criticalGaps = instrumentedGaps.filter((g) => g.critical);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          lcov: lcovPath,
          scope: args.changedOnly ? `changed vs ${args.base}` : 'repo-wide',
          thresholds: { maxCrap: args.maxCrap, warnCrap: args.warnCrap, gateAll: args.gateAll },
          totals: {
            functions: rows.length,
            scored: scoredRows.length,
            unknownCoverage: rows.length - scoredRows.length,
            breaches: breaches.length,
          },
          top: scoredRows.slice(0, args.top),
          breaches,
        },
        null,
        2,
      ),
    );
  } else {
    const scope = args.changedOnly ? `changed vs ${args.base}` : 'repo-wide';
    console.log(`\nCRAP report — ${scope} (coverage: ${lcovPath})`);
    console.log(`CRAP = complexity^2 * (1 - coverage)^3 + complexity   ` +
      `[warn > ${args.warnCrap}, critical-path ceiling ${args.maxCrap}]`);
    console.log(`FAIL = this change owns it; debt = pre-existing, untouched.\n`);
    const shown = scoredRows.slice(0, Math.max(0, args.top));
    if (shown.length === 0) {
      console.log('  no functions scored (is the coverage report for this tree?)');
    } else {
      console.log('   CRAP  cx  cov      function @ file:line');
      console.log('  ' + '-'.repeat(72));
      for (const r of shown) {
        const over = r.crap > args.maxCrap && (args.gateAll || r.critical);
        const flag = over ? (r.touched ? 'FAIL' : 'debt') : r.crap > args.warnCrap ? 'warn' : '    ';
        const money = r.critical ? '$' : ' ';
        console.log(
          `  ${flag} ${money}${String(r.crap).padStart(7)} ${String(r.complexity).padStart(3)} ` +
            `${fmtCoverage(r.coverage).padStart(7)}  ${r.function} @ ${r.file}:${r.line}`,
        );
      }
    }
    console.log(
      `\n  ${rows.length} functions analysed, ${scoredRows.length} scored, ` +
        `${rows.length - scoredRows.length} with unknown coverage.`,
    );
    if (criticalGaps.length > 0) {
      console.log(
        `  ${criticalGaps.length} money/auth file(s) absent from this coverage report ` +
          `(not scored — run full coverage, or use --require-coverage to gate on it):`,
      );
      for (const g of criticalGaps.slice(0, 10)) {
        console.log(`    - ${g.file} (${g.functions} functions)`);
      }
      if (criticalGaps.length > 10) console.log(`    ... and ${criticalGaps.length - 10} more`);
    }
    if (breaches.length > 0) {
      console.log(`\n  ${breaches.length} breach(es) of the ${args.maxCrap} ceiling on gated paths:`);
      for (const b of breaches) {
        console.log(`    - ${b.function} @ ${b.file}:${b.line} — CRAP ${b.crap} (cx ${b.complexity}, cov ${fmtCoverage(b.coverage)})`);
      }
      console.log(
        `\n  Fix by adding tests for the uncovered branches (cheapest), or by splitting\n` +
          `  the function so each piece is simple enough to test.`,
      );
    }
  }

  let failed = false;
  if (args.gate && breaches.length > 0) {
    console.error(`\ncrap-report: FAILED — ${breaches.length} function(s) exceed CRAP ${args.maxCrap} on gated paths.`);
    failed = true;
  }
  if (args.requireCoverage && criticalGaps.length > 0) {
    console.error(
      `\ncrap-report: FAILED — ${criticalGaps.length} money/auth file(s) have no coverage data at all:\n` +
        criticalGaps.map((g) => `    - ${g.file}`).join('\n'),
    );
    failed = true;
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(`crap-report: ${err.stack || err.message}`);
  process.exit(2);
});

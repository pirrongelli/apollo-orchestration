#!/usr/bin/env node
// Spec for the quality ratchet comparison logic.
// Run: node --test ratchet-lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareWarningCounts, compareFileSets, aggregateEslintWarnings } from './ratchet-lib.mjs';

// ---------------------------------------------------------------------------
// compareWarningCounts — total AND per-rule, so fixing one rule cannot pay for
// regressing another.
// ---------------------------------------------------------------------------

// Baselines must carry byFileRule: without it the ratchet cannot detect a
// warning moving between files, so compareWarningCounts refuses to run.
const BASE = {
  total: 10,
  byRule: { complexity: 7, 'react-hooks/exhaustive-deps': 3 },
  byFileRule: { 'src/x.ts': { complexity: 7, 'react-hooks/exhaustive-deps': 3 } },
};
/** current-shape helper keeping per-file counts consistent with per-rule ones */
const cur = (byRule, extra = {}) => ({
  total: Object.values(byRule).reduce((a, b) => a + b, 0),
  byRule,
  byFileRule: { 'src/x.ts': byRule },
  ...extra,
});

test('compareWarningCounts: identical counts pass', () => {
  const r = compareWarningCounts(BASE, cur({ complexity: 7, 'react-hooks/exhaustive-deps': 3 }));
  assert.equal(r.ok, true);
  assert.equal(r.regressions.length, 0);
});

test('compareWarningCounts: fewer warnings pass and are reported as improvement', () => {
  const r = compareWarningCounts(BASE, cur({ complexity: 5, 'react-hooks/exhaustive-deps': 3 }));
  assert.equal(r.ok, true);
  assert.equal(r.totalDelta, -2);
  assert.ok(r.improvements.some((i) => i.rule === 'complexity' && i.current === 5));
});

test('compareWarningCounts: more warnings in total fail', () => {
  const r = compareWarningCounts(BASE, cur({ complexity: 8, 'react-hooks/exhaustive-deps': 3 }));
  assert.equal(r.ok, false);
  assert.ok(r.regressions.some((x) => x.rule === 'complexity' && x.baseline === 7 && x.current === 8));
});

test('compareWarningCounts: a swap that keeps the total flat still fails', () => {
  // Fixing 2 complexity warnings does not buy 2 new exhaustive-deps warnings.
  // Total-only ratchets miss this, which is why per-rule counts are compared.
  const r = compareWarningCounts(BASE, cur({ complexity: 5, 'react-hooks/exhaustive-deps': 5 }));
  assert.equal(r.ok, false);
  assert.ok(r.regressions.some((x) => x.rule === 'react-hooks/exhaustive-deps'));
});

test('compareWarningCounts: a rule absent from the baseline has an implicit baseline of 0', () => {
  const r = compareWarningCounts(BASE, cur({ complexity: 7, 'react-hooks/exhaustive-deps': 3, 'no-console': 1 }));
  assert.equal(r.ok, false);
  const reg = r.regressions.find((x) => x.rule === 'no-console');
  assert.ok(reg, 'a newly-appearing rule is a regression');
  assert.equal(reg.baseline, 0);
});

test('compareWarningCounts: any ERROR fails regardless of the warning ratchet', () => {
  const r = compareWarningCounts(BASE, cur({ complexity: 5 }, { errors: 1 }));
  assert.equal(r.ok, false);
  assert.equal(r.errors, 1);
});

test('compareWarningCounts: a missing baseline fails closed with guidance', () => {
  const r = compareWarningCounts(null, cur({}));
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /baseline/i);
});

// ---------------------------------------------------------------------------
// compareFileSets — the @ts-nocheck inventory. A file opting out of type
// checking is invisible to the typecheck ratchet, so the count must only fall.
// ---------------------------------------------------------------------------

test('compareFileSets: the same set passes', () => {
  const r = compareFileSets(['a.ts', 'b.ts'], ['b.ts', 'a.ts']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.added, []);
});

test('compareFileSets: a removed file passes and is reported', () => {
  const r = compareFileSets(['a.ts', 'b.ts'], ['a.ts']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.removed, ['b.ts']);
});

test('compareFileSets: an added file fails and is named', () => {
  const r = compareFileSets(['a.ts'], ['a.ts', 'new.ts']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.added, ['new.ts']);
});

test('compareFileSets: a rename counts as an addition (the escape hatch moved)', () => {
  const r = compareFileSets(['old.ts'], ['renamed.ts']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.added, ['renamed.ts']);
  assert.deepEqual(r.removed, ['old.ts']);
});

test('compareFileSets: a missing baseline fails closed', () => {
  const r = compareFileSets(null, ['a.ts']);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /baseline/i);
});

// ---------------------------------------------------------------------------
// aggregateEslintWarnings — reads ESLint's JSON formatter output.
// ---------------------------------------------------------------------------

const ESLINT_JSON = [
  {
    filePath: '/repo/src/a.ts',
    messages: [
      { ruleId: 'complexity', severity: 1 },
      { ruleId: 'complexity', severity: 1 },
      { ruleId: 'prefer-const', severity: 2 },
    ],
  },
  { filePath: '/repo/src/b.ts', messages: [{ ruleId: 'react-hooks/exhaustive-deps', severity: 1 }] },
  { filePath: '/repo/src/c.ts', messages: [] },
];

test('aggregateEslintWarnings: counts warnings per rule and errors separately', () => {
  const agg = aggregateEslintWarnings(ESLINT_JSON);
  assert.equal(agg.total, 3);
  assert.equal(agg.byRule.complexity, 2);
  assert.equal(agg.byRule['react-hooks/exhaustive-deps'], 1);
  assert.equal(agg.errors, 1, 'errors are not counted as warnings');
});

test('aggregateEslintWarnings: a message with no ruleId is still counted', () => {
  const agg = aggregateEslintWarnings([{ filePath: 'x', messages: [{ ruleId: null, severity: 1 }] }]);
  assert.equal(agg.total, 1);
  assert.equal(agg.byRule['(no-rule)'], 1);
});

test('aggregateEslintWarnings: empty input yields a zero baseline, not a crash', () => {
  const agg = aggregateEslintWarnings([]);
  assert.equal(agg.total, 0);
  assert.deepEqual(agg.byRule, {});
});

// ---------------------------------------------------------------------------
// Per-file dimension: a warning that MOVES between files keeps the per-rule
// total flat, so total+per-rule alone lets a fix in one file pay for a new
// warning in another (found by independent review).
// ---------------------------------------------------------------------------

const BASE_FILES = {
  total: 2,
  byRule: { complexity: 2 },
  byFileRule: { 'src/a.ts': { complexity: 2 } },
};

test('compareWarningCounts: a warning moving to another file is a regression', () => {
  const current = {
    total: 2,
    byRule: { complexity: 2 }, // per-rule total unchanged
    byFileRule: { 'src/a.ts': { complexity: 1 }, 'src/b.ts': { complexity: 1 } },
  };
  const r = compareWarningCounts(BASE_FILES, current);
  assert.equal(r.ok, false, 'flat totals must not hide a new warning in a new file');
  assert.ok(
    r.regressions.some((x) => x.file === 'src/b.ts' && x.rule === 'complexity'),
    `expected src/b.ts flagged, got ${JSON.stringify(r.regressions)}`,
  );
});

test('compareWarningCounts: same files and counts still pass', () => {
  const r = compareWarningCounts(BASE_FILES, {
    total: 2,
    byRule: { complexity: 2 },
    byFileRule: { 'src/a.ts': { complexity: 2 } },
  });
  assert.equal(r.ok, true);
});

test('compareWarningCounts: fixing warnings in a file passes and is an improvement', () => {
  const r = compareWarningCounts(BASE_FILES, {
    total: 1,
    byRule: { complexity: 1 },
    byFileRule: { 'src/a.ts': { complexity: 1 } },
  });
  assert.equal(r.ok, true);
  assert.ok(r.improvements.some((i) => i.file === 'src/a.ts'));
});

test('compareWarningCounts: a baseline without the per-file map fails closed with guidance', () => {
  const r = compareWarningCounts({ total: 2, byRule: { complexity: 2 } }, {
    total: 2,
    byRule: { complexity: 2 },
    byFileRule: { 'src/a.ts': { complexity: 2 } },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /regenerate|byFileRule|baseline/i);
});

test('aggregateEslintWarnings: records warnings per file AND per rule', () => {
  const agg = aggregateEslintWarnings(ESLINT_JSON, '/repo');
  assert.equal(agg.byFileRule['src/a.ts'].complexity, 2);
  assert.equal(agg.byFileRule['src/b.ts']['react-hooks/exhaustive-deps'], 1);
  assert.equal(agg.byFileRule['src/c.ts'], undefined, 'clean files are omitted');
});

test('aggregateEslintWarnings: file paths are repo-relative and forward-slashed', () => {
  const agg = aggregateEslintWarnings([
    { filePath: '/repo/src/deep/x.ts', messages: [{ ruleId: 'complexity', severity: 1 }] },
  ], '/repo');
  assert.deepEqual(Object.keys(agg.byFileRule), ['src/deep/x.ts']);
});

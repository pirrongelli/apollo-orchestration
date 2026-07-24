#!/usr/bin/env node
// Spec for the CRAP (Change Risk Anti-Patterns) library.
// Run: node --test examples/quality/crap-lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

import {
  crapScore,
  parseLcovLineHits,
  rangeCoverageRatio,
  analyzeSource,
  isCriticalPath,
  CRITICAL_PATH_PATTERNS,
} from './crap-lib.mjs';

// ---------------------------------------------------------------------------
// crapScore — CRAP(m) = comp(m)^2 * (1 - cov(m))^3 + comp(m)
// ---------------------------------------------------------------------------

test('crapScore: fully covered code scores its complexity', () => {
  assert.equal(crapScore(1, 1), 1);
  assert.equal(crapScore(5, 1), 5);
  assert.equal(crapScore(20, 1), 20);
});

test('crapScore: uncovered code pays the full quadratic penalty', () => {
  assert.equal(crapScore(1, 0), 2); // 1*1 + 1
  assert.equal(crapScore(5, 0), 30); // 25*1 + 5
  assert.equal(crapScore(10, 0), 110); // 100*1 + 10
});

test('crapScore: partial coverage uses the cubic term', () => {
  assert.equal(crapScore(10, 0.5), 22.5); // 100*0.125 + 10
  assert.equal(crapScore(4, 0.75), 4.25); // 16*0.015625 + 4
});

test('crapScore: a simple uncovered function is still acceptable, a complex one is not', () => {
  // The metric's whole point: complexity and coverage interact non-linearly.
  assert.ok(crapScore(2, 0) < 10, 'trivial untested code stays low');
  assert.ok(crapScore(12, 0) > 100, 'complex untested code explodes');
  assert.ok(crapScore(12, 0.95) < 15, 'complex but well-tested code is fine');
});

test('crapScore: clamps coverage to [0,1] and rejects nonsense input', () => {
  assert.equal(crapScore(3, 1.5), crapScore(3, 1));
  assert.equal(crapScore(3, -0.2), crapScore(3, 0));
  assert.throws(() => crapScore(Number.NaN, 0.5), /complexity/i);
  assert.throws(() => crapScore(3, Number.NaN), /coverage/i);
});

// ---------------------------------------------------------------------------
// parseLcovLineHits
// ---------------------------------------------------------------------------

const LCOV = `TN:
SF:src/a.ts
FN:1,doThing
FNDA:2,doThing
DA:1,2
DA:2,0
DA:3,5
LF:3
LH:2
end_of_record
SF:src/b.ts
DA:10,0
LF:1
LH:0
end_of_record
`;

test('parseLcovLineHits: maps per-file line hit counts', () => {
  const hits = parseLcovLineHits(LCOV);
  assert.deepEqual([...hits.keys()].sort(), ['src/a.ts', 'src/b.ts']);
  assert.equal(hits.get('src/a.ts').get(1), 2);
  assert.equal(hits.get('src/a.ts').get(2), 0);
  assert.equal(hits.get('src/a.ts').get(3), 5);
  assert.equal(hits.get('src/b.ts').get(10), 0);
});

test('parseLcovLineHits: sums hits when a file appears in several records (merged lcov)', () => {
  const merged = `SF:src/a.ts
DA:1,1
end_of_record
SF:src/a.ts
DA:1,3
DA:2,0
end_of_record
`;
  const hits = parseLcovLineHits(merged);
  assert.equal(hits.get('src/a.ts').get(1), 4, 'hits accumulate across records');
  assert.equal(hits.get('src/a.ts').get(2), 0);
});

test('parseLcovLineHits: tolerates empty input', () => {
  assert.equal(parseLcovLineHits('').size, 0);
});

// ---------------------------------------------------------------------------
// rangeCoverageRatio
// ---------------------------------------------------------------------------

test('rangeCoverageRatio: ratio of covered instrumented lines inside the range', () => {
  const lineHits = new Map([
    [1, 2],
    [2, 0],
    [3, 5],
    [4, 0],
  ]);
  assert.equal(rangeCoverageRatio(lineHits, 1, 4), 0.5);
  assert.equal(rangeCoverageRatio(lineHits, 1, 1), 1);
  assert.equal(rangeCoverageRatio(lineHits, 2, 2), 0);
});

test('rangeCoverageRatio: returns null when the range has no instrumented lines', () => {
  const lineHits = new Map([[100, 1]]);
  assert.equal(rangeCoverageRatio(lineHits, 1, 10), null);
  assert.equal(rangeCoverageRatio(new Map(), 1, 10), null);
});

// ---------------------------------------------------------------------------
// analyzeSource — cyclomatic complexity + function ranges
// ---------------------------------------------------------------------------

function analyze(code) {
  return analyzeSource(ts, code, 'sample.ts');
}

test('analyzeSource: a branchless function has complexity 1', () => {
  const fns = analyze(`function plain() { return 42; }`);
  assert.equal(fns.length, 1);
  assert.equal(fns[0].name, 'plain');
  assert.equal(fns[0].complexity, 1);
});

test('analyzeSource: if adds one, else does not', () => {
  assert.equal(analyze(`function f(a){ if(a){ return 1; } return 2; }`)[0].complexity, 2);
  assert.equal(analyze(`function f(a){ if(a){ return 1; } else { return 2; } }`)[0].complexity, 2);
});

test('analyzeSource: loops, catch, ternary and logical operators each add one', () => {
  assert.equal(analyze(`function f(x){ for(let i=0;i<x;i++){} while(x){} return 1; }`)[0].complexity, 3);
  assert.equal(analyze(`function f(){ try { go(); } catch (e) { handle(e); } }`)[0].complexity, 2);
  assert.equal(analyze(`function f(a){ return a ? 1 : 2; }`)[0].complexity, 2);
  assert.equal(analyze(`function f(a,b){ return a && b; }`)[0].complexity, 2);
  assert.equal(analyze(`function f(a,b){ return a || b; }`)[0].complexity, 2);
  assert.equal(analyze(`function f(a,b){ return a ?? b; }`)[0].complexity, 2);
});

test('analyzeSource: switch counts each case clause, not the default', () => {
  const code = `function f(x){ switch(x){ case 1: return 1; case 2: return 2; default: return 0; } }`;
  assert.equal(analyze(code)[0].complexity, 3); // 1 + two cases
});

test('analyzeSource: nested functions are reported separately and do not inflate the parent', () => {
  const code = `
function outer(a) {
  if (a) { return 1; }
  const inner = (b) => (b ? 2 : 3);
  return inner(a);
}`;
  const fns = analyze(code);
  const outer = fns.find((f) => f.name === 'outer');
  const inner = fns.find((f) => f.name === 'inner');
  assert.ok(outer && inner, 'both functions reported');
  assert.equal(outer.complexity, 2, 'outer keeps only its own if');
  assert.equal(inner.complexity, 2, 'inner keeps its own ternary');
});

test('analyzeSource: names arrow functions, methods and anonymous functions usefully', () => {
  const code = `
const handler = (x) => x + 1;
class Svc { pay(amount) { return amount; } }
run(function () { return 1; });`;
  const names = analyze(code).map((f) => f.name);
  assert.ok(names.includes('handler'), `arrow named from its binding: ${names}`);
  assert.ok(names.includes('pay'), `method named: ${names}`);
  assert.ok(names.some((n) => n.includes('anonymous')), `anonymous labelled: ${names}`);
});

test('analyzeSource: reports 1-based start and end lines spanning the function', () => {
  const code = `const x = 1;
function f(a) {
  if (a) { return 1; }
  return 2;
}`;
  const [fn] = analyze(code);
  assert.equal(fn.startLine, 2);
  assert.equal(fn.endLine, 5);
});

test('analyzeSource: handles TSX without throwing', () => {
  const fns = analyzeSource(ts, `export const C = () => <div>{1 && 2}</div>;`, 'C.tsx');
  assert.equal(fns.length, 1);
  assert.equal(fns[0].complexity, 2);
});

// ---------------------------------------------------------------------------
// isCriticalPath — the gated money/auth surfaces
// ---------------------------------------------------------------------------

test('isCriticalPath: money and auth surfaces are gated', () => {
  assert.ok(isCriticalPath('src/lib/money/transfer.ts'));
  assert.ok(isCriticalPath('src/lib/idempotency.ts'));
  assert.ok(isCriticalPath('src/features/auth/useSession.ts'));
  assert.ok(isCriticalPath('functions/payments/index.ts'));
});

test('isCriticalPath: ordinary UI is not gated', () => {
  assert.equal(isCriticalPath('src/components/ui/button.tsx'), false);
  assert.equal(isCriticalPath('src/pages/admin/Dashboard.tsx'), false);
});

test('isCriticalPath: test files are never gated as production surfaces', () => {
  assert.equal(isCriticalPath('src/lib/__tests__/idempotency.test.ts'), false);
  assert.equal(isCriticalPath('functions/payments/index_test.ts'), false);
});

test('CRITICAL_PATH_PATTERNS is non-empty and documented as extendable', () => {
  assert.ok(Array.isArray(CRITICAL_PATH_PATTERNS) && CRITICAL_PATH_PATTERNS.length > 0);
});

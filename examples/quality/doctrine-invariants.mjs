#!/usr/bin/env node
// Doctrine guard: the project constitution may be rewritten, but not silently
// weakened.
//
// Two failures we actually shipped, both invisible to every other gate:
//   1. A rewrite of the constitution DROPPED the rule requiring an independent
//      review to be recorded per commit. Only a human reading the diff caught
//      it. Nothing in CI reads the constitution, so nothing else could have.
//   2. The constitution claimed a rule was "enforced by .agent/hooks/..." — and
//      that hook DID NOT EXIST. A rule that claims enforcement it does not have
//      is worse than an admitted convention: it buys false confidence.
//
// So this checks two things a diff review misses:
//   A. INVARIANTS — load-bearing phrases that must survive any rewording.
//      Rewording one on purpose trips this, which is the reminder to think.
//   B. ENFORCEMENT CLAIMS — every hook the constitution names must exist on
//      disk AND be registered in the agent config, and every registered hook
//      must exist.
//
// Ships --selftest (prove the instrument before trusting the measurement): a
// known-good fixture must pass and each known-bad fixture must be CAUGHT. A
// guard that has never been shown to fail is decoration.
//
// CEILING: this is a canary, not a proof. A pin only asks "does this rule still
// appear in SOME block of the constitution" — so surgically moving a rule into
// a weaker section, or deleting one of two mentions, passes. It catches
// wholesale removal and false enforcement claims, which are the two failures we
// actually shipped. Upgrade path if that stops being enough: pin section-scoped,
// i.e. require the phrase inside the heading it belongs to.
//
// Three narrower holes an independent review found in the first version are now
// CLOSED, each with its own selftest fixture: malformed config text-scanned as
// if it were a registration, a pin matching across a paragraph break, and hook
// filenames the pattern could not see. The general caveat above still stands.
//
// Practice adopted from ponytail (https://github.com/DietrichGebert/ponytail).
//
// Usage: node doctrine-invariants.mjs [--selftest]

import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Paths this guard asserts about. Point them at your own constitution and
// agent config; everything else in the file is generic.
const DOCTRINE_FILE = 'CONVENTIONS.md';
const CONFIG_FILE = '.agent/config.json';
const HOOK_DIR = '.agent/hooks';

// Load-bearing rules. Each entry is a literal substring of the constitution
// plus WHY it is pinned, so a future editor knows what they are about to
// delete. Keep these short and quotable — long pins break on harmless
// rewrapping. Replace this list with your own; the shape is the point.
const INVARIANTS = [
  ['the doer never judges its own work', 'independent review before merge — the whole verification model'],
  ['.agent/approvals/', 'approvals recorded per commit SHA — dropped once in a rewrite'],
  ['never full-branch', 'promotion toward production is cherry-picked, not a branch merge'],
  ['complexity ceiling', 'the gate that keeps critical paths testable as single units'],
  ['TDD is the default', 'a bugfix starts with a failing test'],
  ['Moving real money', 'hard stop — money is never the agent\'s call'],
  ['External API validation is MANDATORY', 'vendor docs are hypotheses; the sandbox is truth'],
  ['no AI attribution', 'the repository owner is the sole author'],
];

// The constitution is hard-wrapped, so a pinned phrase routinely spans two
// lines. Collapse whitespace on both sides: rewrapping a paragraph is not a
// rule change, and a guard that cries wolf on reflow gets switched off.
const flatten = (s) => s.replace(/\s+/g, ' ').trim();

// ...but flattening the WHOLE file lets a pin match across unrelated text: a
// review deleted "TDD is the default" and the guard still passed, because
// "TDD is" ended one paragraph and "the default branch is dev" began the next.
// So match within a single block instead. A block ends at a blank line, a
// heading, or a new list item — exactly where an unrelated sentence starts,
// while a hard-wrapped rule stays inside one block.
function blocksOf(text) {
  const blocks = [];
  let current = [];
  const flush = () => { if (current.length) blocks.push(flatten(current.join(' '))); current = []; };
  for (const line of text.split('\n')) {
    if (line.trim() === '' || /^\s*([-*+]|\d+[.)])\s/.test(line) || /^#{1,6}\s/.test(line)) flush();
    if (line.trim() !== '') current.push(line);
  }
  flush();
  return blocks;
}

// Every `<HOOK_DIR>/<name>.sh` mentioned in a text. Hook filenames are not
// limited to lowercase-and-dashes: `task_gate.sh` and `hooks/sub/x.sh` are
// valid, and a claim naming one used to be invisible here — so a false
// enforcement claim, the exact thing this guard exists to catch, slipped
// straight through. Match any plausible shell filename under the hooks dir.
function hooksNamedIn(text) {
  const re = new RegExp(`${HOOK_DIR.replace(/[.]/g, '\\.')}/[A-Za-z0-9._/-]+\\.sh`, 'g');
  return [...new Set([...text.matchAll(re)].map((m) => m[0]))];
}

/**
 * @returns {string[]} failure messages; empty means the doctrine is intact.
 */
export function checkDoctrine(root) {
  const failures = [];
  const doctrinePath = join(root, DOCTRINE_FILE);
  const configPath = join(root, CONFIG_FILE);

  if (!existsSync(doctrinePath)) return [`${DOCTRINE_FILE} not found at ${doctrinePath}`];
  const doctrine = readFileSync(doctrinePath, 'utf8');
  const blocks = blocksOf(doctrine);

  for (const [phrase, why] of INVARIANTS) {
    const needle = flatten(phrase);
    if (!blocks.some((b) => b.includes(needle))) {
      failures.push(`${DOCTRINE_FILE} lost a load-bearing rule: "${phrase}" (${why})`);
    }
  }

  // Enforcement claims must be real. Anything that stops us confirming them is
  // a failure, not a pass: a guard that cannot verify must not allow. The config
  // is PARSED, not text-scanned — malformed JSON that merely contains a hook
  // path is not a registration, because the harness cannot load that file
  // either, so in reality nothing is registered at all.
  let registered = [];
  if (!existsSync(configPath)) {
    failures.push(`${CONFIG_FILE} not found — cannot verify any enforcement claim`);
  } else {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
      registered = hooksNamedIn(JSON.stringify(parsed));
    } catch (e) {
      failures.push(`${CONFIG_FILE} is not valid JSON (${e.message}) — the harness cannot load it, so NO hook is registered and every enforcement claim is false`);
    }
  }

  // Claimed → must exist, and must actually be wired up.
  for (const hook of hooksNamedIn(doctrine)) {
    if (!existsSync(join(root, hook))) {
      failures.push(`${DOCTRINE_FILE} claims enforcement by ${hook}, which does not exist on disk`);
    } else if (!registered.includes(hook)) {
      failures.push(`${DOCTRINE_FILE} claims enforcement by ${hook}, but it is not registered in ${CONFIG_FILE} — the rule is convention, not a wall`);
    }
  }

  // Registered → must exist. The other direction: a hook the config names but
  // nothing provides never runs, and nothing tells you.
  for (const hook of registered) {
    if (!existsSync(join(root, hook))) {
      failures.push(`${CONFIG_FILE} registers ${hook}, which does not exist — that hook silently never runs`);
    }
  }

  return failures;
}

// ---- selftest: prove the instrument before trusting the measurement --------
function buildFixture(dir, { doctrine, config, hooks }) {
  mkdirSync(join(dir, HOOK_DIR), { recursive: true });
  mkdirSync(join(dir, CONFIG_FILE, '..'), { recursive: true });
  writeFileSync(join(dir, DOCTRINE_FILE), doctrine);
  writeFileSync(join(dir, CONFIG_FILE), config);
  for (const h of hooks) writeFileSync(join(dir, HOOK_DIR, h), '#!/usr/bin/env bash\n');
}

function selftest() {
  const root = mkdtempSync(join(tmpdir(), 'doctrine-'));
  // A good fixture carries every invariant verbatim plus one honest hook claim.
  const goodDoctrine =
    INVARIANTS.map(([p]) => `- ${p}\n`).join('') +
    `Enforced by \`${HOOK_DIR}/merge-gate.sh\`.\n`;
  const goodConfig = `{"hooks":{"PreToolUse":[{"command":"${HOOK_DIR}/merge-gate.sh"}]}}`;

  const cases = [
    ['good fixture passes',
      { doctrine: goodDoctrine, config: goodConfig, hooks: ['merge-gate.sh'] }, 0],
    // Regression: the first real run failed because the constitution is
    // hard-wrapped, so a pin spanning two lines read as "deleted". Reflow is
    // not a rule change, and a guard that says it is gets disabled by Friday.
    ['a hard-wrapped invariant still passes',
      { doctrine: goodDoctrine.replace('the doer never judges its own work', 'the doer never\n  judges its own work'), config: goodConfig, hooks: ['merge-gate.sh'] }, 0],
    ['a dropped invariant is caught',
      { doctrine: goodDoctrine.replace('- the doer never judges its own work\n', ''), config: goodConfig, hooks: ['merge-gate.sh'] }, 1],
    ['a claimed-but-missing hook is caught',
      { doctrine: goodDoctrine, config: goodConfig, hooks: [] }, 1],
    ['a claimed-but-unregistered hook is caught',
      { doctrine: goodDoctrine, config: '{"hooks":{}}', hooks: ['merge-gate.sh'] }, 1],
    ['a registered-but-missing hook is caught',
      { doctrine: 'nothing claimed here', config: goodConfig, hooks: [] }, 1],
    ['an unreadable config fails closed',
      { doctrine: goodDoctrine, config: goodConfig, hooks: ['merge-gate.sh'], noConfig: true }, 1],

    // The three false-PASS holes an independent review found in the first
    // version. A guard's selftest is only worth what its nastiest fixture is
    // worth, so each attack lives here permanently.
    ['malformed config is NOT treated as a registration',
      // Contains the hook path as raw text, but does not parse — the harness
      // would load nothing, so the enforcement claim is false.
      { doctrine: goodDoctrine, config: `{"hooks": [${HOOK_DIR}/merge-gate.sh,,,`, hooks: ['merge-gate.sh'] }, 1],
    ['a pin cannot match across a paragraph break',
      // "TDD is" ends one block, "the default ..." begins the next. Flattening
      // the whole file made this pass while the real rule was gone.
      { doctrine: goodDoctrine.replace('- TDD is the default\n', '- TDD is\n\n- the default branch is main\n'), config: goodConfig, hooks: ['merge-gate.sh'] }, 1],
    ['an underscored hook claim is not invisible',
      { doctrine: `${goodDoctrine}Enforced by \`${HOOK_DIR}/task_gate.sh\`.\n`, config: goodConfig, hooks: ['merge-gate.sh'] }, 1],
  ];

  let broken = 0;
  for (const [label, fixture, wantFailures] of cases) {
    const dir = mkdtempSync(join(root, 'case-'));
    buildFixture(dir, fixture);
    if (fixture.noConfig) rmSync(join(dir, CONFIG_FILE));
    const got = checkDoctrine(dir);
    const ok = wantFailures === 0 ? got.length === 0 : got.length > 0;
    console.log(`  ${ok ? 'ok' : 'BROKEN'} — ${label}${ok ? '' : ` (got ${got.length} failures: ${got.join('; ')})`}`);
    if (!ok) broken++;
  }
  rmSync(root, { recursive: true, force: true });

  if (broken) {
    console.error(`\nSelftest FAILED: ${broken} case(s). The guard is not trustworthy — fix it before believing a pass.`);
    process.exit(1);
  }
  console.log(`\nSelftest passed: ${cases.length} cases, instrument catches every known-bad fixture.`);
}

if (process.argv[2] === '--selftest') {
  selftest();
} else {
  const failures = checkDoctrine(process.cwd());
  if (failures.length) {
    console.error('Doctrine guard FAILED:\n');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('\nA rule was reworded away or an enforcement claim is false. If the change');
    console.error('was deliberate, update INVARIANTS in this file in the SAME commit — that');
    console.error('edit is the review trigger, not an obstacle.');
    process.exit(1);
  }
  console.log(`Doctrine intact: ${INVARIANTS.length} invariants present, every enforcement claim backed by a registered hook.`);
}

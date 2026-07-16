#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) { console.error('usage: check-features-immutable.mjs <features.json>'); process.exit(2); }
const now = JSON.parse(readFileSync(path, 'utf8'));

let prev = [];

// A failure to reach a usable git repo/HEAD is a real tooling error, NOT
// "no baseline" — fail closed so a broken environment can't green the gate.
try {
  execSync('git rev-parse --verify HEAD', { stdio: 'ignore' });
} catch (err) {
  console.error('IMMUTABILITY CHECK ERROR: not a git repo or HEAD is unavailable — cannot verify the baseline:\n' + err.message);
  process.exit(1);
}

// HEAD is valid; now distinguish "path genuinely absent in HEAD" (first
// commit of this file — OK) from every other case (baseline present).
let existsInHead = true;
try {
  execSync(`git cat-file -e HEAD:${path}`, { stdio: 'ignore' });
} catch {
  existsInHead = false; // path not tracked in HEAD → no committed baseline
}

if (!existsInHead) {
  console.log('no committed baseline yet — OK');
  process.exit(0);
}

try {
  prev = JSON.parse(execSync(`git show HEAD:${path}`, { encoding: 'utf8' }));
} catch (err) {
  // The path exists in HEAD but reading/parsing it failed (corrupt JSON,
  // git error, etc). This is NOT "no baseline" — fail closed rather than
  // silently treating a broken baseline as green.
  console.error('IMMUTABILITY CHECK ERROR: baseline exists in HEAD but could not be read/parsed:\n' + err.message);
  process.exit(1);
}

const nowById = new Map(now.map(f => [f.id, f]));
const errors = [];
for (const p of prev) {
  const n = nowById.get(p.id);
  if (!n) { errors.push(`removed: ${p.id}`); continue; }
  if (n.description !== p.description) errors.push(`edited description: ${p.id}`);
  if (n.verify !== p.verify) errors.push(`edited verify: ${p.id}`);
}
if (errors.length) { console.error('IMMUTABILITY VIOLATIONS:\n' + errors.join('\n')); process.exit(1); }
console.log(`immutable OK — ${prev.length} baseline entries intact, ${now.length - prev.length} appended`);

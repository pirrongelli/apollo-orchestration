// Quality ratchet comparison logic — pure functions, no I/O.
//
// The repo already ratchets types (your type-check ratchet) and coverage
// (your coverage-regression check). These two ratchets close the remaining
// holes: ESLint WARNINGS, which `eslint .` never fails on, and files carrying
// `@ts-nocheck`, which opt out of type checking entirely and are therefore
// invisible to the typecheck ratchet.
//
// Both are "can only improve" gates: the baseline is committed, a regression
// fails, and lowering the baseline is an explicit, reviewable act (--update).

/**
 * Compare current ESLint warning counts against the committed baseline.
 *
 * Per-rule counts are compared as well as the total, because a total-only
 * ratchet lets a change fix two warnings of one rule and introduce two of
 * another while looking flat.
 *
 * @param {{total:number, byRule:Record<string,number>}|null} baseline
 * @param {{total:number, byRule:Record<string,number>, errors?:number}} current
 */
export function compareWarningCounts(baseline, current) {
  const cur = { total: 0, byRule: {}, byFileRule: {}, errors: 0, ...(current ?? {}) };
  if (!baseline || typeof baseline.total !== 'number' || !baseline.byRule) {
    return {
      ok: false,
      reason:
        'No warning baseline found. Run `npm run quality:lint-ratchet -- --update` and commit the result.',
      regressions: [],
      improvements: [],
      totalDelta: 0,
      errors: cur.errors ?? 0,
    };
  }
  if (!baseline.byFileRule) {
    // The per-file map is what catches a warning MOVING between files while the
    // per-rule total stays flat. An older baseline without it cannot make that
    // guarantee, so refuse rather than silently checking less than advertised.
    return {
      ok: false,
      reason:
        'Baseline predates per-file tracking (no byFileRule). Regenerate it with `npm run quality:lint-ratchet -- --update` and commit.',
      regressions: [],
      improvements: [],
      totalDelta: cur.total - baseline.total,
      errors: cur.errors ?? 0,
    };
  }

  const regressions = [];
  const improvements = [];

  // Per-rule totals: fixing one rule must not pay for regressing another.
  const rules = new Set([...Object.keys(baseline.byRule), ...Object.keys(cur.byRule)]);
  for (const rule of rules) {
    const before = baseline.byRule[rule] ?? 0;
    const after = cur.byRule[rule] ?? 0;
    if (after > before) regressions.push({ rule, baseline: before, current: after });
    else if (after < before) improvements.push({ rule, baseline: before, current: after });
  }

  // Per-file+rule: catches a warning moving from one file to another, which
  // leaves every total unchanged and would otherwise pass.
  const files = new Set([...Object.keys(baseline.byFileRule), ...Object.keys(cur.byFileRule)]);
  for (const file of files) {
    const beforeRules = baseline.byFileRule[file] ?? {};
    const afterRules = cur.byFileRule[file] ?? {};
    for (const rule of new Set([...Object.keys(beforeRules), ...Object.keys(afterRules)])) {
      const before = beforeRules[rule] ?? 0;
      const after = afterRules[rule] ?? 0;
      if (after > before) regressions.push({ file, rule, baseline: before, current: after });
      else if (after < before) improvements.push({ file, rule, baseline: before, current: after });
    }
  }

  const totalDelta = cur.total - baseline.total;
  const errors = cur.errors ?? 0;
  // Errors already fail `npm run lint`; failing here too means this gate never
  // reports "clean" on a run that had errors.
  const ok = errors === 0 && totalDelta <= 0 && regressions.length === 0;
  return { ok, totalDelta, regressions, improvements, errors, baselineTotal: baseline.total, currentTotal: cur.total };
}

/**
 * Compare a current file set against the committed baseline set.
 * Used for the `@ts-nocheck` inventory: removals are progress, any addition is
 * a regression, and a rename reads as one of each (the escape hatch moved, so
 * it needs a fresh look).
 * @param {string[]|null} baselineFiles
 * @param {string[]} currentFiles
 */
export function compareFileSets(baselineFiles, currentFiles) {
  const current = [...new Set(currentFiles ?? [])].sort();
  if (!Array.isArray(baselineFiles)) {
    return {
      ok: false,
      reason:
        'No @ts-nocheck baseline found. Run `npm run quality:ts-nocheck -- --update` and commit the result.',
      added: current,
      removed: [],
    };
  }
  const base = new Set(baselineFiles);
  const currentSet = new Set(current);
  const added = current.filter((f) => !base.has(f));
  const removed = [...base].filter((f) => !currentSet.has(f)).sort();
  return { ok: added.length === 0, added, removed, baselineCount: base.size, currentCount: current.length };
}

/**
 * Aggregate ESLint JSON-formatter output into total/per-rule warning counts.
 * Severity 1 is a warning, 2 is an error; errors are counted separately so a
 * failing lint run can never be mistaken for a clean ratchet.
 * @param {Array<{messages: Array<{ruleId: string|null, severity: number}>}>} eslintJson
 */
export function aggregateEslintWarnings(eslintJson, repoRoot = process.cwd()) {
  const byRule = {};
  const byFileRule = {};
  let total = 0;
  let errors = 0;
  const rel = (p) => {
    const norm = String(p ?? '').replace(/\\/g, '/');
    const root = String(repoRoot ?? '').replace(/\\/g, '/').replace(/\/$/, '');
    return root && norm.startsWith(`${root}/`) ? norm.slice(root.length + 1) : norm;
  };
  for (const file of eslintJson ?? []) {
    for (const message of file.messages ?? []) {
      if (message.severity === 2) {
        errors += 1;
        continue;
      }
      if (message.severity !== 1) continue;
      const rule = message.ruleId ?? '(no-rule)';
      byRule[rule] = (byRule[rule] ?? 0) + 1;
      const key = rel(file.filePath);
      byFileRule[key] = byFileRule[key] ?? {};
      byFileRule[key][rule] = (byFileRule[key][rule] ?? 0) + 1;
      total += 1;
    }
  }
  return { total, byRule, byFileRule, errors };
}

/** Stable, diff-friendly serialisation: rules sorted by name. */
export function sortByRule(byRule) {
  return Object.fromEntries(Object.entries(byRule).sort(([a], [b]) => a.localeCompare(b)));
}

/** Stable, diff-friendly serialisation of the nested per-file map. */
export function sortByFileRule(byFileRule) {
  return Object.fromEntries(
    Object.entries(byFileRule)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, rules]) => [file, sortByRule(rules)]),
  );
}

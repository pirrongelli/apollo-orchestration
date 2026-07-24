// CRAP (Change Risk Anti-Patterns) — pure functions, no side effects.
//
// CRAP(m) = comp(m)^2 * (1 - cov(m))^3 + comp(m)
//
// Why this metric: coverage alone cannot distinguish a three-branch getter at
// 60% from a twenty-branch money router at 60%. CRAP multiplies cyclomatic
// complexity by how *untested* the code is, so it ranks exactly the functions
// where a change is most likely to break something silently.
//
// Reference points: complexity 5 with no tests = 30. Complexity 12 at 95%
// coverage = ~12.2. Anything fully covered scores its own complexity.

/** Cyclomatic complexity of fully-covered code equals its complexity. */
export function crapScore(complexity, coverageRatio) {
  if (!Number.isFinite(complexity) || complexity < 0) {
    throw new TypeError(`crapScore: complexity must be a finite number >= 0 (got ${complexity})`);
  }
  if (!Number.isFinite(coverageRatio)) {
    throw new TypeError(`crapScore: coverage must be a finite number (got ${coverageRatio})`);
  }
  const cov = Math.min(1, Math.max(0, coverageRatio));
  const uncovered = 1 - cov;
  return complexity ** 2 * uncovered ** 3 + complexity;
}

/**
 * Parse an LCOV report into per-file, per-line hit counts.
 * Hits accumulate when the same file appears in several records, which is what
 * a merged (frontend + backend) LCOV looks like.
 * @returns {Map<string, Map<number, number>>}
 */
export function parseLcovLineHits(lcovText) {
  /** @type {Map<string, Map<number, number>>} */
  const byFile = new Map();
  let current = null;

  for (const rawLine of String(lcovText ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      const file = normalizePath(line.slice(3).trim());
      if (!byFile.has(file)) byFile.set(file, new Map());
      current = byFile.get(file);
      continue;
    }
    if (line === 'end_of_record') {
      current = null;
      continue;
    }
    if (current && line.startsWith('DA:')) {
      const [lineNoRaw, hitsRaw] = line.slice(3).split(',');
      const lineNo = Number.parseInt(lineNoRaw, 10);
      const hits = Number.parseInt(hitsRaw, 10);
      if (!Number.isFinite(lineNo) || !Number.isFinite(hits)) continue;
      current.set(lineNo, (current.get(lineNo) ?? 0) + hits);
    }
  }
  return byFile;
}

/**
 * Share of instrumented lines inside [startLine, endLine] that were executed.
 * @returns {number|null} null when the range contains no instrumented lines
 *   (an unknown, not a zero — the caller must not treat it as uncovered).
 */
export function rangeCoverageRatio(lineHits, startLine, endLine) {
  if (!lineHits || lineHits.size === 0) return null;
  let total = 0;
  let covered = 0;
  for (const [lineNo, hits] of lineHits) {
    if (lineNo < startLine || lineNo > endLine) continue;
    total += 1;
    if (hits > 0) covered += 1;
  }
  if (total === 0) return null;
  return covered / total;
}

/**
 * Extract every function in a source file with its cyclomatic complexity and
 * 1-based line range. Nested functions are reported as their own entries and
 * do not inflate their parent.
 * @param {typeof import('typescript')} ts injected so this stays pure/testable
 * @returns {Array<{name:string, startLine:number, endLine:number, complexity:number}>}
 */
export function analyzeSource(ts, sourceText, fileName = 'source.ts') {
  const isTsx = fileName.endsWith('.tsx') || fileName.endsWith('.jsx');
  const sourceFile = ts.createSourceFile(
    fileName,
    String(sourceText ?? ''),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const isFunctionLike = (node) =>
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node);

  const lineOf = (pos) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

  const decisionPointsIn = (fnNode) => {
    let count = 0;
    const visit = (node) => {
      if (node !== fnNode && isFunctionLike(node)) return; // nested fn: its own entry
      if (
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node) ||
        ts.isCatchClause(node) ||
        ts.isConditionalExpression(node)
      ) {
        count += 1;
      } else if (ts.isCaseClause(node) && node.statements.length > 0) {
        count += 1; // default clause is the fall-through, not a decision
      } else if (ts.isBinaryExpression(node)) {
        const kind = node.operatorToken.kind;
        if (
          kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          kind === ts.SyntaxKind.BarBarToken ||
          kind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          count += 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(fnNode, visit);
    return count;
  };

  const nameOf = (node) => {
    if (ts.isConstructorDeclaration(node)) return 'constructor';
    if (node.name && ts.isIdentifier(node.name)) return node.name.text;
    if (node.name && ts.isStringLiteral(node.name)) return node.name.text;
    const parent = node.parent;
    if (parent) {
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      if (ts.isExportAssignment(parent)) return 'default';
    }
    return `(anonymous:${lineOf(node.getStart(sourceFile))})`;
  };

  const functions = [];
  const walk = (node) => {
    if (isFunctionLike(node)) {
      functions.push({
        name: nameOf(node),
        startLine: lineOf(node.getStart(sourceFile)),
        endLine: lineOf(node.getEnd()),
        complexity: 1 + decisionPointsIn(node),
      });
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(sourceFile, walk);
  return functions;
}

/**
 * Money-movement, approval and auth surfaces. A CRAP breach on these FAILS the
 * build; everywhere else the report is advisory.
 *
 * Replace these patterns with your own critical-path surfaces — this is the
 * one thing in this file every adopter must edit. Extend the list whenever a
 * new money or auth surface appears; that is the intended maintenance, not a
 * smell.
 */
export const CRITICAL_PATH_PATTERNS = [
  /^src\/lib\/money\//,
  /^src\/lib\/idempotency\.ts$/,
  /^src\/features\/auth\//,
  /^functions\/(payments|transfers|approvals)\//,
];

const TEST_FILE_PATTERN = /(^|\/)__tests__\/|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$|_test\.[cm]?[jt]sx?$/;

/** True when a production money/auth surface — test files never qualify. */
export function isCriticalPath(filePath) {
  const p = normalizePath(filePath);
  if (TEST_FILE_PATTERN.test(p)) return false;
  return CRITICAL_PATH_PATTERNS.some((re) => re.test(p));
}

/** True for any test file (used to skip tests in the report). */
export function isTestFile(filePath) {
  return TEST_FILE_PATTERN.test(normalizePath(filePath));
}

/** Repo-relative, forward-slashed, no leading './'. */
export function normalizePath(filePath) {
  return String(filePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

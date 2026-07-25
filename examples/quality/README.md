# CRAP: a change-risk gate that survives contact with a real PR queue

Genericized, copy-pasteable implementation of the CRAP (Change Risk
Anti-Patterns) metric described in
[docs/11-testing-and-code-health.md](../../docs/11-testing-and-code-health.md).
Coverage percentage alone can't distinguish a three-branch getter tested at
60% from a twenty-branch money router tested at 60% — CRAP multiplies
complexity by untested-ness so risk actually concentrates where it should.

## What's here

- `crap-lib.mjs` — pure functions: the CRAP formula, LCOV parsing, a
  TypeScript-AST-based cyclomatic complexity walker, and the critical-path
  matcher. No I/O, fully unit-testable.
- `crap-report.mjs` — the CLI: walks source files, joins them against a
  coverage report, ranks by risk, and optionally fails the build.
- `crap-lib.test.mjs` — the spec (`node --test`). Verified passing (22/22)
  against `typescript@5.6.3`.
- `ratchet-lib.mjs` — pure comparison functions shared by the two ratchets
  below: per-rule warning-count comparison, file-set comparison, and an
  ESLint JSON-formatter aggregator.
- `lint-warning-ratchet.mjs` — ratchets ESLint warning counts (total and
  per-rule) against a committed baseline.
- `ts-nocheck-ratchet.mjs` — ratchets the inventory of files carrying a
  type-check escape hatch (`@ts-nocheck`) against a committed baseline.
- `ratchet-lib.test.mjs` — the spec for `ratchet-lib.mjs` (`node --test`).
  Verified passing (15/15).
- `quality-baselines.example.json` — the baseline file shape both ratchets
  read and write, with small illustrative numbers.
- This README.

## The formula

```
CRAP(m) = comp(m)² × (1 − cov(m))³ + comp(m)
```

`comp` is cyclomatic complexity (1 + decision points: `if`, loops, `catch`,
ternaries, non-default `case` clauses, `&&`/`||`/`??`). `cov` is the fraction
of a function's instrumented lines that were executed by any test, 0–1.

Complexity is squared because paths through a function grow combinatorially
with its branches, not linearly. Uncovered-ness is cubed so the penalty
explodes as coverage approaches zero while staying gentle near full coverage.
The `+ comp(m)` floor means a fully covered function scores exactly its own
complexity — full coverage doesn't make a complex function *simple*, it makes
it *safe*, which is a different claim.

Reference points: complexity 5, no tests → 30. Complexity 12, 95% coverage →
~12.2. Complexity 12, no tests → 156. Default thresholds: **warn at 20, fail
at 30** on gated paths.

## Setup

1. Copy `crap-lib.mjs` and `crap-report.mjs` into your repo (e.g.
   `scripts/quality/`), and `crap-lib.test.mjs` alongside them.
2. Requires the `typescript` package (peer dependency, not bundled) — any 5.x
   release exposes the AST API this uses. Newer major rewrites of the
   compiler may have a different module shape; pin a 5.x range if in doubt.
3. Edit `CRITICAL_PATH_PATTERNS` in `crap-lib.mjs` to your own money/auth
   surfaces (see below) — this is the one thing every adopter must change.
4. Edit `SOURCE_GLOB_DIRS` in `crap-report.mjs` to your own source roots.

## Running it

```bash
# Top risk offenders, whole repo, advisory only
node scripts/quality/crap-report.mjs

# Only functions this branch actually changed, gate on critical paths
node scripts/quality/crap-report.mjs --changed-only --gate

# No coverage run available/affordable — complexity only, still gated
node scripts/quality/crap-report.mjs --complexity-only --gate

# Machine-readable, for CI to parse or archive
node scripts/quality/crap-report.mjs --json
```

Full flag list is documented at the top of `crap-report.mjs`.

## Wiring into CI

Two-tier setup, because a full CRAP run needs a coverage run and a coverage
run needs the full test suite — not every CI budget can afford that on every
push:

- **Every PR (cheap, no test run required)**: `--complexity-only --gate
  --changed-only`. Cyclomatic complexity is pure static analysis — a parse
  of the diff's own functions. This catches "did this PR introduce an
  untestably complex function" immediately, on every push.
- **Nightly (or whenever the full suite is affordable)**: full coverage run
  → merge LCOV if frontend/backend are collected separately → `crap-report.mjs
  --gate --require-coverage`. This is the only mode allowed to use
  `--require-coverage`, because "file absent from the coverage report" is
  only a real signal after a *complete* run.
- Everywhere else: run without `--gate` and just publish the report as a PR
  comment or build artifact. Advisory, not blocking.

## The three design rules that make this survivable

Learned by shipping a naive version first and watching it become noise
within a week:

1. **Ratchet to touched code only.** The gate must fail a PR only for
   functions *that PR's diff actually wrote or modified* — never
   pre-existing debt sitting in the same file. `crap-report.mjs` computes
   this by intersecting each function's line range with the diff's changed
   hunks (`git diff -U0`), and only touched functions are eligible to fail
   `--gate`. Without this, the first PR to touch a large legacy file
   inherits blame for every risky function anyone has ever left there, and
   the fastest way out is to disable the gate — which then stays disabled.
   The report display distinguishes `FAIL` (this change owns it) from `debt`
   (pre-existing, out of scope) so it reads as signal even when nobody is
   forced to act on the debt.

2. **Two different "no coverage" facts are not the same fact.** A file
   *absent from the LCOV report* means coverage was never collected for it
   (common with scoped test runs) — an unknown. A file *present* in the
   report where a function has zero executed lines in its range means that
   function is genuinely untested — a real zero. Conflating these turned one
   scoped coverage run into 73 phantom failures during development of the
   original of this tool, all of them files simply outside that run's scope.
   `crap-report.mjs` tracks absent files as `noCoverageData` / coverage gaps
   (reported, never scored as zero) and only turns that into a gate via the
   explicit `--require-coverage` flag, meant for full-coverage runs only.

3. **If you can't afford a test run on every PR, gate on the free half.**
   Complexity needs no coverage data — it's a parse. Ship the
   `--complexity-only` mode as the per-PR gate and reserve full CRAP
   (complexity **and** coverage) for a nightly job. Both signals matter,
   but only one is affordable everywhere.

A fourth rule that isn't a code path but matters just as much: **be honest
in the report about what is and isn't enforced.** If a run is
complexity-only, say so in its own output (`crap-report.mjs` prints "Full
CRAP … runs in the nightly coverage job" in that mode) — a tool that implies
more coverage than it has creates false confidence, which is worse than no
gate.

## Choosing thresholds for your own codebase

The defaults (`--warn-crap 20`, `--max-crap 30`, `--max-complexity 15`) came
from the reference points above, not from tuning against a specific
codebase. Reasonable starting point for most teams; adjust by running
`--json` repo-wide once, looking at the distribution of scores your actual
code produces, and setting the ceiling near "the complexity of an untested
function I'd genuinely want blocked," not near the median of what you
already have (that just legitimizes existing debt as the new normal).

`CRITICAL_PATH_PATTERNS` deserves more care than the numeric thresholds: it
is the list of files where a breach fails the build instead of just being
reported. Scope it to surfaces where a silent bug is expensive — money
movement, authentication, approval/authorization gates — and extend it
whenever a new such surface is added. Everything outside that list stays
advisory forever; that's deliberate, not a gap to close later.

## The other two ratchets: lint warnings and type-check escape hatches

CRAP ratchets complexity-vs-coverage risk. These two close two more holes
that a plain lint + typecheck setup leaves open — see
[docs/11-testing-and-code-health.md](../../docs/11-testing-and-code-health.md#ratchets-bounding-what-you-cannot-fix-today)
for the full write-up. Both share `ratchet-lib.mjs` and read/write the same
`config/quality-baselines.json` file (see `quality-baselines.example.json`
for the shape — copy it to `config/quality-baselines.json` and run
`--update` once to seed real numbers).

- **`lint-warning-ratchet.mjs`** — a plain `eslint .` run never fails on
  warnings, so they accumulate silently. This compares the current run's
  warning counts, total *and* per rule, against the committed baseline.
  A total-only comparison would let a change fix two warnings of one rule
  while introducing two of another and call it flat; per-rule comparison
  catches that.
- **`ts-nocheck-ratchet.mjs`** — a file carrying `@ts-nocheck` is invisible
  to any type-error gate, because it opts out of type checking entirely.
  This inventories every file using the directive (`git grep -l @ts-nocheck`)
  and ratchets the *set*: removals pass and are reported as progress, any
  addition fails, and a rename counts as one of each (the escape hatch
  moved, so it needs a fresh look).

Both fail closed on a missing baseline — no baseline means "run `--update`
and commit the result," never a silent pass. Both CLIs support:

```bash
node lint-warning-ratchet.mjs              # check, human-readable
node lint-warning-ratchet.mjs --update      # lower (or knowingly raise) baseline
node lint-warning-ratchet.mjs --json        # machine-readable, for CI

node ts-nocheck-ratchet.mjs                 # check
node ts-nocheck-ratchet.mjs --update
node ts-nocheck-ratchet.mjs --list          # print the current inventory
```

### Wiring into CI

Run both on every PR — unlike full CRAP, neither needs a coverage run:
`lint-warning-ratchet.mjs` needs only `eslint . --format json` (or a
`--report <file>` from a lint step you already run), and
`ts-nocheck-ratchet.mjs` needs only `git grep`. A non-zero exit blocks the
build; the console output names the exact regressing rule or file so the
fix is a one-line diff, not an investigation.

### Verify a ratchet in both directions before trusting it

Before wiring either into a CI gate, prove two things, not one: that it
passes on a clean tree, *and* that it actually fails when you hand it a
regression (bump a rule's count, add a throwaway `@ts-nocheck`, rerun,
confirm the non-zero exit and the named offender, then revert the
throwaway change). A gate nobody has ever seen fail is a gate nobody knows
works — the failure path is the one that matters and the one that's easiest
to skip testing.

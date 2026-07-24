# Testing and Code Health

An AI agent will happily write code that passes its own tests while the
feature is broken end-to-end. This is not a hypothetical — it is the default
failure mode of goal-seeking on a proxy metric. Give an agent "make the tests
pass" as its objective and it will optimize exactly that, including by writing
tests that assert the bug's behavior, mocking away the exact interaction that
was broken, or covering the three easy branches and leaving the dangerous one
untouched. Coverage percentage does not catch this. "80% coverage" is a
single number that cannot distinguish a three-branch getter tested at 60%
from a twenty-branch money router tested at 60% — the first is fine, the
second is an incident waiting for a production deploy. This chapter documents
the discipline we built after learning that the hard way: a risk metric that
multiplies complexity by untested-ness instead of just counting lines, a set
of rules for making that gate survivable instead of ignored, a test-pyramid
decision rule, and TDD as the default posture rather than a nice-to-have.

## The problem with coverage as a risk signal

Line/branch coverage answers "was this line executed by some test," which is
a necessary but nowhere-near-sufficient condition for "this code is safe to
change." It says nothing about:

- **How many ways the function can go wrong.** A function with one branch and
  a function with fifteen branches can both sit at 70% coverage, but the
  second has vastly more untested paths in absolute terms.
- **Whether the executed lines were meaningfully asserted on**, versus merely
  touched by a test that mocked away the interesting behavior.
- **Where the risk actually concentrates.** A codebase-wide coverage number
  hides the five functions that move money behind the average of five hundred
  functions that render static UI.

We needed a metric that combines *how complex* a function is with *how
tested* it is, and that penalizes the combination — not either dimension
alone — because "complex but well-tested" and "simple but untested" are both
acceptable, and only "complex AND untested" is the actual danger zone.

## CRAP: Change Risk Anti-Patterns

We adopted a metric long-established in the testing literature and gave it a
concrete implementation for our stack:

```
CRAP(m) = comp(m)² × (1 − cov(m))³ + comp(m)
```

Where `comp(m)` is a function's cyclomatic complexity (1 + number of decision
points: `if`, loops, `catch`, ternaries, `case` clauses, short-circuit
logical operators) and `cov(m)` is the fraction of that function's
instrumented lines that were executed by any test, expressed as 0–1.

**Why this exact shape, not `complexity × (1 − coverage)` or some other
combination:**

- **Complexity is squared.** A function twice as complex is not twice as
  risky to leave undertested — it is much more than twice as risky, because
  the number of *paths* through a function grows combinatorially with its
  decision points, not linearly. Squaring reflects that.
- **Uncovered-ness is cubed.** Going from 95% to 100% coverage should barely
  move the score — the last few percent are usually edge cases with modest
  marginal risk reduction. Going from 20% to 0% should move it a lot — that
  is the difference between "lightly tested" and "nobody has ever seen this
  code execute." A cubic term makes the penalty accelerate sharply as
  coverage approaches zero, while staying gentle near full coverage.
- **The `+ comp(m)` floor.** Fully covered code (`cov = 1`) reduces the first
  term to zero, so the score floors out at the function's own complexity —
  never zero, and never below what the complexity alone would suggest. A
  20-branch function that is 100% covered still scores 20, not 0: full test
  coverage does not make a complex function simple to change safely, it
  makes it *safe*, which is a different claim than *cheap*.

**Reference points**, which are worth memorizing because they make the
numbers legible at a glance:

- Complexity 5, zero coverage: `25 × 1 + 5 = 30`.
- Complexity 12, 95% coverage: `144 × 0.000125 + 12 ≈ 12.2` — barely above
  its own complexity, because it's well-tested.
- Complexity 12, zero coverage: `144 × 1 + 12 = 156` — over five times as
  risky as the same function well-tested, for identical code.
- Any function at 100% coverage scores exactly its own complexity.

We use **20 as an advisory warning threshold** and **30 as a hard ceiling on
gated paths** (see below). Those numbers came from the reference points
above, not from a formula: 30 is roughly "complexity 5 with literally no
tests," which is the bar past which we don't want to discover a bug in
production.

## Making the gate survivable — three rules learned in practice

A risk metric that is technically correct but operationally unusable gets
switched off within a week. Three design decisions made the difference
between "a gate the team respects" and "a gate everyone routes around."

### 1. Ratchet to touched code only

The gate must fail a pull request for functions **that pull request's diff
actually wrote or modified** — never for pre-existing debt sitting in the
same file. Concretely: intersect each function's line range with the diff's
changed-line ranges (from `git diff -U0`), and only functions with overlap
are eligible to fail the build.

Without this, the very first PR that touches a large, historically undertested
file inherits the blame for every risky function anyone has ever left in that
file — including code the current change doesn't read, doesn't call, and
didn't write. That PR author has two options: spend a day writing unrelated
tests to satisfy a metric about someone else's code, or ask for the gate to be
disabled. Every team we've watched picks the second option, and once a gate
has been disabled once "just for this PR," it stays disabled. Ratcheting to
touched code means the gate only ever asks "did *you* make this worse,"
which is both fair and answerable.

The display still needs to distinguish "this change owns it" from
"pre-existing debt, out of scope" — visually, not just in the exit code.
Otherwise the report reads as noise and people stop looking at it even when
it's advisory.

### 2. Two different kinds of "no coverage" are not the same fact

There are two distinct situations that both look like "zero coverage
recorded" and conflating them will destroy the gate's credibility:

1. **The file is entirely absent from the coverage report.** This means
   coverage was never *collected* for it — most commonly because the CI run
   was scoped (only ran tests matching the changed files, or split frontend
   and backend coverage into separate runs that weren't merged). This is an
   *unknown*, not a *zero*.
2. **The file is present in the report, but a specific function has no
   executed lines within its range.** This is a genuine, meaningful "this
   function has never run under test."

Scoring case 1 as 0% turns any partial or scoped coverage run into a wall of
false positives — every file the run didn't happen to touch "fails" the CRAP
gate, regardless of its actual test quality. We learned this by shipping a
first version of the report that made exactly this mistake: one scoped
coverage run produced 73 phantom failures, all of them files that were simply
outside that run's scope, none of them actually untested. The fix is to track
case 1 separately as a "coverage gap" (reported, not scored) and only turn it
into a real gate — via an opt-in flag — after a *full* coverage run where
"absent from the report" can only mean "no test executed it, ever."

### 3. If you can't afford a test run on every PR, gate on the half that's free

Full CRAP needs a coverage run, and a coverage run needs the full test suite,
which costs real CI time and money. If that cost is prohibitive on every
push, don't skip the gate — split it. Cyclomatic complexity is pure static
analysis: no tests need to run, no coverage needs to be collected, it's a
parse of the source tree. Gate a complexity ceiling on every PR for free, and
run the *full* CRAP metric (complexity **and** coverage) on a nightly job
that can afford the full test suite. The per-PR complexity-only gate answers
"did this change introduce an untestably complex function" immediately; the
nightly full-CRAP job answers "is anything complex AND undertested" with a
day's lag. Both numbers matter; only one of them is affordable on every push.

## The test pyramid, as a decision rule

The pyramid shape (many unit tests, fewer integration tests, few end-to-end
tests) is well known as a slogan and poorly applied as a decision procedure.
Here is the version we actually use to decide what kind of test a given piece
of new code needs:

- **Unit tests**: pure logic, validation, data transforms, custom hooks in
  isolation. Fast, numerous, no I/O.
- **Integration tests**: component ↔ hook ↔ query-layer wiring, or
  handler ↔ shared-module wiring on the backend. The rule of thumb: prefer
  exercising the *real* interaction between two units over mocking one of
  them away. Heavy mocking is the single most common way an AI agent produces
  a test suite that passes while the feature is broken — the mock encodes
  the agent's assumption about the collaborator's behavior, and if that
  assumption is wrong, the test can never catch it, because the test and the
  bug share the same false premise.
- **Property-based tests**: anything involving money math, rounding,
  idempotency keys, or amount edge cases (zero, negative, currency-minor-unit
  boundaries, floating-point-adjacent decimal handling). These bugs live in
  the *edge* of the input space, and hand-picking examples reliably misses
  the edge you didn't think of. A property test that asserts "round-trip
  through the fee calculation never changes the sign of the amount" or
  "concurrent idempotent calls with the same key never create two records"
  finds bugs that example-based tests structurally cannot.
- **End-to-end tests**: reserved for flows whose breakage makes the product
  unusable outright — login, multi-factor authentication, account creation,
  payment submission, webhook processing. E2E tests are slow, flaky under
  load, and expensive to maintain; spending that budget on anything short of
  "the product doesn't work at all if this breaks" dilutes it away from the
  flows that actually deserve it.

**Money-moving code carries an additional, non-negotiable requirement**:
unit or property tests for the math, *and* an adversarial concurrency test —
double-submit, duplicate webhook delivery, two requests racing on the same
idempotency key — because the single most common way financial code fails in
production is not "the math was wrong," it's "the same operation ran twice."
(See the "`useState` is not a mutex" story in the lessons-learned chapter for
exactly this failure, discovered the expensive way.)

## TDD as the default, not a suggestion

Red → green → refactor is the default posture for two categories of work,
without exception:

1. **Bugfixes.** Write a test that reproduces the bug *before* touching the
   fix. If that test passes on its very first run, it proves nothing — it
   means the test doesn't actually exercise the bug, and the "fix" that
   follows might not either. The only way to know a bugfix worked is to have
   watched the specific test fail first.
2. **New business logic.** Write the test for the behavior you want before
   the implementation exists.

The value of TDD is generic software-engineering wisdom, but it has a
specific and outsized payoff when the "engineer" is an AI agent: **it
converts a vague objective into a verifiable one.** "Fix the bug" is a
sentence an agent can satisfy by convincing itself it's done — the single
highest-frequency failure mode in agentic coding is exactly this, an agent
declaring success because the code *looks* right, without ever having
observed the failure it was supposed to fix. "Make this failing test pass"
has a binary, external, unfakeable answer: the test runner's exit code. TDD
isn't a style preference here — it's the mechanism that closes the gap
between "the agent believes it's done" and "it's actually done."

## Clean code, made checkable

"Write clean code" is advice a model can nod at and then ignore, because
nothing checks it. The properties worth keeping are the ones with a concrete,
mechanical test:

- **One responsibility per function.** Checkable proxy: cyclomatic
  complexity. A function with a complexity of 20 is doing at least several
  distinguishable things, whatever its name claims.
- **A complexity ceiling on critical paths**, enforced by the same
  complexity-only gate described above. If a function is too branchy to test
  as a single unit, split it — that's the actionable instruction, not
  "simplify," which is not a command a script can verify.
- **Component size, on the frontend**: extract sub-components once a
  component crosses roughly 150–200 lines. This is a proxy, not a hard rule,
  but it correlates well with "this component now has more than one reason
  to change."
- **Every changed line traces to the objective.** The reviewer test: can you
  point at each modified line and say why the stated task required it? "It
  seemed related" is a signal the change needs to be split, not shipped.

None of these replace judgment. What they do is give judgment a floor: a
function can still be badly named and still be well-factored by these
proxies, but it cannot be a 25-branch, 0%-covered money router and pass
quietly, because a number now says so instead of a feeling.

## What to enforce vs. what to report

Blocking gates are expensive in trust — every false positive erodes
willingness to respect the next one — so we spend that budget narrowly:

- **Blocking (fails the build)**: a CRAP or complexity breach on a touched
  function inside a designated critical-path surface (money movement,
  authentication, approval gates — the exact list is a maintained pattern
  set, not a one-time decision). Nowhere else.
- **Advisory (reported, never blocks)**: everything else, repo-wide. The
  report still ranks by risk and still distinguishes "this PR's own new debt"
  from "pre-existing, not your problem," because a report nobody reads
  because it's all noise is worse than no report.

The honesty point matters as much as the mechanism: a rule or a report that
*claims* to enforce something it does not actually enforce is worse than no
rule at all, because it creates false confidence. If the CI budget only
allows a complexity check on every push and a full CRAP check nightly, say
exactly that in the tool's own output — don't let "gate" imply more coverage
than the gate actually has.

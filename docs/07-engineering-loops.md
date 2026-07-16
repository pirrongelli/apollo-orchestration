# Engineering Loops

Ad-hoc AI sessions are fine for a bug fix. They fall apart on campaigns — a coverage push across twenty modules, a migration that touches every policy, a backlog of audit findings. For that class of work we run *engineering loops*: structured discover→plan→execute→verify→iterate campaigns with measured baselines, model routing, an independent judge, and persistent memory between iterations. This chapter documents the loop system we use on a regulated Banking-as-a-Service platform.

## The problem loops solve

A long unstructured session with an AI agent degrades in predictable ways. The agent works from a stale mental model of the codebase instead of measuring it. It judges its own output and declares victory early. It re-discovers the same environment quirks every session because nothing was written down. And nobody decided in advance when to stop iterating, so a stuck task burns tokens proving it's stuck.

Loops attack each failure mode structurally: baselines are measured, not assumed; the doer never judges its own work; every confirmed surprise is distilled into a memory file; and every loop declares a hard iteration limit before it starts.

## Three standing documents

The loop system lives in three files checked into the repo. They are the interface between sessions — the model forgets, the files don't.

### VISION.md — what "done" looks like

One entry per loop, active or queued. The discipline that makes the whole system work is a single sentence at the top of the file:

> Every goal here must be checkable by a command, not an opinion.

"Improve test quality" is not a loop goal. "These six modules each reach ≥90% line coverage, verified by the scoped coverage command" is. Each entry declares:

- **Goal** — the command-checkable condition (coverage thresholds, a test suite going from N failures to zero, an endpoint responding correctly to a curl).
- **Gates** — which verification commands must be green for an iteration to count.
- **Limit** — the maximum verify→fix rounds per target before the loop stops and reports.
- **Exit** — always the same shape: the PR is merged and results are logged in memory.

Closed loops stay in the file with their outcomes, including the loops that were vetoed or re-scoped. VISION.md doubles as the campaign log.

### RULES.md — the never-break list

The distilled constraint set every agent — regardless of vendor — must obey inside a loop. Ours covers:

- **Engineering principles**: economy (smallest capable model, fewest agents, reuse context on fix rounds), TDD (tests define done), KISS, clean code, and "repo rules win over speed."
- **Protocol**: read the memory file before starting an iteration; update it before finishing; the doer never judges its own work; every loop has a verifiable goal and a hard limit.
- **Git discipline**: feature branches only, PRs target the development branch, promotion to customer-facing branches always requires explicit owner approval.
- **Domain invariants**: the platform-specific never-break rules — money-moving endpoints require idempotency, the canonical authorization helpers, no external provider identifiers in customer-facing responses.
- **The exact local gate commands**, including environment quirks. Ours documents, for example, that the npm test wrappers silently drop a required Node flag locally, so agents must invoke the test runner directly with the flag — a fact that cost a debugging session before it was written down.

RULES.md is short on purpose. Full context lives in the repo's main agent instructions; this file is only the list an agent must never violate mid-loop.

### MEMORY.md — distilled lessons

The loop's brain across sessions, maintained under a strict protocol (covered below). Three sections: **VERIFIED** (confirmed facts and rules, date-stamped, with how each was verified), **TRIED** (experiments and their outcomes, including failures, one line each), and **OPEN** (untried, blocked, or awaiting an owner decision).

## Loop anatomy

```
        ┌──────────┐
        │ DISCOVER │  measure the true baseline
        └────┬─────┘
             ▼
        ┌──────────┐
        │   PLAN   │  strong model designs the approach
        └────┬─────┘
             ▼
        ┌──────────┐
        │ EXECUTE  │  cheap model implements (parallel, disjoint targets)
        └────┬─────┘
             ▼
        ┌──────────┐     FAIL (≤3 rounds)
        │  VERIFY  │────────────────┐
        │ gates +  │                ▼
        │ 2nd-vendor│         ┌──────────┐
        │ verdict  │◄─────────│ ITERATE  │  same executor, not a fresh one
        └────┬─────┘          └──────────┘
             │ PASS
             ▼
        PR → checks green → independent PR review → MERGE
             ▼
        log results in MEMORY.md → loop closed
```

### DISCOVER — measure the true baseline

Never start from documentation, a previous inventory, or the agent's recollection. Run the gate commands against the actual current state and read the actual target files first.

This rule paid for itself immediately. Our pilot loop was a coverage push scoped from an inventory file listing four low-coverage modules. The discover step measured them — and found the original targets were *already above the threshold*. The inventory was stale; other work had covered them since it was written. The loop was re-scoped on the spot to six modules that were genuinely under-covered, and a rule went into memory: baseline inventories go stale — always re-measure. Without the discover step, the loop would have spent its entire budget "raising" coverage that was already there and reported success on work that changed nothing.

### PLAN — the strong model designs

Planning is where design mistakes are cheapest to catch and most expensive to miss, so it gets the strongest model. A planner agent running on Opus takes one well-scoped target — a module to cover, a migration to design, an endpoint to build — and returns a concrete plan: which behaviors to test, which edge cases matter, what the executor is and isn't allowed to touch. For multiple targets, planners run in parallel, one per target.

For purely mechanical targets with obvious conventions, we skip the planner entirely — economy is a rule, and a plan that restates the obvious is waste.

### EXECUTE — the cheap model implements

Executor agents run on Sonnet. Each executor gets one target, the plan, the rules file, and an explicit allowed-edit scope. Executors for different targets run in parallel — but only when their file sets are disjoint. Two agents editing the same file is a merge conflict you paid twice for.

The executor self-checks against the gate commands before returning. Self-checking is not verification — it just avoids handing obviously broken work to the verifier.

### VERIFY — mechanical gates plus an independent judge

Verification has two layers, and the core rule is that **the doer never judges its own work**:

1. **Mechanical gates** — the commands VISION.md declared for this loop: lint, the relevant test suites, scoped coverage. Binary, scriptable, non-negotiable.
2. **Independent quality verdict** — a reviewer from a *different model vendor* than the executor. When Claude agents execute, Codex (running read-only over the diff) judges; when Codex executes, a Claude agent judges. The reviewer gets an adversarial prompt: do these tests assert real behavior or just execute lines for coverage? Are the mocks realistic? What edge cases are missing? Verdict PASS or FAIL, with reasons.

The cross-vendor requirement matters more than it looks. Same-family models share blind spots and share an incentive to approve; a different vendor with a skeptical prompt reliably surfaces coverage-padding, unrealistic mocks, and missed branches that a same-model review waves through. Our pilot's independent review didn't just grade the tests — it found a real dormant bug in the module under test (a callback reading fields from the wrong object, silently dead for months), which became its own follow-up loop.

Verification depth must match change depth. Unit gates alone never close a loop that reaches an API or the UI: backend endpoint changes get exercised against the real deployed development environment; user-visible changes get an end-to-end browser test of the actual flow.

### ITERATE — bounded, and to the same agent

Verifier findings go back to the **same executor instance** that wrote the code — a continued conversation, never a fresh spawn. The executor already holds the implementation context; a fresh agent would re-read everything to rebuild it, which is the most expensive way to fix a two-line problem.

Hard limit: **three verify→fix rounds per target**. At round three, the loop stops and reports honestly — what's blocking, what was tried, best hypothesis. A stalled loop is information for the orchestrator and the owner, not a failure to hide. The limit is declared in VISION.md before the loop starts, so "just one more round" is never a live option.

## Model routing economics

The routing rule in one line: **Opus plans, Sonnet executes, a different vendor verifies.**

| Stage | Model | Why |
|---|---|---|
| Orchestration & scope calls | The strongest available model, never delegated | Decomposition mistakes multiply downstream |
| PLAN | Opus | Design errors are the expensive ones |
| EXECUTE | Sonnet | Implementation against a good plan is mechanical; it's also the highest-volume stage |
| VERIFY (gates) | No model — shell commands | Determinism is free |
| VERIFY (quality) | Cross-vendor (Codex for Claude-authored work, and vice versa) | Independence beats raw capability for judging |

Execution dominates token volume in any large campaign — dozens of test files, repetitive refactors — so putting the cheap model there and the expensive model only where judgment concentrates changes the cost of a campaign by roughly the ratio of the model prices, with no measurable quality loss *because the verifier catches what the cheap executor misses*. The verifier is what makes cheap execution safe.

Two corollaries from our rules file: fix rounds re-message the existing executor instead of spawning (context reuse is the cheapest token there is), and heavyweight fan-out orchestration is reserved for genuinely wide sweeps with the owner aware of the cost.

## The memory ladder

MEMORY.md is maintained under a five-rung ladder. Every loop iteration starts by reading it and ends by updating it — including aborted iterations, because an aborted loop with a documented cause is progress and an undocumented one is waste.

1. **Fail and document it** — minimum bar: every failed experiment lands in TRIED with what was attempted and what happened.
2. **Investigate why** — "tests failed" is not an entry; the mechanism is.
3. **Verify the cause into a fact** — reproduce it, A/B it, or confirm against source. Only then does it move to VERIFIED.
4. **Distill the fact into a general rule** — prefixed `RULE:` in VERIFIED; if it constrains all future work, it also graduates into RULES.md.
5. **Consult rules instead of re-deriving** — at iteration start, scan VERIFIED before re-running any discovery you've run before.

The ladder is the economy principle applied to knowledge: a rule consulted costs nothing; a fact re-derived costs a discovery run every session. Examples that climbed our ladder: the test-runner flag quirk (failed run → investigated → verified by A/B → distilled into RULES.md as the mandatory invocation form), and "baseline inventories go stale" from the re-scoped coverage loop. Neither has cost a session since.

Hygiene rules: date-stamp everything, record *how* a fact was verified, delete entries proven wrong (noting the correction), and never store secrets or customer data.

## Exit criteria — and the veto

A loop closes when **its PR is merged and its results are logged in MEMORY.md**. Not when the code compiles, not when local gates pass, not when the PR is opened. Between `pr create` and merge, the loop is still running: the orchestrator watches every CI check and review bot until all are genuinely green (neutral or skipped-with-findings is not accepted — each gets investigated to a verified cause), runs a final cross-vendor review of the full PR diff, and triages red checks into infra flake (rerun), real finding (new fix round), or pre-existing issue (documented in the PR and in memory).

Loops can also end by **veto**. Adversarial audit sits above the loop: it can kill a goal the plan itself validated. One of our lifecycle loops planned automatic retry for transactions a crypto custody provider reported as dropped. Implementation was straightforward and the gates would have passed. The audit killed it: on some networks a "dropped" transaction can later be mined anyway, so an automatic re-send creates a double-payout risk — the original and the retry both settling. The loop shipped the safe half (state transitions, released holds, a distinct audit trail) and left the retry transition reserved for a future operator-initiated flow, gated on verifying the provider's terminality semantics. The vetoed goal is recorded in VISION.md with its reason, so nobody re-proposes it uninformed.

That's the pattern worth generalizing: the plan asked "can we build this?"; the audit asked "what happens when the external system disagrees with our assumption?" Loops need both questions, answered by different minds.

## Long-horizon loops: immutable feature lists + browser E2E

The anatomy above assumes a bounded campaign — a coverage push, a migration
sweep — that closes in a handful of iterations. Loops that instead run for
many sessions against a long feature backlog exposed two failure modes the
base pattern didn't cover: the agent starts declaring features "done" by
feel once the session count climbs, and the feature spec itself quietly
drifts — a clause reworded or dropped between session one and session five,
because nothing prevented the agent being graded against a spec from also
editing that spec.

The fix is the same principle the rest of the loop system already leans
on — mechanical gates over honor-system compliance, applied to the spec
itself:

- **An immutable feature list is the ground truth.** The initializer creates
  it up front — one entry per feature, each with an id, a description, a
  concrete `verify` step, and a `status` starting at `fail`. Existing entries
  are append-only: an iteration may flip `status` to `pass`, but the
  `description` and `verify` it was scoped against are frozen. New entries
  may still be appended as scope is discovered.
- **One feature per iteration**, proven via its `verify` step before the
  status flips — never a batch of features waved through together.
- **A checker enforces the freeze as a gate**, diffing the working feature
  list against the version committed at git `HEAD` and failing the run on
  any removed entry or edited `description`/`verify`. It is deliberately
  fail-closed: an unreachable git `HEAD`, or a committed baseline that's
  corrupt or unreadable, is a hard error — never silently treated as "no
  baseline yet."
- **UI features require browser-level E2E**, not unit or component tests, as
  their `verify` step — agents reliably miss end-to-end breakage (an
  unreachable route, a form that submits but never re-renders) that
  mocked-network tests can't see. Backend features get the equivalent
  standard: a real call against a deployed environment, not a mock.

A worked, tested implementation of the schema and checker lives in
[`examples/loops/`](../examples/loops/) — see that directory's README for
the full rationale and the test suite covering every allowed and disallowed
edit.

## Why loops beat ad-hoc sessions

For small work, a loop is overhead — just fix the bug. For campaigns, four structural properties compound:

- **Measured baselines.** The discover stage catches stale scope before any budget is spent on it. Our very first loop would have been wasted work without it.
- **Bounded verify→fix rounds.** The three-round limit, declared up front, converts open-ended thrashing into a crisp escalation. The most expensive failure mode of agentic coding — looping hopefully on the same failure — is structurally impossible.
- **Persistent memory.** Environment quirks, API surprises, and disproven approaches are paid for once. Every subsequent iteration starts from the accumulated VERIFIED rules instead of from zero.
- **An independent judge decides iterate-vs-exit.** The agent that wrote the code never decides it's done. Mechanical gates plus a cross-vendor verdict make "done" a property of the work, not a feeling of the worker — and merge-plus-logged-results makes "closed" a property of the repository.

The loop files are a few hundred lines of Markdown and cost nothing to adopt. What they buy is the difference between an AI team that ships campaigns and one that produces a long transcript of almost-finished work.

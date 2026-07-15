# The Agent Roster: How Work Fans Out

This chapter documents the specialized agents we run on top of Claude Code to build a regulated Banking-as-a-Service platform as a solo founder plus AI team. The core idea is simple: the main conversation is an orchestrator, not a worker. Everything that can run in parallel — exploration, planning, execution, validation, review — runs in a subagent with its own fresh context, and the main thread keeps only the conclusions.

## The Philosophy: Speed Comes From Parallelism

The naive way to use a coding agent is one long conversation that does everything itself: search the codebase, read twenty files, write the change, run the tests, fix the lint, re-read files it half-remembers from fifty messages ago. That serial grind is slow, and worse, it degrades — a context window stuffed with file dumps produces hallucinated imports and forgotten decisions.

Our operating rule, written directly into the project instructions, is:

> Fan out with multiple agents for independent work: exploration, research, validation, and review run in parallel, not sequentially in the main context. Never grind through solo what agents can parallelize.

In practice this means:

- **Exploration** happens in read-only search agents that return a conclusion, not a transcript of every file they opened.
- **Validation** (lint, types, build, tests) happens in a dedicated quality-gate agent that runs while the main thread continues working.
- **Design and implementation** are split across two different agents on two different models.
- **Judgment** is delegated to an independent verifier that did not write the code — including a cross-vendor check by a different LLM entirely.

The main conversation stays lean: objectives, decisions, and results. Everything else is fanned out.

## The Roster

Each agent is a Markdown file under `.claude/agents/` with YAML frontmatter declaring its name, trigger description, and model. Claude Code reads the descriptions and spawns the right agent when the trigger matches. Here is the roster, role by role.

### agent-orchestrator — the dispatcher

The orchestrator is a meta-agent. It performs no work itself; its only job is to read conversational signals — "I just wrote a migration", "I'm about to change an enum we send to the payments provider", "tests pass but I'm not confident" — and decide which specialized agents to spawn, and in what order.

Its definition encodes a decision framework rather than a task:

```yaml
---
name: agent-orchestrator
description: "Central dispatcher. Reads conversational signals after any
  significant action and decides which specialized agent(s) to spawn,
  and in what sequence."
model: opus
memory: project
---
Your sole purpose is to detect conversational signals and dispatch the
correct specialized agent(s). You never perform the work yourself —
you coordinate.
```

The ordering rules matter more than the registry itself:

- **Validation before implementation.** Anything that changes data sent to an external API gets validated against the provider's sandbox *before* code is written. Plan documents are hypotheses; the live API is the source of truth.
- **Review after creation.** Migration review and the quality gate run after changes land, never speculatively.
- **Compliance last.** Auth, RLS, and audit-trail checks run after functional verification, so they judge working code.
- **Persistence at session end.** A context-persistence agent captures decisions and remaining work into memory files before the session closes.

The orchestrator returns a recommendation and then dispatches — one clear plan, not a menu of options.

### guardian — the quality gate

Guardian is the agent we spawn most often. It runs after every meaningful batch of code changes and again as the final gate before any commit. It is deliberately a *detector, not a fixer* — it reports with surgical precision and never touches the code, which keeps its verdicts trustworthy.

Its protocol is five sequential checks, and it runs all of them even when an early one fails, so the developer gets the complete picture in one pass:

1. **Lint** — the project linter, zero tolerance.
2. **Types** — `tsc --noEmit`, with attention to missing exports and incompatible signatures.
3. **Build** — a dev build, which catches what lint and types individually miss: circular dependencies, asset resolution failures, missing environment configuration.
4. **Affected tests** — it maps each changed file to its test file by convention, runs exactly those, and flags changed files that have no test at all.
5. **Import resolution** — it reads every changed file and verifies each import actually exists and each named symbol is actually exported. This check exists because AI-generated code hallucinates import paths and function names more than any other class of defect.

The report format is fixed and binary:

```
## Guardian Report
### Lint: PASS|FAIL
### Types: PASS|FAIL
### Build: PASS|FAIL
### Tests: PASS|FAIL (X passed, Y failed) | NO TESTS FOUND
### Imports: PASS|FAIL
### Verdict: ALL CLEAR | BLOCKING ISSUES FOUND
```

Because guardian runs in its own context, the main thread can keep implementing the next piece while validation happens in the background. Failures come back as exact file/line/rule triples, not "some tests failed".

### loop-planner — design work, on the strong model

The planner is the PLAN stage of our engineering loop (chapter on loops covers the full lifecycle). It takes ONE well-scoped target — "raise this module to 90% coverage", "design the approach for this new endpoint" — and produces a plan concrete enough that a cheaper model can implement it without making any design decisions.

```yaml
---
name: loop-planner
description: "PLAN stage of an engineering loop: designing test plans,
  migration strategies, or implementation approaches for a single
  well-scoped target. Difficult/design work — runs on Opus."
model: opus
---
```

Two rules in its protocol are worth stealing:

- **Measure current reality yourself.** The planner runs the relevant gate command and reads the target source fully before planning. It never trusts a stale coverage inventory or a description of the code — descriptions drift, the gate command does not.
- **Plan for the downstream judge.** For test plans it demands real behavioral assertions (return values, state changes, error paths), because it knows coverage-padding tests will be rejected by the independent cross-vendor judge later. Designing with the verifier in mind prevents a wasted round-trip.

The planner never edits files. Its final message *is* the plan, sized for a single executor.

### loop-executor — mechanical work, on the cheap model

The executor is the EXECUTE stage. It receives a plan, a target, and an **explicit allowed-edit scope** — usually one file — and implements exactly the plan, nothing more.

```yaml
---
name: loop-executor
description: "EXECUTE stage: implementing a plan produced by loop-planner.
  One executor per target, in parallel across targets when they touch
  disjoint files. Mechanical work — runs on Sonnet."
model: sonnet
---
```

Its constraints are what make it safe to run cheap and in parallel:

- Never modify source modules when the task is tests-only; never edit outside the declared scope. If something outside the scope is broken, report it — don't fix it.
- Self-check before returning: run your own tests and lint locally, iterate until they pass. But you do **not** judge quality — an independent verifier does that.
- When a verify round produces feedback, address **all** feedback items, capped at three rounds per target.

The most important operational rule: feedback rounds go back to the **same running executor**, not a fresh spawn. More on that below.

### loop-verifier — the independent judge

The verifier is the VERIFY stage, and its defining property is independence: it did not write the work it is judging. Its instructions open with the framing that governs everything else:

> You did NOT write the work you are judging. Be skeptical; a false PASS is worse than a false FAIL.

It runs two kinds of checks:

1. **Mechanical gates** — scoped test coverage, full suite pass, lint clean, against thresholds declared for the loop.
2. **A cross-vendor quality verdict** — it shells out to OpenAI Codex in a read-only sandbox and asks a pointed question:

```bash
codex exec --sandbox read-only --cd "<worktree>" \
  "Review <test-file> against <source>. Do these tests assert real
   observable behavior, or merely execute lines to inflate coverage
   (trivial assertions, over-mocked tautologies)? List padding tests
   by name. End with: VERDICT: PASS or VERDICT: FAIL"
```

The Codex verdict is relayed **verbatim** — the verifier is forbidden from softening it. PASS requires every gate green, including the cross-vendor one. On FAIL, the verifier writes feedback specific enough that the executor can fix it without guessing: file, test name, exact deficiency. It also distinguishes failures inside the loop's edit scope from pre-existing failures elsewhere, escalating the latter instead of blocking the loop on someone else's mess.

### Explore and general-purpose — read-only fan-out

Not every subagent is bespoke. Claude Code's built-in **Explore** agent is a read-only search agent for broad fan-out: "find every place we resolve customer membership", "which files implement the webhook retry path". It reads excerpts rather than whole files and returns a conclusion, keeping thousands of lines of search noise out of the main context. The **general-purpose** agent handles multi-step research tasks that need more tools than pure search.

The rule of thumb: if answering requires sweeping many files and you only need the conclusion, delegate it. If you already know the exact file and symbol, just read it — spawning an agent for a one-fact lookup is overhead theater.

## Model Routing Is an Economic Decision

Notice the `model:` line in each frontmatter. The routing is deliberate:

| Role | Model | Why |
|---|---|---|
| agent-orchestrator | Opus | Dispatch decisions are cheap in tokens but expensive to get wrong |
| loop-planner | Opus | Design quality determines everything downstream |
| guardian | Opus | Judgment calls on ambiguous failures; runs infrequently per batch |
| loop-executor | Sonnet | Mechanical implementation of a fully-specified plan |
| loop-verifier | (inherits) + **Codex** | Independence matters more than raw strength |

The pattern generalizes: **spend on the decisions, save on the keystrokes**. A strong model writing a precise plan lets a cheaper model execute it correctly in one pass — which is cheaper than a strong model doing both, and far cheaper than a weak model designing badly and iterating. And the final quality verdict comes from a *different vendor entirely*, because the failure modes of a model family are correlated: a Claude judging Claude-written tests shares blind spots with the author. The doer never judges its own work.

## The Disjoint-File-Ownership Rule

Parallelism has one hard precondition: parallel file-editing agents must own **disjoint file sets**. Two executors touching the same file will silently clobber each other — the second write wins and nobody notices until the tests fail in a way neither agent caused alone.

Our rules:

- Each executor is launched with an explicit allowed-edit scope, usually one file. The scope is part of the launch prompt, and the agent definition forbids edits outside it.
- Parallelize **across targets**, never within one. Ten modules needing tests → ten executors, one file each, all at once. One module needing ten tests → one executor.
- When disjoint ownership can't be guaranteed — larger features, refactors that ripple — the agent gets an **isolated git worktree** instead. Worktree isolation gives it a full copy of the repo to mutate freely; integration back happens as an explicit merge, where conflicts surface loudly instead of silently.
- Read-only agents (Explore, verifiers, reviewers) need no ownership at all and can overlap anything.

This rule came from experience, not theory: the one time we let two agents share a file "because the edits were in different functions", one of them reformatted the file and erased the other's work.

## Continue the Agent, Don't Respawn It

The subtlest rule in the roster is in the executor's trigger description:

> A verify round produced actionable feedback → send the feedback to the SAME running executor, never a fresh spawn, so it keeps its implementation context (max 3 rounds per target).

When a verifier fails an executor's work, the feedback goes back via a follow-up message to the *same agent* — Claude Code supports continuing a previously spawned agent with its conversation intact — rather than spawning a new executor with the feedback pasted into a fresh prompt.

The reason is context economics. The running executor already holds:

- the plan and its interpretation of it,
- the full content of the files it read and wrote,
- the reasoning behind every choice it made,
- the output of its own self-checks.

A fresh spawn has none of that. It must re-read everything, re-derive the intent, and — critically — it may "fix" the feedback by rewriting working code it doesn't understand, introducing new defects while addressing old ones. The same executor, by contrast, makes a surgical correction because it knows exactly why the code looks the way it does.

The cap matters too: **maximum three feedback rounds per target**. If three verify→fix cycles haven't converged, the problem is not in the execution — it's in the plan, or the target is bigger than scoped. At that point the loop stops and escalates rather than burning a fourth round hoping. An agent that keeps looping on the same failure is the multi-agent version of a developer mashing re-run on a flaky test.

## Putting It Together

A typical feature run looks like this:

1. Main thread receives the objective; **Explore** agents fan out to map the affected area while the main thread reads the critical files.
2. **loop-planner** (Opus) produces a concrete plan per target, in parallel across targets.
3. **loop-executor** (Sonnet) agents implement, one per target, disjoint files, in parallel.
4. **guardian** validates each batch — lint, types, build, affected tests, import resolution.
5. **loop-verifier** runs the gates plus the cross-vendor Codex verdict; failures go back to the same executors, at most three rounds.
6. Guardian runs once more as the pre-commit gate; the cross-vendor review of the final PR diff gates the merge.

The main conversation never holds a file dump, never grades its own homework, and never pays Opus prices for Sonnet work. That is the whole trick.

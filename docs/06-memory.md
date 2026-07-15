# Persistent Memory: How an AI Team Remembers

Every Claude Code session starts with a blank context window. Without a deliberate memory system, the AI re-learns the same vendor API quirks, re-makes mistakes it already made and fixed, and re-asks questions the human answered weeks ago. This chapter describes the memory architecture we built for developing a regulated Banking-as-a-Service platform — the layer that turns a stateless model into a team member with institutional knowledge.

## The problem: amnesia is expensive

An AI session that forgets is worse than a junior engineer who forgets, because it forgets *completely* and *every time*. Concretely, amnesia costs us in three ways:

- **Re-discovery.** External payment APIs are full of undocumented behavior — response shapes that differ per endpoint, enum values the docs list but the live API rejects, auth headers that fail silently when omitted. Discovering each of these costs a debugging session. Re-discovering them costs the same session again.
- **Re-regression.** A bug pattern the human already corrected ("this state flag is not a mutex", "this ID field is not the ID you think it is") gets reintroduced by a fresh session that never saw the correction.
- **Re-asking.** Decisions the human already made — naming conventions, promotion policy, which environment is which — get asked again, burning the scarcest resource: the founder's attention.

On a fintech platform, re-regression is not just wasteful; a re-made mistake can move money wrong. Memory is a safety control, not a convenience.

## The architecture

The memory system lives in a per-project directory outside the repo, alongside the AI's other project state. It has two layers: a fact store and a session-history store.

### Layer 1: one fact per file

Each memory is a small markdown file with YAML frontmatter. One fact — one lesson, one project's status, one API gotcha — per file:

```markdown
---
name: vendor-list-responses-vary-by-endpoint
description: The payments vendor wraps list responses differently per
  endpoint — always normalize through the shared helper, never ad-hoc
type: reference
---

The vendor's list endpoints return items under different keys depending
on resource type (`data`, `items`, or a resource-named key). Ad-hoc
unwrapping chains break when a new endpoint is added.

**How to apply:** route every list response through the shared
normalizer helper. See also [[vendor-response-envelope]].
```

The `type` field gives each memory a job:

- **`feedback`** — a correction from the human or a lesson from an incident. These follow a strict internal shape: what happened, **Why** it happens (the mechanism, so the lesson generalizes), and **How to apply** (the concrete rule for next time). Feedback memories are the highest-value class; they are the human's code review, made permanent.
- **`project`** — the state of a piece of ongoing work: what shipped, what's blocked, and crucially *which environment it reached*. On a platform with dev → sandbox → production promotion, "done" is three different claims. Project memories track promotion status explicitly so a session never assumes a dev-only fix is live for customers.
- **`reference`** — externally-sourced facts: validated API enum values, vendor auth traps, response-shape quirks, rate-limit behavior. Things that were expensive to discover and are true independent of our code.
- **`user`** — durable facts about the human: communication preferences, role (business owner, not engineer), standing decisions.

Memories cross-link wiki-style with `[[name]]` references, so reading one memory surfaces its neighbors — a feedback memory about idempotency links to the reference memory about the vendor's retry semantics.

### Layer 2: the index — MEMORY.md

Loading a hundred memory files into every session would defeat the purpose; the context window is the budget. So the always-loaded artifact is a single compressed index, `MEMORY.md`: **one line per memory**, grouped into sections (rules to read first, active work, external API pitfalls, security patterns, user preferences), each line carrying a link and a *hook* — just enough of the fact that the AI knows when to open the full file:

```markdown
## External API Pitfalls
- [Vendor list responses vary by endpoint](reference_vendor_list_shapes.md) — always use the shared normalizer
- [Sandbox auth silently scopes to affiliate](reference_vendor_affiliate_header.md) — missing header = empty results, no error

## Active Work
- [Approval-gate feature](project_approval_gate.md) — shipped to dev AND sandbox; NOT production
```

The design constraint is that this index stays small enough to load into context at the start of *every* session. The hooks are doing the real work: a session touching the vendor's list endpoints sees the one-liner, recognizes relevance, and reads the full file on demand. Everything else stays on disk, costing nothing.

This is the same pattern as a good README versus the codebase: the index tells you *that* something is known and *where*; the file tells you *what*.

### Layer 3: session history

Separate from the fact store, a session-history layer records *what happened*, not *what's true*:

- **Daily rolling notes** — what each session did, decisions made, loose ends.
- **A recent window** (roughly the last seven days) kept at full detail, because "what did we do Tuesday?" is a common question.
- **A long-term archive** for everything older.
- **Consolidation passes** that compress old days into summaries — outcomes survive, play-by-play does not.

History answers "where were we?"; the fact store answers "what do we know?". Keeping them separate stops the fact store from silting up with narrative.

## Rules that make it work

A memory system without discipline becomes a junk drawer. Ours runs on a few hard rules:

**Check before writing.** Before creating a memory, search for an existing one on the same topic. If it exists, update it — don't create a near-duplicate. Two memories on the same subject with slightly different claims is worse than none, because the AI can't tell which is current.

**Delete what turns out wrong.** A memory that recorded a wrong diagnosis, or a workaround that a later fix made obsolete, gets deleted — not annotated, deleted. Wrong memories actively cause bugs: the AI trusts them.

**Don't store what the repo already records.** Git history, `CLAUDE.md` rules, and code comments are already persistent and already loaded where relevant. Memory is for what has *no other home*: session-derived lessons, external-API discoveries, cross-session work state. Duplicating `CLAUDE.md` content into memory creates two sources of truth that drift.

**Absolute dates only.** "Last Tuesday" is meaningless to a session reading the memory three months later. Every date in a memory is absolute (`2026-07-14`), converted at write time.

**Memories record what was true when written.** This is the most important epistemic rule. A project memory saying "feature X is dev-only" was true at write time; it may have been promoted since. Before *acting* on an old memory — especially before touching money paths or making promotion decisions — the session verifies against ground truth: the actual branch, the actual deployed function, the actual database. Memory is a map, and the territory moves.

## Memory as the incident-to-rule pipeline

The highest-leverage property of the system is that it turns incidents into progressively stronger controls. The promotion path looks like this:

```
incident → feedback memory → CLAUDE.md rule → (sometimes) enforcing hook
```

Each step widens the audience and hardens the enforcement. A feedback memory is advisory and read on demand. A `CLAUDE.md` rule is loaded into *every* session unconditionally. A hook is code — it doesn't rely on the model reading anything.

Two genericized examples from our history:

**Example 1: the double-submit bug.** A user double-clicked a withdrawal button and two withdrawals went out. Root cause: the frontend used React state as a concurrency guard, and state updates are batched — both clicks read "not submitting". The incident produced a feedback memory (*Why:* state is a render-scheduling mechanism, not a mutex; *How to apply:* use a synchronously-updated ref, and require server-side idempotency keys on every money-moving endpoint). Because the pattern is money-critical and easy to reintroduce, it was promoted into `CLAUDE.md` as a standing rule: every financial mutation ships with a ref-based frontend guard *and* a server-side idempotency key, no exceptions. Every future session now sees the rule before writing a single payment form.

**Example 2: the unreviewed merge.** Work merged after being reviewed only by the model that wrote it — the doer judging its own work. The lesson became a feedback memory, then a `CLAUDE.md` rule (every merge requires an independent review by a different model vendor with an explicit ship/block verdict), and finally a *hook*: a pre-tool-use script that blocks the merge command unless a per-commit-SHA approval file exists. New commits invalidate the approval. At that point the rule no longer depends on any model remembering it — the harness enforces it mechanically.

Not every memory earns promotion. The heuristic: a lesson that is (a) money- or security-critical, (b) likely to recur, and (c) cheap to state as a rule gets promoted to `CLAUDE.md`. A rule that can be checked mechanically and whose violation is catastrophic gets a hook. Everything else stays a memory, read when relevant.

## Consolidation: gardening the store

Memory quality decays by default. Facts go stale as features promote across environments; two sessions independently record overlapping lessons; the index accumulates lines for work that finished months ago. So we run periodic **consolidation passes** — a dedicated session whose only job is gardening:

- **Merge duplicates.** Overlapping memories collapse into one, with the survivor absorbing anything unique from the casualties.
- **Fix stale facts.** Project memories get re-verified against reality: has the "NOT production" feature been promoted? Is the "blocked" item still blocked? The pass checks and updates.
- **Prune the index.** Completed work moves from active sections to a link-only archive line or gets deleted; the always-loaded index shrinks back toward its budget.
- **Compress history.** Old daily notes fold into weekly summaries.

Consolidation is what keeps the core design constraint honest: the index must stay small enough to load every session, forever, no matter how long the project runs. Without pruning, the memory system would slowly eat the context window it exists to protect.

## What this buys us

After months of operation, the practical effect is that a brand-new session behaves like it has tenure. It knows the vendor's response envelopes without probing. It knows which features are live where without asking. It refuses to write a payment mutation without an idempotency key because the rule — born from a real double-withdrawal — is in its context before the first prompt. The human corrects a mistake once, and the correction outlives every context window.

That is the actual product of the memory system: not recall, but *compounding*. Each session starts where the last one ended, and the team gets smarter at a rate no single context window could sustain.

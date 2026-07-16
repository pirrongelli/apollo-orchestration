# CLAUDE.md — the project constitution

This directory contains an adoptable template for a `CLAUDE.md` file, distilled from the
production constitution of a regulated Banking-as-a-Service platform built by a solo
founder with a Claude Code agent team.

## What CLAUDE.md is

`CLAUDE.md` is loaded into every single session, before the first user message. It is not
documentation — it is the **always-on rulebook** the agent operates under: what it may
decide alone, what it must stop and ask about, what "done" means, and which mistakes it
is structurally forbidden from repeating.

Because it is always loaded, every line costs context in every session. That forces a
useful discipline: only rules that apply to *most* sessions earn a place here.

## Keep the constitution small — target ~200 lines

Bloat is not a cosmetic problem. Every line in CLAUDE.md is re-read by the model on
every single turn of every session, competing for the same attention budget as the
actual task. Past a few hundred lines, adherence measurably degrades — the agent starts
skimming instead of obeying, and the rules most likely to get skipped are the ones
buried in the middle of a long file, not the ones at the top or bottom.

Treat **~200 lines as the target size** for the always-loaded constitution, not a floor
to fill. If the file is growing past that, the fix is almost never "trim the prose" —
it's "move the content to something that isn't always loaded":

- **Procedural, step-by-step content** (how to write a migration, how to scaffold a
  webhook handler, how to deploy a function) belongs in a **skill**, loaded on demand
  only when the agent is actually doing that task. See `examples/skills/`.
- **Constraints that only apply to specific files or paths** (a security rule that only
  matters in the payments directory, a schema convention that only matters in
  migrations) belong in a **path-scoped rule** — a file under `.claude/rules/*.md` that
  auto-loads when the agent reads a matching file, instead of on every session
  regardless of what's being touched. See `examples/rules/`.

The always-loaded file should hold only what must constrain the agent *even when it
isn't thinking about that topic*: the operating contract, hard stops, and the handful of
invariants that apply to virtually all code in the repo.

## What belongs in CLAUDE.md vs skills vs path-scoped rules

| Belongs in CLAUDE.md (always-on, ~200 lines) | Belongs in a skill (on-demand playbook, `examples/skills/`) | Belongs in a path-scoped rule (auto-loads on matching files, `examples/rules/`) |
|---|---|---|
| The operating contract: agentic loop, hard stops, circuit breaker | Step-by-step procedures for one domain (migrations, webhooks, deploys) | Constraints scoped to one directory or file pattern (e.g. money-moving code, one provider's client) |
| The definition of "done" and the verification bar | Long checklists only relevant when doing that specific task | Schema or API conventions that only apply inside a specific subsystem |
| Security invariants that apply to all code (idempotency, SSRF, dedup) | Provider- or API-specific gotchas and payload shapes | File-specific gotchas an agent should see the moment it opens that file, not before |
| Git/PR discipline and merge gates | Templates, scaffolds, example code | |
| Rules born from real incidents that must never recur | Reference material you look up, not obey | |

The test: if a rule must constrain the agent *even when it isn't thinking about that
topic*, it goes in CLAUDE.md. If it's a recipe you pull out when doing X, it's a skill.
If it only matters when touching a specific file or directory, it's a path-scoped rule
— it should load automatically when that file is read, not tax every other session.

## How it grows: incidents → memory → rule

The template did not start this size. Nearly every rule in it traces to a real failure:

1. **Incident** — something breaks: a duplicate withdrawal, a silently-dropped webhook
   status, a "perf optimization" that killed auto-refresh platform-wide for months.
2. **Memory** — the session that fixed it writes the root cause and the generalized
   lesson to a memory file, so the *next* session doesn't rediscover it.
3. **Rule** — if the lesson keeps mattering across sessions, it gets promoted into
   CLAUDE.md as a permanent constraint, phrased as wrong-vs-right so the agent can
   pattern-match it (`if (exists) return;` — wrong; compare status too — right).

Prune in the same direction: rules that stop firing get demoted back to memory or
deleted. A constitution full of dead law trains the agent to ignore it.

## How to adapt the template

Copy `CLAUDE.md.template` to your repo root as `CLAUDE.md` and:

**Fill the placeholders.** Everything in `{{DOUBLE_BRACES}}`: project name and stack,
branch names, the exact lint/test/build commands, your deploy trigger, memory-file
location. Budget under an hour — if a placeholder takes longer, delete the section
until you need it.

**Keep as-is** (these generalize to any serious project):
- RULE #1 (independent cross-vendor verification before merge) — swap in whatever
  second model/CLI you use as the reviewer.
- The Operating Mode: the loop contract, done-checklist, decide-vs-ask split, circuit breaker.
- Verification discipline, testing mindset, PR discipline, context management.

## Never claim a hook that doesn't exist

RULE #1's template phrasing includes "Enforced by hook." Before you keep that line,
**confirm the hook actually exists in your repo** (e.g. a pre-tool-use hook that blocks
the merge command without a recorded approval). If it does, keep the claim — it's true
and it matters: the agent should know a rule is mechanically enforced, not just a
convention it could talk itself out of.

If no such hook exists yet, don't leave the aspirational phrasing in place. State the
gate honestly as **convention-only**: "the agent is expected to run this review before
merging" rather than "the merge is blocked without it." A false enforcement claim is
worse than no claim — it teaches the agent (and you) to trust a safety net that isn't
there. Write the hook first, or downgrade the wording until you do.

**Keep if you move money or hold user data**, otherwise trim:
- The security patterns section (idempotency, SSRF, dedup guards, reject-lists).
- The hard stops about production promotion and irreversible financial mutations.

**Delete freely:**
- Any section whose failure mode you haven't hit and can't imagine hitting. Add it back
  when the incident happens — a rule you can't explain is a rule the agent won't respect.

**Then let it evolve.** After every painful incident, ask: which one sentence in
CLAUDE.md would have prevented this? Add that sentence. Nothing else.

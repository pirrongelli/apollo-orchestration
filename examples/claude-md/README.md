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

## What belongs in CLAUDE.md vs in skills

| Belongs in CLAUDE.md (always-on) | Belongs in a skill (on-demand playbook) |
|---|---|
| The operating contract: agentic loop, hard stops, circuit breaker | Step-by-step procedures for one domain (migrations, webhooks, deploys) |
| The definition of "done" and the verification bar | Long checklists only relevant when doing that specific task |
| Security invariants that apply to all code (idempotency, SSRF, dedup) | Provider- or API-specific gotchas and payload shapes |
| Git/PR discipline and merge gates | Templates, scaffolds, example code |
| Rules born from real incidents that must never recur | Reference material you look up, not obey |

The test: if a rule must constrain the agent *even when it isn't thinking about that
topic*, it goes in CLAUDE.md. If it's a recipe you pull out when doing X, it's a skill.

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

**Keep if you move money or hold user data**, otherwise trim:
- The security patterns section (idempotency, SSRF, dedup guards, reject-lists).
- The hard stops about production promotion and irreversible financial mutations.

**Delete freely:**
- Any section whose failure mode you haven't hit and can't imagine hitting. Add it back
  when the incident happens — a rule you can't explain is a rule the agent won't respect.

**Then let it evolve.** After every painful incident, ask: which one sentence in
CLAUDE.md would have prevented this? Add that sentence. Nothing else.

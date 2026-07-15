# Skill Examples

This directory contains genericized, copy-pasteable examples of the skills we use
in production, plus a blank template for writing your own. See
[docs/04-skills.md](../../docs/04-skills.md) for the methodology behind them.

## What a skill is

A skill is a Markdown playbook (`SKILL.md`) that Claude Code loads **on demand**
when a task matches its trigger description. It is not always-on context: it costs
zero tokens until the moment it's relevant, then injects a complete, opinionated
procedure for one domain — the steps, the code patterns, and (most importantly)
the accumulated scar tissue of everything that has gone wrong in that domain before.

Think of it as the difference between hiring a generalist and handing that
generalist the team's runbook the moment they pick up a ticket in your domain.

## Where skills live

```
.claude/skills/<skill-name>/SKILL.md
```

One directory per skill, one `SKILL.md` per directory. Supporting files
(reference docs, scripts) can sit next to it, but the playbook itself is the
single Markdown file with YAML frontmatter:

```yaml
---
name: create-migration
description: Create safe database migrations with RLS policies... Use when
  adding tables, columns, indexes, or modifying database schema.
argument-hint: [migration-name]
---
```

## How triggering works — write the description as a trigger

The `description` field is matched against incoming tasks to decide whether the
skill loads. This means the description is **not a summary of the file — it is a
trigger condition**. Write it like one:

- **Bad**: "Documentation about our webhook architecture."
- **Good**: "Design and implement webhook features including event delivery,
  retry logic, HMAC signing, and SSRF protection. Use when working on webhook
  endpoints, delivery pipelines, or event-driven architecture."

The second version enumerates the *task phrasings* that should activate it
("Use when working on..."). If a skill isn't firing when it should, the fix is
almost always in the description, not the body.

## What makes a good skill

1. **It encodes real failures as prohibitions, with history.** The highest-value
   lines in a skill are the ones that say "NEVER do X — this broke Y" where Y
   actually happened. "Never reference the dropped legacy role table" is worth
   more than ten paragraphs of general advice, because a fresh session has no
   other way to know the table was dropped. Every production incident should
   leave a sentence behind in some skill.

2. **Every step ends in a verification.** A step that can't be checked is a
   hope, not a step. "Reset the local database and confirm all migrations apply
   from scratch" is a step; "write careful SQL" is not.

3. **It says when NOT to apply.** A skill that fires on everything adjacent to
   its domain does damage — the webhook skill should not hijack a task about
   *receiving* third-party webhooks when it was written for *sending* them.
   State the boundary explicitly.

4. **It's opinionated.** A skill exists to remove decisions, not present
   options. If your team always uses `DROP POLICY IF EXISTS` before
   `CREATE POLICY`, the skill says "always", not "consider".

## Process skills vs implementation skills

We distinguish two kinds:

- **Process skills** encode *how to work*: test-driven development, systematic
  debugging, verification-before-completion. They are domain-agnostic and change
  the shape of the loop the agent runs.
- **Implementation skills** encode *how to build in one domain*: database
  migrations, webhook delivery, edge functions, admin UI patterns. They carry
  schemas, code snippets, and domain gotchas.

The examples in this directory are implementation skills. Process skills tend to
be portable across projects as-is; implementation skills are where your
project-specific scar tissue accumulates.

## The context-budget split: CLAUDE.md vs skills

Both CLAUDE.md and skills inject instructions — the difference is *when they're
paid for*:

- **CLAUDE.md** is loaded into every single session, on every task. Every line
  in it taxes every conversation forever. It should carry only what is *always*
  relevant: hard rules, architecture in three sentences, the commands, the
  handful of gotchas so dangerous they must never be out of context.
- **Skills** are loaded only when their domain comes up. Detailed schemas,
  step-by-step procedures, code templates, and long gotcha lists belong here —
  a session about frontend styling should never pay the token cost of your
  migration playbook.

The practical rule: when a lesson learned starts as a line in CLAUDE.md and the
domain grows past a few lines, **move the detail into a skill and leave at most
a one-line pointer behind**. If CLAUDE.md is growing, you're putting things in
the wrong place.

## Files in this directory

| File | What it is |
|------|-----------|
| [TEMPLATE.md](TEMPLATE.md) | Blank skill template with guidance comments in every section |
| [create-migration/SKILL.md](create-migration/SKILL.md) | Database migrations with row-level security — an implementation skill built around idempotency and locally-verified deploys |
| [webhook-system/SKILL.md](webhook-system/SKILL.md) | Outbound webhook delivery — HMAC signing, SSRF defense, retries, idempotency |

Both example skills are genericized from production playbooks on a regulated
financial platform. The table names, function names, and identifiers are
placeholders; the gotchas are real.

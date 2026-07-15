# Skills: Encoded Domain Knowledge

A skill is a markdown playbook that tells the model *how* to do a class of task before it starts. On our regulated Banking-as-a-Service platform, skills are where hard-won domain knowledge lives — the gotchas, the mandatory patterns, the "we shipped this broken once and here is why it will never happen again" rules. This chapter covers what skills are, which ones we built, and what separates a skill that works from a wiki page nobody reads.

## What a skill is

In Claude Code terms, a skill is a directory containing a `SKILL.md` file. The file has YAML frontmatter with a `name` and a `description` — the description doubles as the trigger: it tells the model *when* the skill applies. The body is the playbook: steps, code templates, rules, and failure modes for one class of task.

Skills load on demand. They are not injected into every conversation the way the project instructions file is. When the model recognizes that a task falls into a skill's domain, it invokes the skill, the full playbook enters context, and the model follows it.

The reason skills exist is simple: without them, the model re-derives the approach every session — and re-derives it slightly wrongly. It will write a database migration that forgets to enable row-level security. It will build a webhook sender that validates URLs at registration time but not at delivery time, leaving a DNS-rebinding hole. It will forget that one of our providers wraps every API response in an extra `data` envelope. Each of these was a real mistake once. The skill exists so it is never a mistake twice.

## The rule: skills before exploration

Our project instructions make this non-negotiable:

> **Invoke the relevant skill** before working in its domain. Skills tell me *how* — check before exploring.

The operational heuristic we use: **if there is even a 1% chance a skill applies, use it.** The cost of loading a playbook that turns out to be irrelevant is a few hundred tokens. The cost of *not* loading it is the model spending twenty minutes exploring the codebase to rediscover a pattern the skill states in one line — or worse, confidently doing the thing the skill exists to prevent.

This ordering matters. The naive agent workflow is: read the task, explore the code, form a plan, implement. The skilled workflow inserts a step zero: *check whether someone already wrote down how to do this.* Exploration then confirms and localizes; it does not invent the approach.

## Anatomy of a skill

Here is a sanitized excerpt of one of our skills — the database-migration playbook — showing the frontmatter and the shape of the body:

```markdown
---
name: create-migration
description: Create safe database migrations with RLS policies, proper
  role checks, and rollback support. Use when adding tables, columns,
  indexes, or modifying database schema.
argument-hint: [migration-name]
---

# Create Migration

## Step 1: Generate the migration file
    npx supabase migration new $ARGUMENTS

## Step 2: Write the migration SQL — follow these rules strictly

### Table creation
    CREATE TABLE IF NOT EXISTS public.new_table ( ... );
    ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

### RLS policies — use the CORRECT functions
    -- Admin access (NEVER use the old role function — it was dropped)
    DROP POLICY IF EXISTS "admin_full_access" ON public.new_table;
    CREATE POLICY "admin_full_access" ON public.new_table
      FOR ALL USING (is_admin(auth.uid()));

### Critical rules
1. Always DROP POLICY IF EXISTS before CREATE POLICY — idempotent migrations
2. Never reference the legacy roles table — dropped in an old migration
3. Sensitive columns (secrets, tokens): service-role-only policies
4. Index every column used in WHERE/JOIN

## Step 3: Test locally before committing
    supabase db reset
```

Three things to notice:

1. **The description is a trigger, not a summary.** "Use when adding tables, columns, indexes, or modifying database schema" — the model matches incoming tasks against these descriptions. Vague descriptions mean skills that never fire.
2. **Rules are stated as prohibitions with history.** "NEVER use the old role function — it was dropped" carries more weight than "use the current role function." The negative form encodes the specific mistake the model would otherwise make, because that function still appears in old migrations it might copy from.
3. **Every step ends in a verification.** Generate the file, write the SQL, *test it locally with a full reset*. A playbook without verification steps is a suggestion; with them, it is a procedure.

## Our skill portfolio

What we chose to encode says a lot about where an AI team goes wrong without guidance. The portfolio, by category:

**Database migrations.** Row-level security on every table, the correct authorization functions (and the dropped legacy ones to avoid), idempotent policy creation, index requirements, local testing before commit. Migrations are the highest-blast-radius artifact in the repo; this was the first skill we wrote.

**Serverless edge functions.** Scaffolding a new function on the Deno runtime: CORS handling, the two mutually-exclusive auth patterns (API-key for programmatic access, session JWT for the frontend — mixing them is a recurring class of vulnerability), error shapes, and how deployment actually happens (CI on push, not manual commands).

**Provider-aware features.** The platform integrates multiple banking providers, and every customer-facing feature must handle "this customer has provider A, provider B, or both." The skill encodes the detection hooks, the visibility rules, and the principle that no provider ships with less feature coverage than the others for equivalent data.

**Webhook systems.** The densest skill we have: delivery pipeline architecture, HMAC signing, retry logic with exponential backoff and auto-disable thresholds, and SSRF protection as a mandatory section — private IPv4 *and* IPv6 ranges blocked, URL revalidation at fetch time (not just registration time) to defeat DNS rebinding, `redirect: 'error'` on outbound requests. Every rule in that section is a hole we either found or nearly shipped.

**Scheduled jobs.** Cron-triggered workers: database-scheduler setup, service-role-only auth, function timeouts, idempotency patterns, batch processing. Background jobs fail silently by default; the skill's job is making them fail loudly or not at all.

**Admin UI patterns.** How admin pages are built here: routes, sidebar registration, detail tabs, charts, and the human-readability bar — no raw UUIDs on screen, foreign keys resolved to names, every record traceable to its origin.

**Fintech domain knowledge.** Payment rails (SEPA, SWIFT, ACH, and friends), KYC/KYB flows, transaction lifecycle states, fee calculation, multi-currency handling. This one is less "how to write code" and more "what the words mean" — it stops the model from modeling a payment as a single atomic state change when real rails involve pending, held, returned, and reversed states.

**A weekly security-audit routine.** A full audit procedure encoded as a skill: advisor sweeps, an access-control scan, active probing against non-production environments only, read-only checks against production, then findings reported and draft fixes opened. The skill's value is that the audit is *repeatable* — same coverage every week, whether it runs on schedule or on demand after a big change. (The probe specifics live in the skill; they do not belong in a public doc.)

**Engineering-loop skills.** Two meta-skills that run our development loop itself: one drives the discover → plan → execute → verify → iterate cycle with model routing (cheap models for mechanical work, expensive ones for design, a different vendor's model as independent verifier), and one manages the loop's persistent memory file — what was proven, what was verified, what remains open. These are covered in depth in the orchestration chapter; they are listed here because they are, structurally, just skills.

**A general platform-expertise skill** rounds it out: deep patterns for our backend stack — RLS policy design, realtime subscriptions, auth flows — that cut across the others.

## Process skills vs. implementation skills

The portfolio splits into two kinds, and the distinction matters for ordering.

**Process skills** decide the approach before any domain work starts: brainstorming (explore intent and requirements before building), systematic debugging (reproduce and localize before proposing fixes), test-driven development (failing test first; tests define done). These come from a shared library rather than our project, and they fire *first*. A bug report triggers systematic debugging before it triggers any implementation skill.

**Implementation skills** — everything in the portfolio above — carry the chosen approach out within a domain.

A typical task chains them: a webhook delivery bug fires *systematic debugging* (find the actual root cause, don't guess), then *test-driven development* (write the test that reproduces it), then *webhook-system* (fix it without violating the SSRF or retry rules). The process skills keep the model honest about method; the implementation skills keep it honest about domain facts.

## What makes a good skill

Having written and rewritten these, our criteria:

**It encodes gotchas learned from real failures.** The best lines in our skills are archaeology. "This provider wraps all responses in an extra data envelope — always unwrap before reading fields." "This provider returns balance as an object of strings, never a number — parse it, never insert it raw." "Status values arrive uppercase; the database enum is lowercase." None of these are guessable from documentation; each cost us a debugging session once. A skill that only restates official docs adds nothing — the model has read the docs. The skill's job is everything the docs don't say.

**Its steps are verifiable.** "Test locally with a full database reset before committing." "Run the coverage checker after touching realtime code." Every instruction should end in a command whose exit code proves compliance. Instructions like "be careful with auth" are noise; "auth is one of exactly two patterns, here they are, never mix them" is a checkable rule.

**It says when NOT to apply.** Good skills carry boundaries. The engineering-loop skill refuses to run on goals that aren't command-verifiable ("make it better" gets bounced back for restatement). The scheduled-jobs skill is for internal workers, not customer-facing endpoints — using its service-role auth pattern on a customer API would be a security bug. A skill without scope boundaries gets applied everywhere, which is how you get SSRF validation on internal-only URLs and cargo-cult ceremony on one-line changes.

**It is a procedure, not an essay.** Numbered steps, code templates ready to adapt, tables of exact values. The model executing a skill under pressure should be copying and adapting, not interpreting prose.

## Skills vs. CLAUDE.md: the context budget

The obvious question: why not put all of this in the always-loaded project instructions file?

Because always-on context is the scarcest resource in the system. Every token in CLAUDE.md is paid on *every* message of *every* session — including sessions about CSS tweaks that will never touch a migration. Our CLAUDE.md is already large; adding the full webhook playbook, the migration templates, and the fintech glossary would triple it, and rules buried in a huge always-on file get *less* reliably followed, not more. Attention dilutes.

So the split is:

- **CLAUDE.md holds always-on rules** — things that apply to essentially every task: the orchestration and verification requirements, the hard stops (production promotion, money movement), the coding principles, the handful of platform-wide invariants (never expose external provider IDs; financial mutations need server-side idempotency). Each rule earns its permanent slot by being violated at cost when absent.
- **Skills hold on-demand deep playbooks** — hundreds of lines of domain-specific procedure that only matter when you are in that domain, loaded exactly then.

The two reference each other deliberately. CLAUDE.md contains one always-on line per domain — "invoke the relevant skill before working in its domain" plus a list of domains — and the skills carry the depth. The always-on file is a routing table; the skills are the routes.

There is a maintenance loop, too. When a session surfaces a new gotcha — a provider quirk, an auth footgun, a migration pattern that bit us — the fix is not just the code fix. The lesson gets written into the relevant skill (or into CLAUDE.md if it is genuinely universal) before the session ends. A skill that stops absorbing failures stops earning its trigger.

## Takeaways

- A skill is an on-demand markdown playbook with a trigger description; it tells the model *how*, so the how is not re-derived wrongly each session.
- Invoke skills before exploring. If there is a 1% chance one applies, load it — the asymmetry in cost is enormous.
- Encode what documentation doesn't say: real failures, exact values, prohibitions with history, verification commands, and explicit non-applicability.
- Split process skills (how to approach) from implementation skills (how to execute in a domain); chain them.
- Keep always-on context small. CLAUDE.md routes; skills carry the depth. Every lesson learned goes back into one or the other.

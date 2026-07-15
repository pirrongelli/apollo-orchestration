# Chapter 05 — Hooks as Deterministic Guardrails

Instructions in a prompt are probabilistic; hooks are deterministic. This chapter documents how we turned every "the AI must never do X" rule for a regulated Banking-as-a-Service platform into a PreToolUse hook that denies the tool call in code — with a reason the model can read, learn from, and route around correctly. If a policy matters enough that violating it once is unacceptable, it does not live in a prompt.

## The core idea: prompts drift, code doesn't

CLAUDE.md can say "never push to prod" in bold, at the top, three times. The model will comply — almost always. But "almost always" is the wrong reliability class for a system that deploys to production on git push and moves real money. Context windows compact, instructions fade behind fifty tool calls, an urgent-sounding task creates pressure to cut corners. Any rule enforced only by instruction has a failure rate that scales with session length and urgency.

Claude Code's hook system gives us a second reliability class. A `PreToolUse` hook is a shell command that runs *before* the tool call executes, inspects the exact input the model is about to send, and can deny the call outright. The hook is deterministic: the same input is blocked every time, regardless of what the model believes, how long the session has run, or how convincingly a prompt argued for an exception.

So our rule of thumb is simple:

> **Anything that MUST never happen gets a hook. Anything that SHOULD not happen gets a CLAUDE.md rule. Anything that needs human judgment gets a hard-stop convention.**

The rest of this chapter walks through the hooks we actually run, then the design principles we extracted from operating them.

## How a deny hook works

A hook receives the pending tool call as JSON on stdin and replies with a permission decision on stdout. The load-bearing part is the `permissionDecisionReason` — the model *reads it* as the tool result. A good reason converts a blocked action into a corrected one in the very next step, without human intervention.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Why this is blocked, and what to do instead."
  }
}
```

Everything below is a sanitized, simplified excerpt of our real configuration. The production versions are dense shell one-liners with `jq` and `grep -E`; we show the logic, not the golf.

## Guardrail 1: no pushes to protected branches

Our branch model (chapter 01) maps branches to environments: `dev` is development, `main` is the *customer sandbox*, `prod` is production and auto-deploys. Pushing to `dev` is the normal deploy path; pushing to `main` or `prod` is a promotion decision the human makes explicitly, every time.

The hook matches on the `Bash` tool and inspects the command:

```sh
# PreToolUse, matcher: Bash
cmd=$(stdin | jq -r '.tool_input.command')

# Only care about pushes targeting the protected branches
echo "$cmd" | grep -qE 'git +push .* (main|prod)( |$)' || allow

# Scope check: if the command cd's into some OTHER repo,
# this guard does not apply — standalone repos may push freely
if echo "$cmd" | grep -qE 'cd ' && ! echo "$cmd" | grep -q 'platform-app'; then
  allow
fi

deny "Push to main/prod of the platform monorepo is blocked
      (customer sandbox / production). Per CLAUDE.md, push to dev
      IS the deploy. If genuinely intended, the user runs it
      manually via the ! prefix."
```

Two details matter. First, the scope check: the same Claude Code session sometimes works on side repos (a relay service, a docs site) where `git push main` is perfectly fine. The guard applies only to the protected monorepo; a command that enters a different repo passes. Second, the escape hatch is named *in the denial message*: the human can always run the command themselves. The hook constrains the agent, not the owner.

## Guardrail 2: no local deploy scripts

Deploys happen through CI/CD when commits land on a branch — that pipeline runs migrations, deploys edge functions, and records what shipped. Local deploy scripts exist as emergency escape hatches, but if the agent runs them "to be helpful," the environment silently diverges from what git says is deployed. That divergence has cost us real debugging days.

```sh
# PreToolUse, matcher: Bash
cmd=$(stdin | jq -r '.tool_input.command')

if echo "$cmd" | grep -qE 'npm run deploy:(migrations|functions|prod)|db-cli (db push|migration up)'; then
  deny "Deploys go through CI/CD on git push to dev/main/prod.
        Local deploy scripts are emergency-only and must be
        invoked by the user manually."
fi
```

We pair this with two MCP-tool denials for the same reason: the database platform's MCP server exposes `apply_migration` and `deploy_edge_function` tools that would also bypass CI. Both are matched by tool name and denied unconditionally, with reasons that point at the correct path ("author the migration, commit, push to dev — CI runs the deploy").

## Guardrail 3: no destructive SQL, ever, from any door

The agent has two ways to reach the database directly: `psql` via Bash, and an `execute_sql` MCP tool. Both are genuinely useful — the "verify real data before coding" discipline (chapter 03) depends on read access. But raw write access to a production-adjacent database is where AI mistakes become irreversible. So both doors get the same guard:

```sh
# PreToolUse, matcher: Bash (psql) — and a twin on matcher: .*execute_sql
sql=$(extract the SQL from the tool input)
upper=$(uppercase "$sql")

# Destructive DDL: never via a live connection
echo "$upper" | grep -qE 'DROP +(TABLE|COLUMN|SCHEMA|DATABASE|VIEW|FUNCTION|POLICY|TYPE|INDEX|ROLE)' \
  && deny "Destructive DDL via raw SQL is blocked. Schema changes
           belong in a reviewed migration promoted via CI."

echo "$upper" | grep -qE 'TRUNCATE' \
  && deny "TRUNCATE via raw SQL is blocked. Use a reviewed migration."

echo "$upper" | grep -qE 'DISABLE +ROW +LEVEL +SECURITY' \
  && deny "Disabling RLS via raw SQL is blocked."

# The subtle one: mass mutation. Split on ';' and check that EVERY
# DELETE/UPDATE statement carries its own WHERE clause.
if echo "$upper" | split_on ';' | grep -E 'DELETE FROM|UPDATE ' | any_without 'WHERE'; then
  deny "A DELETE/UPDATE without its own WHERE clause is blocked —
        it could affect every row. Add a WHERE to each statement,
        or use a reviewed migration."
fi
```

The per-statement WHERE check is the piece we'd highlight. A naive version checks whether the *command* contains a WHERE anywhere — which passes `UPDATE a SET x=1 WHERE id=5; DELETE FROM b;` because the first statement's WHERE satisfies the grep. Splitting on semicolons and requiring a WHERE *per mutating statement* closes that gap. It's still a regex, not a SQL parser — it will occasionally false-positive on a WHERE inside a string literal — but per our fail-safe principle below, a rare spurious block is the correct failure mode. The model reads the reason, adds an explicit WHERE (or moves the change into a migration), and proceeds.

Note what's *not* blocked: SELECTs, and scoped single-row mutations with a WHERE. The guard removes the catastrophic tail, not the useful body.

## Guardrail 4: no writes to local CLI state

Our database tooling keeps local CLI state (project refs, connection metadata) in a temp directory inside the repo. It's gitignored and must never be committed or edited — but agents doing broad refactors occasionally "fix" files there. A file-path guard on the write tools ends that class of accident:

```sh
# PreToolUse, matcher: Write|Edit|MultiEdit
path=$(stdin | jq -r '.tool_input.file_path')

if echo "$path" | grep -qE 'db-tooling/\.temp(/|$)'; then
  deny "This directory holds local CLI state and is gitignored.
        Never write here."
fi
```

Trivial, five minutes to write, and it converts a recurring "please don't touch that" into a physical impossibility.

## Guardrail 5: the merge gate

The most consequential hook is the one enforcing our cross-vendor review protocol (chapter 02 covers the protocol in depth). The short version: before any `gh pr merge`, an independent review by a different vendor's model (Codex/GPT) must have issued a SHIP verdict on the PR's *exact head commit SHA*, recorded as an approval file:

```sh
# PreToolUse, matcher: Bash
cmd=$(stdin | jq -r '.tool_input.command')
echo "$cmd" | grep -q 'gh pr merge' || allow

sha=$(resolve the PR's current headRefOid via gh)

if [ ! -f ".claude/codex-approvals/$sha" ]; then
  deny "Merge blocked: no cross-vendor SHIP approval recorded for
        head commit $sha. Run the Codex review of this exact diff;
        on SHIP, record the approval file, then merge. New commits
        invalidate prior approvals — re-review."
fi
```

Keying the approval to the head SHA — not the PR number — is the whole design. Approve-then-push-one-more-commit is the obvious loophole, and the SHA binding closes it: any new commit changes the head, the approval file no longer matches, and the merge is blocked again until the new diff is re-reviewed. The doer never judges its own work, and the gate that enforces it isn't a promise — it's a file-existence check.

## Design principles for guardrail hooks

Four principles emerged from running these in production.

**1. Deny with a reason that teaches the correct path.** The denial message is prompt engineering delivered at the exact moment it's needed. "Blocked" alone leaves the model to guess and retry variants. "Blocked — deploys go through CI/CD; push to dev instead" gets the correct behavior on the next tool call, with no human in the loop. Every one of our reasons names both the *why* and the *instead*.

**2. Fail safe.** A hook that errors, times out, or hits an input it can't parse should block, not allow. Our SQL guard occasionally false-positives on odd meta-commands; we accept that. The asymmetry is total: a spurious block costs the model one rephrase, while a spurious allow could drop a production table. When in doubt, deny — the human escape hatch (below) bounds the cost.

**3. Scope precisely.** Guardrails that overreach get worked around, resented, or disabled — by humans. The push guard applies only to the protected monorepo and explicitly lets commands targeting other repos pass. The SQL guard blocks mass mutation, not reads or scoped writes. The WHERE check is per-statement, not per-command. Precision is what lets a guard stay on forever.

**4. Always leave the human an escape hatch.** Every hook constrains the *agent's* tool calls; none constrains the owner's terminal. The denial messages say so explicitly ("if genuinely intended, the user runs it manually"). This matters for legitimacy: the guardrail encodes "this action requires a human decision," not "this action is forbidden." Emergencies remain possible — they just can't be initiated autonomously.

One more operational note: hooks are configuration, so they deserve the same review discipline as code. A regex with a gap is a guardrail with a hole, and you won't find the hole until the day it matters. We adversarially test new hooks with the bypass attempts we can think of (the multi-statement SQL trick above was found exactly this way) before trusting them.

## Layering: the hierarchy of trust

Hooks don't replace instructions; they anchor them. We run three layers, ordered by enforcement strength:

| Layer | Mechanism | Reliability | Example |
|---|---|---|---|
| **Hard walls** | PreToolUse hooks | Deterministic — enforced in code | Push to prod denied; unscoped DELETE denied; merge without cross-vendor approval denied |
| **Norms** | CLAUDE.md rules | Probabilistic — followed with high but imperfect fidelity | "Verify real data before coding"; "surgical changes only"; API validation before wire changes |
| **Hard stops** | Ask-first conventions | Judgment — the model pauses and asks | Promoting dev → sandbox → prod; moving real money; irreversible data operations |

The layers back each other up. The hard-stop convention says "ask before promoting to prod"; if the model ever forgets, the push hook catches the action anyway. The CLAUDE.md rule explains *why* deploys go through CI; the hook makes the local-script shortcut impossible regardless of whether the explanation survived context compaction. Norms shape the 99% of behavior hooks never see; hooks make the remaining 1% survivable.

The mental model we'd offer anyone adopting agentic development on systems that matter: **write your postmortem categories first.** For each "the agent did X and we couldn't undo it" scenario you can imagine — pushed to prod, dropped a table, merged unreviewed code, deployed around the pipeline — decide whether a prompt failure rate is acceptable. Where it isn't, spend the thirty minutes to write the hook. It is the cheapest insurance in this entire methodology.

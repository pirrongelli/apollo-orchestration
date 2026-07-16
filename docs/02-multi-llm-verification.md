# Multi-LLM Verification: The Doer Never Judges Its Own Work

Every pull request on our platform — a regulated Banking-as-a-Service platform run by a solo founder and an AI engineering team — must pass an independent review by a *different model vendor* before it can merge. The reviewer is OpenAI Codex (GPT via the Codex CLI); the author is Claude. The verdict is enforced by a deterministic hook, not by anyone's good intentions.

This chapter explains the rule, the enforcement mechanism, why cross-vendor matters, and how the same principle shows up inside our engineering loops as a dedicated verifier agent.

## The rule

Our project instructions open with this, as Rule #1, before anything about architecture or style:

> **Independent Codex verification before every merge**: the doer never judges its own work. Before ANY `gh pr merge` (dev, main, or prod), run a Codex review of the exact PR diff with a skeptical SHIP/BLOCK prompt. On a SHIP verdict, record it to `.claude/codex-approvals/<headRefOid>` (the PR's exact head SHA).
>
> "Urgent production issue" is exactly when this matters most, not a reason to skip it.

Three properties make this more than a code-review checkbox:

1. **Different vendor, not just different session.** The review runs through the Codex CLI against a GPT-family model. Asking a second Claude instance to review the first Claude's work is better than nothing, but the two share training lineage — and therefore blind spots. A different model family fails differently, which is the whole point.
2. **The exact diff, not a description.** The reviewer gets the PR's actual diff, not the author's summary of it. Summaries are where bugs hide; the author will honestly summarize what they *intended* to write.
3. **A skeptical prompt with a binary verdict.** The review prompt asks for SHIP or BLOCK, framed adversarially: assume the diff contains a bug and try to find it. Open-ended "any thoughts?" prompts produce polite nitpicks. Binary verdicts with an adversarial frame produce findings.

## Enforcement is deterministic, not trust-based

A rule that depends on the agent remembering to follow it is a suggestion. An LLM under pressure — long context, an "urgent" fix, a user who seems impatient — will rationalize skipping a step. So the merge gate is enforced by machinery the agent cannot talk its way past.

The mechanism has two halves:

**1. Per-SHA approval files.** When Codex returns a SHIP verdict, the orchestrating agent records it as a file named after the PR's exact head commit SHA:

```
.claude/codex-approvals/3f6c9a1e07b2d84c5a90e1f2b6d47c83a1e5f0d9
.claude/codex-approvals/b81d4e2a9c05f7361e8b2a4d0c9f5e7183a6d2c4
```

Keying the approval to the head SHA (GitHub's `headRefOid`) is the load-bearing detail. An approval is not "this PR looks fine" — it is "this exact tree, at this exact commit, was reviewed and shipped." **Push one more commit and the approval is automatically stale**, because the new head SHA has no file. Re-review, re-record. There is no way to sneak an unreviewed change under an old approval.

**2. A PreToolUse hook that blocks the merge.** Claude Code lets you register hooks that intercept tool calls before they execute. A `PreToolUse` hook on the Bash tool inspects every command; if it is a `gh pr merge`, the hook resolves the PR's current head SHA and checks for the matching approval file. No file, no merge — the hook returns a deny decision and the tool call never runs.

Adapted (generic identifiers, simplified for readability) from our project hook configuration:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "cmd=$(jq -r '.tool_input.command // empty'); echo \"$cmd\" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge' || exit 0; pr=$(echo \"$cmd\" | grep -oE '[0-9]+' | head -1); sha=$(gh pr view \"$pr\" --json headRefOid -q .headRefOid); if [ -f \".claude/codex-approvals/$sha\" ]; then exit 0; fi; jq -n --arg sha \"$sha\" '{hookSpecificOutput:{hookEventName:\"PreToolUse\",permissionDecision:\"deny\",permissionDecisionReason:(\"Merge blocked: no independent Codex SHIP approval recorded for head SHA \" + $sha + \". Run the cross-vendor review of the exact PR diff, record the verdict to .claude/codex-approvals/<sha>, then retry. New commits invalidate prior approvals.\")}}'",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

The deny message is written for the agent that will read it: it says exactly what is missing and how to satisfy the gate. Good hooks are error messages for AI teammates.

Note what this design does *not* rely on: the agent's memory, the agent's honesty, the founder being awake to check. The gate is a file-existence check keyed to a commit hash. It is boring, and boring is the point.

### Why not just trust the instructions file?

We tried. Instructions files (CLAUDE.md) shape behavior powerfully, but they are probabilistic — the model *usually* follows them. For a platform that moves real money, "usually" is not a control. The pattern we converged on:

- **Instructions** state the rule and the reasoning (so the agent cooperates intelligently).
- **Hooks** enforce the subset that must never be skipped (so cooperation is not required).

The same layering guards our other hard stops — pushes to the production branch, destructive SQL, out-of-band deploys — each with its own PreToolUse deny hook. Rule in prose, gate in code.

## Zero wall-clock cost: run it in parallel with CI

The obvious objection is speed: an extra review on every merge sounds like friction. In practice it costs no wall-clock time, because the Codex review is launched the moment the PR opens and runs concurrently with CI:

```
PR opened
├── CI: lint → unit tests → build → deploy checks   (~8–15 min)
└── Codex: review exact diff, SHIP/BLOCK verdict     (~2–5 min)
        ↓
both green → record approval file → gh pr merge passes the hook
```

CI is almost always the long pole. By the time the pipeline is green, the verdict has been sitting there for minutes. Our project rule states this explicitly: run the Codex review in parallel with CI so it costs no wall-clock.

The only time the review adds latency is when it returns BLOCK — which is precisely the case where you *want* latency.

## Why cross-vendor: different families, different failure classes

Self-review by the authoring model has a structural flaw: the reviewer reconstructs the author's reasoning and finds it convincing, because it *is* its own reasoning. If the author misread an API contract, the same-family reviewer plausibly misreads it the same way. Review within one model family catches typos and obvious slips; it is weak against shared misconceptions.

A different vendor's model was trained on different data mixtures, with different RLHF preferences and different characteristic biases. It reads the diff cold, with no investment in the approach. In our experience the two families disagree in useful ways: one is more suspicious of concurrency and idempotency gaps, the other of type-level and contract mismatches. The union of their blind spots is smaller than either alone.

This is not theoretical for us. The independent reviewer has returned BLOCK verdicts on diffs that Claude — and CI — had passed, including genuine money-path bugs: a mutation path that would have double-executed a financial operation under a retried request, and a guard that silently dropped a status transition. Each was caught *before merge*, on the exact diff, by a model that had no stake in the code being good. A single catch of that class pays for years of review-token spend.

The general principle: **redundancy only helps when the redundant channels fail independently.** Two reviews from the same model family are correlated channels. Cross-vendor review is the cheapest way we know to buy genuinely independent failure modes.

## The verifier agent: the same principle inside the loop

Merge gating is the outermost checkpoint. The same "doer never judges its own work" principle runs *inside* our engineering loops, where a plan→execute→verify cycle iterates until done. The VERIFY stage is a dedicated in-repo agent — we call it `loop-verifier` — whose definition opens with its identity:

> You are the independent VERIFY stage of an engineering loop. You did NOT write the work you are judging. Be skeptical; a false PASS is worse than a false FAIL.

Its protocol combines mechanical gates with an independent cross-vendor verdict:

1. **Run the mechanical gates** declared for the loop: scoped test coverage thresholds, full suite pass, lint clean.
2. **Obtain the Codex verdict** on the work itself — and relay it *verbatim*, never softened:

```bash
codex exec --sandbox read-only --cd "<worktree>" \
  "Review <test-file> against <source>. Do these tests assert real
   observable behavior, or merely execute lines to inflate coverage
   (trivial assertions, over-mocked tautologies)? List padding tests
   by name. End with: VERDICT: PASS or VERDICT: FAIL"
```

3. **PASS requires ALL gates green**: threshold met, suite green, lint clean, *and* Codex VERDICT: PASS. Any single red gate fails the round.
4. **On FAIL, write actionable feedback** — file, test name, exact deficiency — specific enough that the executor agent can fix it without guessing. The feedback goes back to the *same* executor (which keeps its implementation context), and the loop iterates. The verifier's verdict, not the executor's self-assessment, decides whether the loop iterates or exits.

Two design details worth stealing:

- **The verifier never edits files.** It judges; it does not fix. The moment a verifier starts patching the work, it becomes a co-author and loses its independence.
- **The Codex prompt targets a known failure mode of the doer.** Coverage-driven loops tempt any model into padding tests — assertions that execute lines without pinning behavior. Asking a different vendor specifically "are these tests real, or coverage theater? List padding tests by name" turns the reviewer into a targeted adversary rather than a generic critic. Write your review prompts against the failure classes your doer actually exhibits.
- **"Relayed verbatim — never soften it."** An orchestrating agent summarizing a harsh review will instinctively round it toward politeness. Verbatim relay preserves the signal.

There is also an economy rule: spawn the verifier agent only when verification is itself substantial work. For a simple loop round, the orchestrator runs the gate commands and the `codex exec` call directly. Independence comes from *who renders the verdict* (a different vendor, on the actual artifacts), not from ceremony.

## Urgency is not an exemption

The most dangerous moment for any control is the production incident. Everything screams "ship it now" — and that is exactly when the author is most stressed, the diff least examined, and a second bug most likely to ride along with the fix. Our rule addresses this head-on:

> "Urgent production issue" is exactly when this matters most, not a reason to skip it.

Because the review runs in parallel with CI, honoring the gate during an incident costs approximately nothing: the hotfix PR's CI has to run anyway, and the verdict lands first. And because enforcement is a hook, the agent could not skip it even if it rationalized that it should. The founder can override — invoking a command manually, outside the agent's toolchain, is always available to the human — but the *AI team* has no urgency escape hatch. That asymmetry is deliberate: humans get judgment, agents get gates.

## Hardening the gate: rules over vibes

A skeptical SHIP/BLOCK prompt is a big improvement over "any thoughts?" — but
it is still, underneath, open-ended LLM-as-judge: one model forming a holistic
opinion about another model's diff. Anthropic's own guidance on evaluating
model outputs rates bare LLM-as-judge as generally not a very robust method on
its own — it drifts, it is inconsistent across runs, and a BLOCK verdict comes
with no way to tell *why* short of re-reading the whole diff yourself.

We hardened ours by replacing the open-ended prompt with a fixed, numbered
rubric: a short list of concrete rules the diff must satisfy, plus a mandatory
verdict grammar. The reviewer no longer forms a free-floating opinion — it
checks the diff against R1, R2, R3, … and reports which ones failed:

```
VERDICT: BLOCK
RULES FAILED:
- R2: withdrawal handler has no idempotency guard; duplicate POST double-debits — payments.ts:114
- R9: new `queue_jobs` table is written by a cron worker but never added to the realtime publication — 20260714_add_queue_jobs.sql
```

The genericized rubric lives in
[`examples/codex-review-rubric.md`](../examples/codex-review-rubric.md). Ten
rules, each aimed at a failure class we have actually hit in production: scope
creep, money-move idempotency, multi-tenant data leaks, auth-pattern mixing,
dedup guards that drop status changes, leaked external IDs, coverage-theater
tests, swallowed errors, tables that go stale without a live-update path, and
non-idempotent migrations.

Two things this buys over the open-ended prompt:

- **Auditable verdicts.** Every BLOCK cites a rule number, a one-line reason,
  and a `file:line`. You can grep past reviews for which rule fires most often
  — that is a map of where your own agent's blind spots actually are, not a
  guess.
- **Consistency across runs.** A rules-based check is far more reproducible
  than "does this diff look okay to you." The same diff against the same
  rubric should not flip between SHIP and BLOCK depending on model mood.

This does not replace judgment entirely — R1 ("does every line trace to the
goal") and R7 ("is this test real or theater") still require the reviewer to
reason about intent, not just pattern-match. The rubric narrows *what* it must
reason about, which is where explicit rules with failure explanations earn
their keep over a bare verdict.

## Adopting this pattern

A minimal version, in an afternoon:

1. **Install a second-vendor CLI** (Codex CLI, or any model runner from a different family than your primary agent) and give it read-only sandbox access to the repo.
2. **Write the skeptical prompt once.** Feed it the exact PR diff. Demand a binary SHIP/BLOCK (or PASS/FAIL) verdict at the end. Frame it adversarially and aim it at your doer's known weaknesses.
3. **Record approvals keyed to the head commit SHA** in a directory like `.claude/codex-approvals/`. Never key them to a PR number or branch name — those survive new commits; SHAs do not.
4. **Add a PreToolUse hook** that denies `gh pr merge` (and any equivalent) unless the approval file for the PR's current head SHA exists. Make the deny message instructive.
5. **Launch the review when the PR opens**, concurrent with CI, so the gate is free.
6. **Extend inward when you add loops**: give the verify stage its own agent that runs mechanical gates plus the cross-vendor verdict, never edits files, and relays the verdict verbatim.

The one-line summary we would put on a wall: *the model that wrote the diff has already convinced itself the diff is correct — that opinion is worth exactly nothing at the merge gate.* Buy an opinion from a stranger, and make the merge button check for the receipt.

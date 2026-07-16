# Codex Review Rubric (SHIP/BLOCK)

A generic, rules-based rubric for the cross-vendor merge gate described in
[`docs/02-multi-llm-verification.md`](../docs/02-multi-llm-verification.md).
It replaces an open-ended "any thoughts?" review prompt with a fixed list of
numbered rules and a mandatory verdict grammar, so every verdict is auditable
against a specific rule rather than a vibe.

**How to invoke it:**

```bash
gh pr diff <n> | codex exec --sandbox read-only \
  "Review against every rule in codex-review-rubric.md. Diff follows on stdin."
```

**Large-diff caveat:** piping a big diff through stdin can overflow the CLI's
~1MB stdin limit and the command will silently fail or truncate. If the piped
invocation fails, drop the pipe and have Codex pull the diff itself inside its
own sandbox instead of relying on stdin:

```bash
codex exec --sandbox read-only --cd "<repo-or-worktree>" \
  "Run 'gh pr diff <n>' (or 'git diff <base>...<head>') yourself, then review
   the result against every rule in codex-review-rubric.md."
```

---

Review the diff against each numbered rule below. Verdict format is
mandatory: `VERDICT: SHIP` or `VERDICT: BLOCK`, then `RULES FAILED:` listing
each failed rule number with a one-line reason and a `file:line` reference.
If no rule fails but you have non-blocking observations, list them under
`NOTES:` — notes never block a SHIP verdict.

R1  **Scope.** Every changed line traces to the PR's stated goal. Unrelated
    refactors, drive-by cleanups, or formatting churn that the goal did not
    ask for = BLOCK.

R2  **Money-move idempotency.** Any new or changed call that debits, credits,
    transfers, or otherwise mutates a financial balance has an idempotency
    guard (an idempotency-key header handled server-side, or a reserve-before-
    call pattern) and stays safe under duplicate delivery or client retry.

R3  **Multi-tenancy / RLS.** New tables have row-level security enabled with
    explicit policies; new queries cannot read another tenant's rows;
    membership checks go through the canonical helper for "does this user
    belong to this account," not a raw role-table query that could miss an
    owner or grant cross-tenant access.

R4  **Auth pattern purity.** API-key-authenticated endpoints and
    session-JWT-authenticated endpoints are not mixed on the same code path;
    no secret, signing key, or credential ever reaches a client-readable
    response.

R5  **Dedup / status guards.** Any "already exists → skip" guard also
    compares the incoming status against the stored status before skipping;
    a later event with a different status must update, not be dropped.
    Terminal statuses cannot silently regress to a non-terminal one.

R6  **External-ID exposure.** Customer-facing payloads (API responses,
    webhook bodies, UI) expose only the platform's own internal identifiers,
    never a downstream provider's internal ID.

R7  **Tests assert behavior.** New or changed tests would actually fail if
    the feature broke — not tests that execute lines while asserting nothing
    meaningful (mock-echo tests, trivial tautologies). A bug fix ships with a
    test that reproduces the bug before the fix and passes after.

R8  **Error-path handling.** Three-way handling is present wherever an
    external call is made: success, transport-level failure, and
    application-level error are each handled explicitly — no silent
    catch-and-swallow. Any API whose "no rows" case can also return an error
    (not just `null`) has that error checked before the result is used.

R9  **Realtime / live-update.** Any user-visible table written by a webhook,
    cron job, or background worker has an explicit live-update answer:
    either it is added to the realtime publication with a subscribing hook
    that invalidates the right queries, or it uses polling with a stated,
    justified interval. A table with neither leaves the screen stale until
    a manual refresh.

R10 **Idempotent migrations.** Migrations can be re-run safely (e.g.
    `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE INDEX IF NOT
    EXISTS`). No destructive statement (`DROP TABLE`, unconditional `DELETE`,
    irreversible data loss) appears outside a migration explicitly scoped
    and approved for that purpose.

# Historical guardrail examples

**Apollo 2.0 notice:** marker-only approval is nonconforming. The old writer is
retired (exit 2, no writes), and the old merge-gate entry point is a refusal
placeholder. Do not install either as an approval mechanism. The settings
fragment omits the marker check and consequently supplies **no review admission
control**. See [the structured contract](../fleet/README.md) and
[the normative standard](../../docs/12-apollo-2-standard.md) for integration
requirements and limits. Local hooks cannot enforce actions outside their harness.

The descriptions below are historical explanations, not current installation
instructions for merge admission. Claims of different-vendor necessity,
production-grade marker admission, or impossibility of stale approval reuse
are superseded. Other examples need project-specific adaptation and testing.

## Files

- `settings.hooks.json` — a valid `"hooks"` fragment for `.claude/settings.json`
- `record-approval.sh` — retired refusal stub: no marker writes, exit 2
- `merge-gate.sh` — retired deny placeholder, exit 2; do not install it as
  review admission
- `session-status.sh` — a SessionStart hook that surfaces in-flight loops
  and plans so a restarted session has initiative, not just state

## How PreToolUse hooks work

Every time Claude Code is about to run a tool, it checks the `PreToolUse`
hooks in `.claude/settings.json` (project) or `~/.claude/settings.json`
(user-global):

1. **Matcher**: each entry has a `matcher` — a regex against the *tool name*
   (`Bash`, `Write|Edit|MultiEdit`, `.*execute_sql` for MCP tools).
2. **Input**: each matching hook's `command` runs as a shell one-liner and
   receives the full tool call as JSON on **stdin**. Pull fields out with
   `jq`: `jq -r '.tool_input.command'` for Bash, `.tool_input.file_path`
   for Write/Edit, `.tool_input.query // .tool_input.sql` for SQL MCP tools.
3. **Decision**: to block the call, print a JSON object to stdout:

   ```json
   {"hookSpecificOutput": {"hookEventName": "PreToolUse",
     "permissionDecision": "deny",
     "permissionDecisionReason": "why, and what to do instead"}}
   ```

   To allow, print nothing and `exit 0`. The
   `permissionDecisionReason` is fed back to the model — it is not just an
   error, it is a *teaching message* the agent reads and acts on.

Merge the `"hooks"` object from `settings.hooks.json` into your project's
`.claude/settings.json` (top-level key alongside `permissions` etc.).

## Design principles

- **Deny with a teaching reason.** The reason string tells the model what
  rule it hit and what the correct path is ("push a feature branch and open
  a PR", "use a reviewed migration"). A good reason turns a blocked call
  into a corrected plan instead of a retry loop.
- **Fail-safe in the right direction.** Most guardrails only fire on a
  positive match and `exit 0` otherwise, so a hook bug never bricks normal
  work. The merge gate is the exception: it *fails closed* — if the head
  SHA cannot be resolved, the merge is denied. Blocking a legitimate merge
  costs minutes; letting an unreviewed merge through costs a production
  incident.
- **Precise scoping.** Match the narrowest pattern that captures the risk:
  specific branch names, specific script names, per-statement SQL checks.
  Over-broad hooks train everyone (human and model) to see denials as noise.
- **Human escape hatch.** Hooks only gate the *agent's* tool calls. The
  human can always run the same command manually in a terminal. Guardrails
  constrain the AI, not the owner — every deny reason says so explicitly.
- **Deterministic, not probabilistic.** A hook is ~20 lines of bash + jq.
  It fires 100% of the time, unlike an instruction competing for attention
  in a long context.

## The five guardrails

### 1. Protected-branch push block (`Bash`)

Blocks `git push <remote> main|prod` (and `HEAD:main` style refspecs match
too, since the branch name is the last token). One subtlety: if the command
`cd`s into a *different* repo than `my-app`, the hook allows it — the
guardrail protects this project's release branches, not every repo on the
machine. Adapt the branch names and the repo-name regex to your setup.
Rationale: CI/CD deploys on push, so pushing a protected branch *is* a
deploy, and deploys are a human decision.

### 2. Local deploy-script block (`Bash`)

Blocks `npm run deploy:*` and direct `supabase db push` / `supabase
migration up`. The canonical deploy path is "push the branch, CI deploys".
Local deploy scripts exist as an emergency escape hatch and are reserved
for the human. Without this hook, an agent under time pressure will
"helpfully" deploy straight from the laptop, bypassing the pipeline's
checks.

### 3. Destructive-SQL block (`Bash` + `.*execute_sql`)

Two hooks, same policy, both routes covered: SQL via a `psql` shell command
and SQL via any MCP tool whose name ends in `execute_sql`. Blocked outright:
`DROP <object>`, `TRUNCATE`, `DISABLE ROW LEVEL SECURITY`. Additionally,
statements are split on `;` and any `DELETE FROM` / `UPDATE` **without its
own `WHERE` clause** is denied — a `WHERE` in statement one must not bless
an unqualified delete in statement two. Everything destructive belongs in a
reviewed migration deployed via CI. Covering only the shell route is a
half-measure: the agent will just reach for the MCP tool instead.

### 4. Local-CLI-state write block (`Write|Edit|MultiEdit`)

Denies file writes into directories that hold local CLI state (the example
uses `supabase/.temp/`; add your own — `.terraform/`, `.vercel/`, etc.).
These dirs are tool-managed and gitignored; agent edits there get clobbered
or accidentally committed. Cheap hook, eliminates a whole class of noise.

### 5. Retired marker-only review flow (historical)

The historical flow treated a per-head marker as independent approval. That
flow is superseded: `record-approval.sh` records nothing and refuses with exit 2.
A marker's existence cannot prove an independent review, original report,
exact diff base or current gate results. A second vendor is optional project
policy; independent contexts and author exclusions remain required.

Current adoption needs protected structured records and original exact-head/base
reports, required reviewer counts and authentic applicable gate receipts. See
[the local contract](../fleet/README.md) for its tested predicates and limits.
Do not run the retired writer to authorize a merge.

### 6. Retired standalone entry point (`merge-gate.sh`)

This file is a refusal placeholder, not the historical command parser or an
installable admission integration. It emits a fixed deny response when output
can be written and exits 2, including failed writes and closed-reader pipes.
An arbitrary marker never unblocks it. The settings fragment supplies no review
admission control; do not wire this stub in expecting approved merges to pass.

A real integrator must authenticate protected records and original reports,
observe current repository/head/base and required CI, pin the reviewed head,
and retain the actual merge receipt. Adversarially test that project-specific
forge adapter before use. This repository does not ship such a live adapter.

### 7. Session-start awareness (`session-status.sh`)

A `SessionStart` hook — runs once when a session begins, before the first
message — that reads two durable-state files and, if either shows
unfinished work, injects a short summary as additional context:

- A **loop/campaign vision file** (example path: `docs/loops/VISION.md`),
  one heading per loop. Only headings that carry an ID (`L7`, `HK`, `B1`) are
  treated as loops; a plain prose heading like "Remaining backlog" is not
  one. A loop is active if its `STATUS:` is anything other than `CLOSED`, or
  if it has no `STATUS:` line at all — a freshly opened loop where the field
  was simply never filled in gets surfaced, not silently skipped.
- A **plan-progress ledger** (example path: `.progress/ledger.md`) with
  checklist-style lines (`- [ ]` / `- [x]`). Any unchecked line means a plan
  is mid-execution; the hook reports how many tasks are done vs. pending and
  names the plan so it can be reopened.

Output is capped (at most 5 loops listed) so session start never floods the
first turn. The hook does no writes, no network calls, and exits silently
both when there's nothing to report and when it isn't run inside a git repo.

The lesson behind it: durable state on disk is not the same thing as an
agent that remembers. Twice, a session restarted in the middle of a
multi-step campaign and nothing in the conversation prompted it to check
whether one was already running — the campaign was only picked back up
because a human happened to think to look. State plus a hook that reads the
state at the right moment turns "the information exists somewhere" into
"the agent's first message accounts for it."

We deliberately do **not** auto-resume from this hook — it surfaces
in-flight work as context for the next message, it does not itself take
action. Auto-resuming means the agent's first act in a fresh session is a
commit-affecting decision made before a human has seen anything; on a
codebase where mistakes cost real money, awareness plus a human or
orchestrator decision is the safer default. If your project's risk profile
is different, auto-resume is a reasonable next step — just make it a
deliberate choice, not a default a hook backs into.

### 8. Pre-PR test gate (`pr-gate.sh` + `preflight.sh`)

The same per-SHA-evidence design as the merge gate, moved one step earlier
in the pipeline: `gh pr create` is denied unless
`.claude/test-evidence/<HEAD sha>` exists, and the only writer of that file
is `preflight.sh` finishing green. A new commit changes the SHA, so stale
evidence can never cover a newer diff — invalidation comes free from the
naming, exactly like per-SHA review approvals.

Two decisions worth copying:

- **The hook checks; the script runs.** Never run test suites inside a
  hook — hooks have short timeouts and no TTY, and a suite can take
  minutes. Splitting checker from writer also gives the rule its shape:
  the gate is cheap and always on, the expensive part runs exactly once,
  when it matters.
- **Path-gate the preflight or it will be bypassed.** The realistic
  failure mode of "run everything before every PR" is not disobedience,
  it's cost: a full suite on a docs-only change trains everyone to reach
  for the escape hatch. Matching each suite against the merge-base diff
  (frontend globs → unit + e2e, backend globs → backend suite; a docs-only
  diff runs nothing and still records evidence) keeps the wall cheap
  enough that going around it is never worth it. During development you
  run targeted tests; the full relevant suites run once, right before
  the PR.

A test-suite trap the independent review caught in our own version: when a
hook's "allow" is silence (exit 0, no output), a deny assertion built on
`jq -e` alone is vacuous — **`jq -e` on empty input exits 0**, so an allow
scores as a deny-pass and the suite stays green with the gate deleted.
Guard with `[ -n "$out" ] &&` before the jq check, then prove the teeth by
mutation: remove the gate line, watch the deny cases go red, revert.

The companion policy that makes this more than bookkeeping: if the
preflight surfaces broken tests **unrelated** to your change, fix them
anyway (in their own commit, so the reviewer can trace them). Red suites
rot fastest when everyone scopes pre-existing breakage out of their own
PR — that is precisely how a test suite accumulates dozens of silent
failures while CI stays green.

## Testing a hook without triggering it

Feed it fake stdin:

```bash
echo '{"tool_input":{"command":"git push origin prod"}}' | \
  bash -c '<paste the hook command here>'
```

A deny prints the JSON decision; an allow prints nothing. Do this for both
the should-block and should-pass cases before trusting a new guardrail.

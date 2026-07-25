# Guardrail Hooks — copy-pasteable examples

Genericized versions of the PreToolUse guardrails we run in production on a
regulated Banking-as-a-Service platform. They are the deterministic layer
described in [docs/05-hooks-guardrails.md](../../docs/05-hooks-guardrails.md):
prompts and CLAUDE.md rules are advice the model can forget under pressure;
hooks are shell code the harness always executes.

## Files

- `settings.hooks.json` — a valid `"hooks"` fragment for `.claude/settings.json`
- `record-approval.sh` — helper that records an independent-review approval
  for the merge gate
- `merge-gate.sh` — standalone, hardened version of the merge gate: broad
  bypass-resistant detection, a canonical command form, and fail-closed
  checks throughout
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

### 5. Cross-vendor merge gate (`Bash`)

The keystone: **the doer never judges its own work.** `gh pr merge` is
denied unless an approval file named for the PR's **exact head SHA** exists
under `.claude/reviews/`. The workflow:

1. PR ready → an independent reviewer (a *different model vendor* than the
   author) reviews the exact diff with a skeptical SHIP/BLOCK prompt.
2. On SHIP → `./record-approval.sh <pr-number>` resolves the head SHA via
   `gh pr view --json headRefOid` and writes `.claude/reviews/<sha>`.
3. `gh pr merge` now passes the hook.
4. Any new commit changes the head SHA → the approval no longer matches →
   merge blocked again until the new diff is re-reviewed. Approvals are
   per-diff, never per-PR.

Keying on the immutable SHA is what makes this a gate rather than a ritual:
there is no way to reuse an approval for code it did not cover. Run the
independent review in parallel with CI so it costs no wall-clock time.

### 6. Standalone merge gate (`merge-gate.sh`)

The one-liner in `settings.hooks.json` above covers the common case. The
standalone `merge-gate.sh` is the hardened version we actually run, written
up in [docs/02-multi-llm-verification.md](../../docs/02-multi-llm-verification.md).
Wire it in as the `command` for the `Bash` matcher in place of the inline
one-liner (point `settings.json` at the script's path instead of embedding
the logic).

Two lessons shaped it, both from independent review finding gaps the
one-liner missed:

- **Detection has to be broad; the accepted command has to be narrow.**
  A regex cannot enumerate every way a shell can spell `gh pr merge` —
  quoted binaries, command substitution, intra-word quoting that reassembles
  at exec time. So the script normalises the command two different ways to
  *find* a merge attempt broadly, then requires the command to match one
  narrow canonical shape to *pass*. Everything in between — chaining,
  piping, `--repo`/`-R`/`--hostname` selectors, multiline commands that
  present an approved merge on line one and a different merge on line two —
  is denied, never waved through. The one accepted cost is a false positive:
  `echo "gh pr merge 1"` also gets denied. That is the safe direction.
- **A rule that claims enforcement it doesn't have is worse than an admitted
  convention.** Our own project instructions said the merge gate was
  "enforced by a hook" before this script existed — independent review is
  what caught that the hook did not exist yet. We fixed the documentation
  first (so nothing kept relying on a control that wasn't real), then built
  the hook. If you adopt this pattern, check that every "enforced by X" claim
  in your own instructions file has an X you can point to.

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

## Testing a hook without triggering it

Feed it fake stdin:

```bash
echo '{"tool_input":{"command":"git push origin prod"}}' | \
  bash -c '<paste the hook command here>'
```

A deny prints the JSON decision; an allow prints nothing. Do this for both
the should-block and should-pass cases before trusting a new guardrail.

# Path-Scoped Rules — copy-pasteable examples

Genericized versions of the domain rule files we run in production on a
regulated Banking-as-a-Service platform. They solve a problem CLAUDE.md alone
can't: CLAUDE.md loads into every session regardless of what you're touching,
so it either stays short and generic, or grows until it eats context budget
on tasks that have nothing to do with half of what it says. Path-scoped
rules give you a third option — domain-specific detail that only shows up
when it's relevant.

## What they are

A path-scoped rule is a Markdown file under `.claude/rules/` with a small
YAML frontmatter block naming the file globs it applies to:

```markdown
---
paths:
  - "src/hooks/**"
  - "src/pages/customer/**"
---
### Financial Mutations Need Server-Side Idempotency

`useState` is not a mutex. Two rapid clicks can both read `submitting ===
false` before either `setSubmitting(true)` flushes...
```

Claude Code discovers every file under `.claude/rules/*.md` at session
start, reads its `paths:` frontmatter, and keeps the rest of the body
unloaded until it's needed.

## The key behavior: loads on READ, not on mention

This is the part that trips people up, so it's worth stating plainly:

**A rule fires when Claude reads a file matching its glob — not when a
matching path merely appears in the conversation.**

If a rule's `paths:` includes `supabase/functions/**` and the user says "fix
the bug in supabase/functions/payouts/index.ts", the rule does **not** load
from that sentence alone. It loads once Claude actually opens
`supabase/functions/payouts/index.ts` with a Read (or Edit/Write, which read
first). Talking about a path is not touching it.

Practically, this means:

- Rules attached to files Claude never opens this session never cost tokens.
- A rule can still fire "late" — if Claude writes a new file at a matching
  path without reading anything first, make sure your workflow reads (or the
  tool auto-reads) before or immediately after creating it, or point a
  teammate/hook at re-reading it.
- Rules are **not** a substitute for grep-based discovery. If Claude needs to
  find the right file before it knows the rule applies, that lookup happens
  with ordinary tools first; the rule engages once the resulting file is
  opened.

## Glob syntax

Standard glob syntax, matched against the path relative to the repo root:

- `src/hooks/**` — everything under a directory, any depth
- `src/pages/customer/**` — same, scoped to a subtree
- `supabase/migrations/**` — every migration file
- `.github/**` — CI config directory
- Multiple entries in the `paths:` list are OR'd — the rule loads if the
  read file matches *any* of them.

Keep globs as narrow as the rule's actual scope. A rule about serverless
function auth patterns belongs on the functions directory, not on `**`.

## Why this matters

- **CLAUDE.md stays small.** Rules that only matter for one corner of the
  codebase (edge-function auth, CI philosophy, realtime wiring) move out of
  the always-loaded file and into a file that loads only when that corner is
  actually being edited.
- **Context scales with the codebase, not against it.** You can keep adding
  domain rules — frontend patterns, migration gotchas, provider-specific
  quirks — without every unrelated session paying for all of them.
- **Rules travel with the domain, not the session.** A rule about React
  state patterns is equally relevant whether the task started as "fix a
  bug" or "add a feature" — path-scoping means it shows up either way,
  automatically, without the prompt needing to ask for it.

## The `.gitignore` gotcha

Many repos gitignore `.claude/*` wholesale to keep local agent config out of
version control (settings, local permissions, session state). If yours does,
your rules will silently never get committed unless you add a negation:

```gitignore
# AI tool configs (keep local only)
.claude/*
!.claude/rules/
```

Order matters — the negation must come after the broad ignore. Same pattern
applies if you're also tracking `.claude/agents/` or `.claude/skills/`.

## Verify support with a canary before relying on this

Model and harness behavior around auto-loaded context changes over time.
Before building a rule library you depend on, run a quick canary:

1. Create `.claude/rules/canary.md` with a `paths:` glob matching one file
   you're about to touch, and body text like `RULE-CANARY-7f3a: if you can
   see this, path-scoped rules are working.`
2. Ask Claude to read (or edit) the matching file.
3. Ask "did a rule fire when you read that file, and what did it say?" — if
   it repeats the canary string, the mechanism works in your current
   Claude Code version.
4. Delete the canary file.

Don't skip this. A rule that silently never loads is worse than no rule —
it gives false confidence that a constraint is enforced when it isn't.

## Files in this directory

- `money-moves.md` — financial-mutation idempotency (frontend + serverless)
- `realtime.md` — live-update contract for webhook/cron-written tables
- `frontend.md` — React state, dialog rendering, shared-component patterns
- `edge-functions.md` — serverless function auth and response-shape rules
- `ci.md` — CI/CD philosophy and gating discipline

Each is a real, working example — copy it into your own `.claude/rules/`,
adjust the `paths:` globs and the specifics to your stack, and delete what
doesn't apply.

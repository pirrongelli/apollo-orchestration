# Memory System Templates

This directory contains directly usable templates for the persistent memory system described in [docs/06-memory.md](../../docs/06-memory.md). Copy them into your AI's per-project memory directory (e.g. `~/.claude/projects/<project>/memory/`) and replace the invented content with your own facts.

## The architecture in one paragraph

Every fact lives in its own small markdown file with YAML frontmatter — one lesson, one project status, one API gotcha per file. A single always-loaded index, `MEMORY.md`, carries **one line per memory**: a link plus a *hook* (just enough of the fact that a session recognizes when to open the full file). Sessions load only the index; full files are read on demand. The context window is the budget, and the index is what fits in it.

## Files here

| File | What it is |
|---|---|
| `MEMORY.md.template` | The compressed index — copy to `MEMORY.md` and maintain it |
| `feedback_example.md` | A full feedback-memory file (correction / incident lesson) |
| `reference_example.md` | A full reference-memory file (external API fact) |
| `project_example.md` | A full project-memory file (work status across environments) |

## The four memory types

The `type` frontmatter field gives each memory a job:

- **`feedback`** — a correction from the human or a lesson from an incident. The highest-value class: the human's code review, made permanent. Strict internal shape: what happened, **Why:** (the mechanism, so the lesson generalizes beyond the one incident), and **How to apply:** (the concrete rule for next time).
- **`project`** — the state of a piece of ongoing work: what shipped, what's blocked, and crucially *which environment it reached*. On a dev → staging → production pipeline, "done" is three different claims. Always state promotion status explicitly ("shipped to dev, NOT production").
- **`reference`** — externally-sourced facts: validated API enum values, vendor auth traps, response-shape quirks, rate limits. Expensive to discover, true independent of your code.
- **`user`** — durable facts about the human: communication preferences, role, standing decisions (e.g. "the owner is a business owner, not an engineer — make technical calls, escalate money/risk calls").

## Cross-links

Memories link wiki-style with `[[name]]`. Reading one memory surfaces its neighbors — a feedback memory about idempotency links to the reference memory about the vendor's retry semantics. Use the `name` from the target file's frontmatter as the link text.

## File naming

Prefix the filename with the type: `feedback_double_submit_guard.md`, `reference_payvendor_response_envelope.md`, `project_saved_views.md`, `user_communication_style.md`. The prefix makes the index scannable and the directory greppable by class.

## Discipline rules

A memory system without discipline becomes a junk drawer. Hard rules:

1. **Update, don't duplicate.** Before writing a memory, search for an existing one on the same topic. Two memories with slightly different claims about the same subject are worse than none — the AI can't tell which is current.
2. **Delete wrong memories.** A memory proven false is deleted (or corrected) the moment it's discovered, in the same session. Stale facts actively mislead future sessions.
3. **Absolute dates only.** Never "last week" or "recently" — write "2026-03-04". Memories are read months later by sessions with no idea when they were written.
4. **Don't mirror the repo.** If a fact lives in the codebase, CI config, or committed docs, the memory should link to it, not restate it. Memories are for what the repo *can't* record: incidents, human corrections, external-vendor behavior, cross-environment state.
5. **Verify before acting.** An old project memory says a feature is "NOT in production" — check before assuming. Memories decay; the source of truth is the live system. Treat a memory as a strong prior, not a proof.
6. **One fact per file.** If a memory needs an "and also" heading for an unrelated topic, split it.
7. **Keep the index line honest.** When a memory's status changes (shipped, resolved, obsoleted), update its one-liner in `MEMORY.md` in the same session. An index that lies is worse than no index.

## Consolidation passes

Periodically (or when the index feels bloated), run a consolidation pass:

- Merge near-duplicate memories into one.
- Compress resolved project memories to a single closing line, or delete them if the outcome is now in the repo/docs.
- Re-tighten index hooks — each line should still be the shortest string that triggers recognition.
- Prune sections: an index the AI skims past is an index that's failed.

The test for every line: *would a fresh session, seeing only this line, know when to open the file?*

## The promotion pipeline: incident → memory → rule → hook

Not every lesson deserves the same enforcement weight. Lessons climb a ladder:

1. **Incident** — something breaks or the human corrects the AI. Cost: one debugging session or one review round.
2. **Memory** — a `feedback_*` file captures what/why/how-to-apply. Cost of recurrence: the AI must notice the index line and read the file. Works most of the time.
3. **Rule** — if the lesson recurs or the failure is expensive, promote it into the project's instruction file (`CLAUDE.md` or equivalent), which is loaded verbatim every session. Rules are for things the AI must never get wrong, not merely things worth knowing.
4. **Hook** — if even a rule can be missed under pressure, promote it to a mechanical guardrail: a pre-tool-use hook that blocks the dangerous command, a CI check that fails the build. Hooks don't rely on the model reading anything.

Each step up the ladder costs maintenance and context budget, so promote only on evidence: a memory that prevented recurrence stays a memory; a lesson violated *despite* a memory becomes a rule; a rule violated despite being loaded becomes a hook. Demotion is equally valid — a hook made obsolete by an architecture change gets removed, and its story compressed into a reference memory.

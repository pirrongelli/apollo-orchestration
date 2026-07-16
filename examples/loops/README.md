# Long-horizon loops: immutable feature lists + browser-level E2E

This directory holds a working example of an upgrade to the loop pattern
described in [`docs/07-engineering-loops.md`](../../docs/07-engineering-loops.md),
adopted after running loops that spanned many sessions rather than a single
bounded campaign. Long-horizon work exposed two failure modes that the
original discover→plan→execute→verify→iterate loop didn't fully cover.

## The problem

Give an agent a long, open-ended feature list and two things go wrong
reliably:

1. **Premature "done."** Somewhere around session three, the agent starts
   summarizing progress instead of measuring it, and declares a feature
   complete because it *looks* finished, not because it was proven to work.
2. **Silent scope drift.** A feature that was fully specified in session one
   quietly loses a clause by session five — reworded, narrowed, or dropped
   entirely — because nothing prevented the spec itself from being edited by
   the same agent that's being graded against it. The grader and the graded
   become the same party.

Both failures share a root cause: the spec for "what are we building" lived
in the agent's working memory (or a freely-editable file), not in a
tamper-proof artifact outside the agent's ability to rewrite.

## The pattern

**An immutable feature list is the ground truth for a long-horizon loop.**
Concretely:

- **The initializer creates the feature list first**, before any
  implementation work starts. Each entry gets an id, a description, a
  concrete `verify` step, and a `status` of `fail`. See
  [`FEATURES.schema.json`](./FEATURES.schema.json) for the shape.
- **One feature per iteration.** The loop picks the next `fail` entry,
  implements it, proves the `verify` step passes, and flips `status` to
  `pass`. It does not batch three features into one iteration — batching is
  exactly the shortcut that produces "should work" instead of "proven to
  work."
- **The list is append-only for existing entries.** Once an entry exists, its
  `description` and `verify` are frozen. The only field any iteration may
  change on an existing entry is `status`. New entries may still be
  appended — the list grows, it just never revises its own history.
- **A checker enforces the freeze mechanically**, not by agent
  self-discipline. [`check-features-immutable.mjs`](./check-features-immutable.mjs)
  diffs the working-tree feature list against the version committed at git
  `HEAD` and fails the run if any existing `id` was removed or had its
  `description`/`verify` edited. This runs as a gate in the loop's verify
  stage, the same way lint or tests do.

## Why this needs to be tamper-proof, not just documented

A written rule ("don't edit the spec") is not a control — an agent under
iteration-count pressure edits the spec the same way a human under deadline
pressure quietly redefines "done." The checker turns the rule into something
a shell exit code enforces. That's the same principle the rest of the loop
system uses: mechanical gates over honor-system compliance.

The checker is also **fail-closed** on its own trust boundary: if it can't
reach a usable git `HEAD`, or the committed baseline exists but is corrupt or
unreadable, that is treated as a hard error (exit 1) — never silently treated
as "no baseline yet, proceed." A broken environment must not be able to green
a gate that exists specifically to prevent quiet tampering. The only
legitimate "no baseline" case is the feature list not existing in `HEAD` at
all yet (its first commit).

See [`check-features-immutable.test.mjs`](./check-features-immutable.test.mjs)
for the full behavioral contract, including the fail-closed cases, run with:

```bash
node --test examples/loops/check-features-immutable.test.mjs
```

## Mandated browser-level E2E for UI features

The second upgrade: any feature whose `verify` step touches user-visible
behavior must be proven with a real browser driving the actual running
application — not a unit test, not a component test with mocked network
calls, and not "the code looks correct." Agents systematically miss
end-to-end breakage that unit-level tests can't see: a button that calls the
right function but is unreachable behind a broken route, a form that submits
correctly but never re-renders the success state, a modal that closes itself
before the user can act. A `verify` entry like `"click Save, confirm the row
appears in the list without a page reload"` catches these; `"unit tests for
the save handler pass"` does not.

Concretely, `verify` for a UI feature should read like a browser script: navigate
somewhere, interact with something, assert on what actually rendered. For
backend-only features, a `curl` or scripted API call against a real deployed
environment is the equivalent standard — asserting on a real response, not a
mock.

## Files in this directory

| File | Purpose |
|---|---|
| `FEATURES.schema.json` | JSON Schema for the feature-list file: array of `{id, description, verify, status}`. |
| `check-features-immutable.mjs` | Fail-closed checker: working tree vs. committed `HEAD`, enforces the freeze. |
| `check-features-immutable.test.mjs` | `node --test` suite covering every allowed and disallowed edit, plus both fail-closed paths. |

Wire the checker into a loop's verify stage as `node check-features-immutable.mjs path/to/features.json` — non-zero exit blocks the iteration from closing, exactly like a failing lint or test command would.

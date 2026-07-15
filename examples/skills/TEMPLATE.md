---
# name: the skill's identifier. Lowercase, hyphenated, matches the directory name.
name: my-skill-name

# description: THE TRIGGER. This is matched against incoming tasks to decide
# whether the skill loads — write it as a trigger condition, not a summary.
# Formula: one sentence saying what the skill covers, then "Use when ..."
# enumerating the task phrasings that should activate it. Be generous with
# trigger phrasings; be precise about the domain boundary.
description: One sentence of what this skill does. Use when <task type 1>,
  <task type 2>, or <task type 3>.

# argument-hint: shown to the user when invoking manually (/my-skill-name <args>).
# The argument is available in the body as $ARGUMENTS. Omit if the skill takes none.
argument-hint: [what-to-pass]
---

# Skill Title

<!-- One-line restatement of the job, referencing the argument if there is one. -->
Do the thing for: **$ARGUMENTS**

<!-- Optional: a short architecture/context block IF the agent needs a mental
     model before acting. Keep it to a diagram or a few sentences — this is a
     playbook, not documentation. Skip it if the steps stand alone. -->

## Step 1: <First action>

<!-- Each step is one concrete action. Include the exact command or code
     pattern — the point of a skill is to remove decisions, so show the
     opinionated way, not a menu of options. -->

```bash
# exact command here
```

<!-- MANDATORY: every step ends with how to verify it worked. A step without
     a verification is a hope. Verification = a command exit code, an expected
     output, a query result — something binary the agent can check. -->
**Verify**: <command or observable outcome that proves this step succeeded>.

## Step 2: <Second action>

<!-- Continue the pattern: action, exact snippet, verification. Keep steps in
     the order they must be executed. If two steps are independent, say so. -->

**Verify**: ...

## Step 3: <Final action, usually deploy/commit/handoff>

**Verify**: ...

## Gotchas

<!-- The highest-value section. Each entry is a prohibition or a trap learned
     from a REAL failure, stated with its history: what breaks, and what
     happened when it broke. Format:

     - **Never/Always <rule>** — <why; what incident taught this>.

     Rules without history read as style preferences and get ignored under
     pressure. "Never reference the dropped legacy table — it was removed in a
     schema consolidation and any new reference fails at deploy time" survives;
     "prefer the new role functions" does not.

     Add to this section every time this domain bites you. That's how the
     skill earns its keep. -->

- **Never <specific thing>** — <what breaks and when it broke before>.
- **Always <specific thing>** — <failure mode it prevents>.

## When NOT to use this skill

<!-- Explicit boundary. A skill that fires on everything adjacent to its
     domain causes damage. List the neighboring task types that look similar
     but need a different playbook (or none), and where to go instead. -->

- <Adjacent task this skill does NOT cover> — use <other skill / plain judgment> instead.
- <Situation where following these steps would be wrong>.

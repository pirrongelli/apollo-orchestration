# Example Agent Definitions

Genericized, copy-pasteable Claude Code agent definitions, derived from the real
agents running in production on a regulated fintech platform. The
platform-specific details have been stripped; the behavioral rules — which are
where the value lives — are intact.

## What these are

Each `.md` file in this directory is a complete Claude Code **subagent
definition**: YAML frontmatter (name, description with trigger examples,
optional model and memory settings) followed by the agent's system prompt.
They are directly usable — no placeholders to fill in beyond adapting the
generic file paths and commands to your project.

## Installation

Copy the files you want into your project:

```
your-project/
  .claude/
    agents/
      agent-orchestrator.md
      guardian.md
      loop-planner.md
      loop-executor.md
      loop-verifier.md
```

Claude Code automatically discovers agents in `.claude/agents/` at session
start. The frontmatter `description` field is what the main Claude instance
reads when deciding whether to dispatch to an agent — the embedded
trigger examples matter more than the prose. Agents can also live in
`~/.claude/agents/` for user-wide availability; project-level definitions win
on name collisions.

## How the agents relate

Two patterns are represented here:

### 1. Dispatcher + gate (orchestrator, guardian)

- **agent-orchestrator** is a pure dispatcher. It reads conversational
  signals ("I just modified X", "I need a new endpoint for Y") and decides
  which specialized agent(s) to spawn and in what order. It never does the
  work itself. It encodes ordering rules: validate external-API values
  *before* coding, review migrations and run the quality gate *after*
  changes, run compliance checks *last*.
- **guardian** is the quality gate. It runs after every meaningful batch of
  code changes and before every commit: lint, typecheck, build, affected
  tests, and import validation (AI-generated code hallucinates imports; this
  check catches them). Guardian **detects and reports — it never fixes**.
  Keeping detection and repair in separate agents prevents the gate from
  quietly papering over its own findings.

### 2. The engineering loop (planner → executor → verifier)

These three implement one iteration of a plan → execute → verify loop over a
single well-scoped target (e.g. "raise module X to 90% coverage"):

- **loop-planner** produces a plan concrete enough that a cheaper model can
  implement it without making design decisions. It never writes code.
- **loop-executor** implements exactly the plan, within an explicit
  allowed-edit scope (usually one file). It self-checks that its own tests
  pass, but it does **not** judge its own quality.
- **loop-verifier** independently judges the result: it runs the mechanical
  gates (tests, coverage, lint) and obtains a quality verdict from a
  **different model vendor** (OpenAI Codex via `codex exec`) so the doer
  never grades its own homework. On FAIL it produces feedback specific
  enough to act on; the orchestrating session sends that feedback back to
  the executor and iterates.

Hard-won rules baked into these definitions:

- **Verifier never edits files.** The moment the judge can fix things, it
  stops being a judge.
- **Feedback goes to the SAME executor instance** (continued conversation,
  not a fresh spawn), so it keeps its implementation context. **Max 3
  feedback rounds per target** — after that, escalate instead of thrashing.
- **Cross-vendor verification is verbatim.** The verifier relays the Codex
  verdict without softening it. A false PASS is the most expensive outcome.
- **Out-of-scope failures escalate, they don't block.** Pre-existing
  breakage discovered during verification goes to the orchestrator, not
  into the executor's feedback loop.

## Model routing

Route by the shape of the work, not by habit:

| Agent | Model | Why |
|---|---|---|
| agent-orchestrator | strong (Opus-class) | Signal interpretation and sequencing decisions |
| loop-planner | strong (Opus-class) | Design work — the plan absorbs all the hard decisions |
| loop-executor | cheap (Sonnet-class) | Mechanical implementation of an already-made plan |
| loop-verifier | default + external Codex | Gate-running is mechanical; judgment is outsourced cross-vendor |
| guardian | strong (Opus-class) | Import/regression analysis rewards care; adjust down if cost matters |

The planner→executor split is the cost lever: one expensive planning call
produces a plan that a cheap model executes, and the loop can fan out many
cheap executors in parallel under one plan-quality budget.

## Parallel executors: disjoint file ownership

When running multiple loop targets in parallel, each executor gets an
**explicit allowed-edit scope, and the scopes must be disjoint**. Two agents
writing to the same file — even "just adding a test each" — produce silent
overwrites and merge chaos. If targets cannot be given disjoint file sets,
either serialize them or isolate each executor in its own git worktree.
The executor definition enforces its side of this: anything broken outside
its scope gets reported, never fixed.

## Agent memory

These definitions use `memory: project`, which gives each agent a persistent
memory directory under `.claude/agent-memory/<name>/` that survives across
sessions and is shared via version control. Agents record recurring failure
patterns, confirmed conventions, and environment quirks there, so the tenth
run knows what the first run had to discover. Remove the `memory` key if you
don't want this.

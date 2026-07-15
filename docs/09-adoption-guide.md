# Chapter 9 — Adoption Guide: This Methodology in a Week

The previous chapters describe a system that grew over months of production incidents. You do not need months to adopt it — you need a week, taken in the right order. This chapter lays out a staged path where each day's work is independently valuable: stop after Day 2 and you still have something worth having.

The order is deliberate. Norms before structure, walls before autonomy, verification before trust. Do not skip ahead to agents and loops before the constitution and the hooks exist — an autonomous AI without walls is exactly the thing this methodology exists to prevent.

## The week at a glance

| Day | Install | From | You get |
|---|---|---|---|
| 1 | The constitution (CLAUDE.md) | `examples/claude-md/` | A contract: hard stops, a conjunctive done checklist, decision ownership |
| 2 | Guardrail hooks | `examples/hooks/` | Deterministic walls: protected branches and operations the AI cannot cross |
| 3 | Cross-vendor merge gate | `examples/hooks/` + a second-vendor CLI | An independent SHIP/BLOCK verdict on every diff, enforced per commit SHA |
| 4 | Agents (guardian first) | `examples/agents/` | Breakage caught within one edit cycle instead of at commit time |
| 5 | Your first skill | `examples/skills/` | Your last incident encoded as a playbook that fires before the domain work |
| 6 | Memory + index | `examples/memory/` | The incident → memory → rule → hook pipeline; sessions that compound |
| 7 | First supervised loop | everything above | A measured, end-to-end run and a calibrated trust boundary |

Each stage stands alone. If the week gets interrupted, whatever is installed keeps paying for itself.

## Day 1 — The constitution

Start with `examples/claude-md/CLAUDE.md.template`. Copy it into your repo as `CLAUDE.md`, then fill the placeholders. This is the smallest useful unit of the whole methodology: one file that turns "an AI that does things" into "an AI operating under a contract."

Three sections carry most of the value, so spend your time there:

1. **Hard stops.** List the actions the AI may never take autonomously, no matter how obvious they seem. Ours are promotion past the dev branch, anything moving real money, irreversible operations, and changes to global client behavior. Yours will differ, but the shape is the same: these are *blast radius* questions, not difficulty questions. If being wrong is expensive in a way an engineer can't unilaterally accept, it's a hard stop.
2. **The "done means" checklist.** Make it conjunctive and make it checkable by command: lint clean, tests green, build succeeds, *and* the actual job verified with observable evidence — a red→green test, a curl output, a screenshot actually read. Ban "should work" explicitly. This one paragraph eliminates the most common AI failure mode: declaring victory on two out of four criteria.
3. **Decision ownership.** One sentence does the work: *ambiguity about the goal → ask; ambiguity about how → decide.* Technical calls belong to the AI; money, risk, and irreversibility belong to you.

Resist the urge to write everything you can think of. A constitution earns its clauses through incidents (Day 6 covers that pipeline). Start with the hard stops and the done checklist; the rest accumulates.

**Verify Day 1 worked:** give the AI a small real task and read its final report. If it ends with evidence and an explicit handoff ("done, verified, here's the proof — anything past this line needs your OK"), the contract took.

## Day 2 — Walls before autonomy

Instructions shape behavior; they do not guarantee it. A CLAUDE.md rule is probabilistic — the model *usually* follows it. Before granting any real autonomy, install the deterministic layer: the guardrail hooks in `examples/hooks/`.

Copy them into `.claude/hooks/` (or your settings file), then adapt the specifics:

- **Protected branches.** Change the branch names in the push/merge guards to match your layout. If you have one production branch, protect that one; you do not need our three-environment topology to benefit.
- **Protected operations.** The destructive-SQL guard, the direct-deploy guard — keep the ones that map to your stack, delete the ones that don't. A hook you don't understand is a hook you'll disable at the worst moment.
- **Deny messages.** Rewrite each deny message for the agent that will read it: state what was blocked, why, and what the correct path is. Good hooks are error messages for AI teammates.

Then do the step almost everyone skips: **test each hook by asking the AI to violate it.** Literally prompt it: "push this directly to the production branch," "drop that table on the live database." Watch the denial appear. A guardrail you have never seen fire is a guardrail you are trusting on faith — and the whole point of hooks is to remove faith from the equation. This adversarial test takes ten minutes and is the only way to know the walls are real.

After Day 2 you can safely say "finish the job without asking me" — because the actions that must never happen autonomously now *cannot* happen autonomously.

## Day 3 — The verification gate

Now install cross-vendor review: the merge gate and record-approval flow from Chapter 2, using the hook and scripts in `examples/hooks/`.

Prerequisites: a second-vendor CLI. If your primary agent is Claude, the OpenAI Codex CLI is the natural counterpart — any model runner from a *different* family works, but same-family review is a correlated channel and buys much less. Give it read-only sandbox access to the repo.

The flow to wire up:

1. When a PR opens, feed the reviewer the **exact diff** — never a summary — with a skeptical prompt that demands a binary SHIP/BLOCK verdict.
2. On SHIP, record an approval file keyed to the PR's **head commit SHA** (not the PR number, not the branch — those survive new commits; SHAs do not).
3. The PreToolUse hook denies any merge command unless the approval file for the current head SHA exists.

Start **advisory**: run the review on every PR, read the verdicts, but leave the hook uninstalled for the first several PRs. This builds calibration — you learn what your second vendor is good at catching and how often it BLOCKs — without gating your workflow on a prompt you haven't tuned yet. Once the verdicts have earned your trust (for us that took under a week), flip to hook-enforced and never look back. Run the review in parallel with CI so the enforced gate costs no wall-clock time.

Two tuning notes from experience:

- **Aim the prompt at your doer's known weaknesses.** A generic "review this" produces polite nitpicks. "Assume this diff contains a bug; look especially at concurrency, idempotency, and auth boundaries" produces findings.
- **Relay verdicts verbatim.** An orchestrating agent summarizing a harsh review will round it toward politeness. The raw text is the signal.

**Verify Day 3 worked:** with the hook installed, attempt a merge on a PR with no recorded approval and watch the denial name the missing SHA. Then record the approval and watch the same command pass.

## Day 4 — Agents

Copy `examples/agents/` into `.claude/agents/`. Then adopt them in payoff order, which means: **guardian first, everything else later.**

The guardian is a validation agent spawned after every meaningful batch of edits — it runs lint, type checks, build, and the affected tests, and reports what broke. It is the biggest single payoff in the roster because it converts "discover the breakage at commit time" into "discover it within one edit cycle," and it costs nothing to adopt: no workflow change, just a habit of spawning it after changes. Many teams could stop here and keep most of the value.

Add the planner/executor/verifier trio only when you have loop-sized work — a coverage campaign, a large mechanical refactor, anything with many similar targets. The economics (strong model plans, cheap model executes, independent judge verifies) only pay off when the work is big enough to amortize the orchestration. For a one-file fix, a single session with the guardian is the right tool; spinning up a full loop for it is ceremony.

One rule from Chapter 3 to carry over on day one: parallel agents that edit files need **disjoint file ownership**. Two agents writing to the same file will silently clobber each other. Partition first, parallelize second.

**Verify Day 4 worked:** make a small deliberate breakage (rename a function, leave one caller stale), spawn the guardian, and confirm it reports the exact broken reference rather than a vague "something failed."

## Day 5 — Skills

Write your first skill — from your **last incident, not from imagination**. Use the template in `examples/skills/`.

The temptation is to sit down and author the five skills you imagine needing: "database migrations," "API integrations," "testing." Resist it. Speculative skills encode how you *think* the work goes; they are generic, and the model already knows generic. A skill earns its existence by encoding the non-obvious: the gotcha that cost you an afternoon, the provider quirk that isn't in any documentation, the exact sequence that works when the obvious sequence doesn't.

So take the most recent time the AI (or you) did something wrong twice, and write that down as a playbook: the trigger ("use this when working on X"), the steps, the gotchas with the *why* attached. One good skill beats five speculative ones — the speculative ones dilute the model's attention and rot silently, while the incident-born one fires exactly when its scar tissue is relevant.

A useful skill has three parts, in this order:

1. **A trigger** precise enough that the AI knows when to load it ("use when touching X") and when not to.
2. **The steps**, in the sequence that actually works — including the verification at the end.
3. **The gotchas**, each with the *why* attached. "Do Y" without the reason gets rationalized away; "do Y because Z bit us" survives.

Then enforce the loading habit in your CLAUDE.md: the AI checks for a relevant skill *before* working in a domain, not after getting stuck.

**Verify Day 5 worked:** start a fresh session, give it a task in the skill's domain without mentioning the skill, and confirm it loads the skill before touching code.

## Day 6 — Memory

Set up the memory directory and index from `examples/memory/`: a top-level index file with one-line summaries linking to detail files, so any session can load the map cheaply and pull details only when relevant.

More important than the structure is the pipeline it feeds — the **incident → memory → rule → hook** escalation:

1. Something goes wrong (or something surprising turns out true). Write it to a memory detail file while the context is fresh, and add its one-liner to the index.
2. If it recurs or the class of mistake is predictable, promote it to a rule in CLAUDE.md, where every future session sees it.
3. If the consequence of recurrence is unacceptable, promote it to a hook, where recurrence becomes mechanically impossible.

Each level costs more to maintain and enforces more strongly. Most lessons stay at level 1. The ones that graduate to level 3 are the ones you never want to think about again. This pipeline is how the system compounds: without it, every session starts from zero and every incident is available for repetition.

Schedule a periodic consolidation pass (monthly is fine): merge duplicates, delete stale entries, tighten the index. Memory that nobody prunes becomes noise that costs tokens on every session start.

**Verify Day 6 worked:** in a fresh session, ask the AI about the incident you recorded and confirm it answers from the memory file — the lesson survived the context window.

## Day 7 — First supervised loop

Run one real objective end-to-end under the full system: constitution, hooks, verification gate, guardian, whatever skills and memory exist. Pick something genuinely useful but bounded — a real bug with a reproducible symptom, a small feature with a clear acceptance test.

Two disciplines make this a measurement rather than a demo:

- **Measure the baseline first.** Before the loop starts, record the current state with a command: the failing test, the coverage number, the erroring endpoint. "Improved" claims without a baseline are vibes. The loop's exit criterion is the delta against that measured starting point.
- **Let the circuit breaker work.** If the loop hits three failed verify→fix cycles on the same failure, it should stop and report — and your job as supervisor is to *let it*. The reflex to jump in and steer at strike two teaches the system nothing; the reflex to demand a fourth attempt teaches it to thrash. A clean escalation with evidence is a success of the methodology, not a failure of the AI.

Supervise this first run closely — read the intermediate reports, watch the gate fire, check the evidence in the final report against reality. What you are calibrating is not the AI; it is your own trust boundary. After a few supervised loops you will know exactly which classes of work you can hand off with a one-line objective and which still need checkpoints.

**Verify Day 7 worked:** the final report contains the baseline measurement, the after measurement, and evidence of the actual job done — and it ends at the hard-stop line, asking for your OK rather than proceeding past it.

## Minimum viable adoption

If you do only two things, do **Day 1 and Day 2**: the constitution and the guardrail hooks.

That pair is the irreducible core — a contract that defines done and a wall that makes the catastrophic actions impossible. Everything else in this methodology (cross-vendor gates, agents, skills, memory, loops) improves throughput and quality on top of that foundation. Nothing else substitutes for it. An elaborate agent roster with no hooks is a fast car with no brakes; hooks with no constitution is a locked room with no work happening inside.

## What this costs — honestly

Adopt this with open eyes. The costs are real:

- **Token spend.** Cross-vendor review adds a second model's tokens to every PR. Loops multiply sessions. The mitigation is model routing — strong model for planning and judgment, cheap model for mechanical execution — which keeps the marginal cost of parallelism low, but the bill is still higher than a single unsupervised session. Our position: one caught money-path bug pays for years of review tokens. If your bugs don't cost that much, the math changes.
- **Review latency.** The gate is free in wall-clock terms only when it runs in parallel with CI and returns SHIP. Every BLOCK adds a round-trip — which is the gate doing its job, but it *feels* like friction, especially during an incident. You will be tempted to carve an urgency exception. Don't; that's the exact moment the gate matters.
- **Upkeep.** Memory needs consolidation, skills go stale as the codebase moves, hooks need updating when branch layouts or tooling change. Budget a small recurring maintenance effort. An unmaintained rule system is worse than none, because it trains the AI (and you) to ignore rules.

**When not to adopt this:** throwaway prototypes, weekend experiments, non-critical codebases where the worst-case bug costs an apology rather than money. The methodology's overhead is priced for environments where mistakes are expensive — regulated systems, production data, customer funds. If you are exploring an idea that might not exist next month, a plain AI session with no ceremony is the correct engineering choice. Adopt the walls when there is something behind them worth protecting.

## The maturity signal

You will know the system is working not when the AI gets smarter, but when **incidents stop repeating**.

Every team — human or AI — makes novel mistakes; that is the cost of doing new work. What a healthy system refuses to do is make the *same* mistake twice. The first occurrence produces a memory entry; recurrence risk produces a rule; unacceptable recurrence produces a hook. When you look back after a few months and notice that the failures in your incident log are all *new* failures — that the old ones are structurally impossible now — the pipeline is doing its job, and the system is compounding instead of merely running.

That is the whole methodology in one sentence: make every lesson permanent, make every catastrophe impossible, and spend human attention only where judgment is genuinely required.

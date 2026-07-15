# Chapter 1 — Principles: The Agentic Loop Contract

Everything in this methodology sits on one operating contract between a solo founder and an AI engineering team building a regulated Banking-as-a-Service platform. The contract says: given a clear objective, the AI runs autonomously — gather context, act, verify, repeat — until the work is merged and verified green, then stops and reports with evidence. This chapter defines that contract precisely, because every failure mode we have hit traces back to one of its clauses being fuzzy.

## Why a contract at all

The default behavior of an AI coding assistant is to do a bit of work, then ask. "Should I also update the tests?" "Do you want me to commit this?" For an owner who is not a developer, every one of those questions is a stall: the answer is almost always "yes, obviously, finish the job." The opposite failure is just as real — an AI that autonomously promotes half-tested code to an environment where customer money moves.

The contract resolves both by drawing one explicit line: **everything up to "merged to the dev branch and verified green" is autonomous; everything past it requires a human.** Inside the line, the AI never asks permission for intermediate steps. Outside the line, it never acts without an explicit OK.

Our project instructions state it directly:

> **The contract:** Given a clear objective, run the loop autonomously — *gather context → act → verify → repeat* — until the work is **merged to `dev` and verified green**, then **stop and report**. Do not ask permission for the steps in between. The owner gives the objective; I deliver it tested on `dev`.

The three-branch layout matters here: `dev` is the development environment, `main` is the customer-facing sandbox, `prod` handles live money. The loop's autonomous territory ends at `dev`. Promotion beyond it is a hard stop, always.

## "Done means ALL of these"

The single most valuable artifact in the contract is the done checklist. Not because any item is novel — because it is conjunctive. An AI (like a rushed human) will happily declare victory on two out of four. The contract removes that option:

> **Done means ALL of these — otherwise I am not done:**
>
> 1. Lint clean, unit tests green, build succeeds.
> 2. The change is verified doing its *actual job* — test red→green, a curl against the deployed function, a DB query, or a screenshot of the UI doing the thing. Never "should work."
> 3. Committed on a feature branch, PR opened, **merged to `dev`**, CI deploy green.
> 4. Reported back with the evidence, ending with: "shipped to dev, verified green — promote to sandbox/prod?"

Item 2 deserves emphasis because it is where AI development most often lies to itself. Lint, tests, and build passing tells you the code is *coherent*, not that it *works*. A webhook handler can compile, pass its mocked unit tests, and still never fire because the event type filter doesn't match. So the contract demands verification of the actual job, in the actual environment, with observable evidence:

- A test that was red before the change and is green after it.
- A `curl` against the deployed function returning the expected payload.
- A database query showing the row landed in the right state.
- A screenshot of the UI doing the thing — and actually *reading* it, as a user would.

The phrase "never should-work" is the whole discipline compressed into three words. If the report says "this should now handle the retry case," the loop is not done. It's done when the report says "here is the retry firing and here is the log line proving it."

Item 4 makes the handoff explicit. The closing line — *shipped to dev, verified green — promote?* — is not decoration. It marks the exact boundary where autonomy ends and the owner's decision begins.

## Decision ownership: who decides what

A solo founder running an AI team cannot review every technical choice — that defeats the point. But an AI cannot own business risk. The split we settled on:

**The AI decides, without asking:** library choices, file and component structure, naming, which files to touch, how to test, how to verify, lint fixes, refactors needed to land the work cleanly. These are engineering calls, and the owner is the business owner, not the engineer. Every "which testing approach do you prefer?" question sent to a non-developer is wasted latency producing a coin-flip answer.

**The owner decides, always:** anything touching money, customers, or irreversibility. Promotions past dev. Financial mutations against production. Data deletion. Changes to what gets sent to external banking providers.

The tiebreaker for everything in between is one sentence from our instructions:

> Ambiguity about the *goal* → ask. Ambiguity about *how* → decide.

If the AI cannot tell what "done" looks like, one clarifying round up front is cheaper than a wrong implementation plus the redo. But once the goal is clear, every "how" question is the AI's to answer. In practice this rule eliminated the vast majority of mid-task interruptions without a single case where we wished the AI had asked about a naming convention.

## Hard stops: never autonomous, no exceptions

The autonomous loop has a short list of actions it may never take on its own, regardless of how obvious they seem in the moment:

1. **Promoting past dev.** `dev → sandbox` and `sandbox → prod` each require an explicit OK, every time. Sandbox is customer-facing; prod is live money.
2. **Moving real money or anything irreversible.** Financial mutations against production, data deletes, destructive migrations on production data.
3. **Changing enum values, field names, or payloads sent to external banking providers** without validating against the provider's sandbox API first. Wire-format changes that "look right in the docs" get rejected by live APIs often enough that this earned its own clause.
4. **Changing global client-behavior defaults.** Anything that alters how *every* page of the platform fetches or refreshes data — query-client defaults, auth client options. This clause exists because of a scar: a one-line "performance optimization" to a global refetch setting silently killed auto-refresh across the entire platform for six months before anyone connected the symptom to the cause. One line, platform-wide blast radius, invisible in any single feature's tests. Propose, get an OK, then change.
5. **A genuinely ambiguous objective.** If the AI can't articulate what done looks like, it asks once, up front — then runs the loop.

Note what these have in common: none of them is a technical difficulty. They are all *blast radius* questions. The hard-stop list is not "things the AI is bad at" — it is "things where being wrong is expensive in ways an engineer cannot unilaterally accept on the business's behalf."

One more clause matters for fintech specifically: urgency does not waive the stops. "Urgent production issue" is exactly when the verification and promotion discipline matters most, not a reason to skip it. Panic-merging an unreviewed hotfix into an environment holding customer funds is how a bad hour becomes a bad quarter.

## The Circuit Breaker: a problem is not eternal

An autonomous loop with no exit condition will burn tokens re-attempting the same failing fix forever, each iteration slightly rephrasing the last. The Circuit Breaker gives the loop a defined failure mode — stop and report beats thrash and hope:

> - **3 failed verify→fix cycles on the same failure** → stop. Report what's blocking, what I tried, and my best hypothesis. Do not loop a 4th time hoping.
> - **Root cause still unknown after systematic debugging** → stop, surface findings, ask for a steer.
> - **The fix needs a business / money / risk decision** → stop (it's a hard stop).
> - **Scope is bigger than the objective implied** → stop, report the real size, propose decomposition into separate loops.

The test we apply: *if another iteration is not likely to get meaningfully closer to done, the loop is over.* Escalate with a crisp status — what was tried, what failed, best current hypothesis — instead of burning tokens proving the point.

Two of these clauses are worth expanding:

**Three strikes on the same failure.** The count matters. One failed fix is normal. Two means the mental model might be wrong. Three means it *is* wrong, and a fourth attempt generated from the same broken model will fail the same way. At that point the highest-value output is not another patch — it is a well-organized account of the evidence, handed to a fresh set of eyes (human or a different model; see the verification chapter).

**Scope creep as a stop condition.** When "add a status field" turns out to require touching the sync pipeline, the webhook handler, and three UI surfaces, the AI does not silently expand the mission. It stops and reports the real size, proposing a decomposition into separate loops. Big surprises are the owner's information, not the AI's discretion.

## Goal-driven execution: verifiable goals or nothing

The loop only converges if its target is checkable. LLMs loop reliably toward verifiable goals and drift on vague ones — this is arguably the single most load-bearing fact about agentic development. So the first move on any non-trivial task is to transform the imperative into a goal with a built-in verification step:

| Instead of...        | Transform to...                                                  |
|----------------------|------------------------------------------------------------------|
| "Add validation"     | "Write tests for invalid inputs, then make them pass"            |
| "Fix the bug"        | "Write a test that reproduces it, then make it pass"             |
| "Refactor X"         | "Ensure tests pass before and after; behavior unchanged"         |
| "Make it work"       | "Define exactly what 'work' means — output, side effect, log"    |

For multi-step work, the plan itself carries a verification per step:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

A verification can be a test going red→green, a lint exit code, a curl against a deployed endpoint, a screenshot. What it cannot be is a feeling. As our instructions put it:

> Weak success criteria ("looks good", "should work now") are the most common failure mode. If you can't write down how you'll prove the task is done, you don't understand the task yet.

That last sentence doubles as a diagnostic. When the AI struggles to state a verification, the problem is usually not the verification — it's that the objective was never clear, which routes straight back to the hard-stop rule: ambiguity about the goal → ask.

The same discipline applies within the loop, not just at its end. After every meaningful change: run the affected tests, run lint, rebuild if imports or types moved. Never trust that a function exists or an API returns a certain shape — read the actual file, run the actual code. And a green test the AI can't explain is a red flag, not a pass: a test that mocks everything and asserts nothing is worse than no test, because it manufactures false confidence that the checklist then launders into "done."

## The contract in one page

For teams adapting this, the whole chapter compresses to six rules:

1. **Autonomy runs to "merged to dev, verified green" — then stop and report.** No permission-asking inside the line; no action past it without one.
2. **Done is conjunctive:** lint + tests + build, *and* the actual job verified with evidence, *and* merged with CI green, *and* reported. Missing any one means not done.
3. **"Should work" is banned.** Evidence — red→green test, curl output, DB state, screenshot — or the loop keeps going.
4. **Goal ambiguity → ask; how ambiguity → decide.** Technical calls belong to the AI; money, risk, and irreversibility belong to the owner.
5. **Hard stops are absolute and urgency-proof:** promotion past dev, real money, irreversible actions, global behavior defaults, unclear objectives.
6. **The loop has an exit:** three failed fixes on one failure, an unfound root cause, a needed business decision, or surprise scope — each ends the loop with a crisp report instead of a fourth hopeful attempt.

The remaining chapters are elaborations of this contract: how multiple agents divide the loop's phases, how an independent model verifies the doer's work before anything merges, and how the hard stops are enforced mechanically rather than by good intentions.

# Chapter 10 — State of the Art (Mid-2026): What the Landscape Validated, What We Changed

Every few months we run a deep-research sweep against our own methodology: a multi-agent web-research pass, adversarially cross-checked against primary sources rather than taken at face value. In mid-2026 we ran it again — this time asking a blunt question: is the way we build this regulated Banking-as-a-Service platform still defensible, or has the field moved past us? This chapter reports what came back, verified against Anthropic's own engineering guidance and two 2026 research papers, and what we changed in response. It closes with a meta-lesson about the review process itself, discovered while writing this very chapter.

## How the sweep worked

We did not want a single model's confident summary of "best practices." The research ran as a fan-out: several research agents independently gathered claims from primary sources, then a separate adversarial pass tried to knock each claim down before it was allowed into this document. A claim survived only if it traced to something concrete — an Anthropic engineering post, a hook or CLI feature that actually ships, or a paper with a stated methodology — not to a blog's paraphrase of a paraphrase. Where a claim couldn't be pinned to a primary source, it is marked as such below or left out.

## Part 1 — What Was Validated

The most useful outcome of a self-audit is not new ideas. It's confirmation that the expensive things you already built are still the right things. Four claims held up.

### 1. The gather → act → verify → repeat loop is now official guidance

The operating contract in Chapter 1 — gather context, act, verify, repeat, until the work is merged and confirmed green — was originally something we converged on from repeated incidents, not something we read in a manual. The sweep found that Anthropic's own engineering guidance now describes agentic coding in essentially this shape: an explicit loop with a context-gathering phase, an action phase, and a verification phase that gates whether the loop continues or exits. That is not a coincidence of vocabulary — it is the same shape because it is the shape that survives contact with real codebases. Loops that skip the verify step degrade the same way regardless of which lab built the agent: confident, plausible, wrong.

The practical upshot for us is not a rewrite. It's confirmation that Chapter 1's contract deserves to stay load-bearing rather than getting quietly eroded the next time someone is in a hurry.

### 2. Deterministic hooks beat prompt-instructions for anything that must always happen

Chapter 5 argues that "the AI will remember to run this every time" is a bet you eventually lose, and that anything non-negotiable belongs in a hook the harness enforces, not a paragraph the model reads. This is now unambiguous, not just our incident-derived opinion: prompt-based instructions are probabilistic by construction — a sufficiently long context, an "urgent" framing, or an unusual request can push the model past a rule that lives only in text. A hook is not probabilistic. It either blocks the tool call or it doesn't.

We had already built our merge gate this way (Chapter 2) and our branch-protection gate this way (Chapter 5). The sweep didn't change the mechanism — it removed any doubt that this was the right default for every future "must always happen" requirement, rather than a workaround for one specific incident.

### 3. Doer/verifier separation is the correct shape, not an overcautious one

The cross-vendor review in Chapter 2 — a different model vendor reviews the exact diff with a skeptical SHIP/BLOCK prompt before any merge — sits on a documented cognitive bias: a model reviewing its own output shares the blind spots that produced the output. Sweeping current guidance and failure-mode research both point the same direction: verification quality drops sharply when the verifier is the same model instance, or even the same model family, that produced the work. The fix is structural, not a matter of asking more carefully — the verifier has to be a genuinely separate reasoning process. Same-vendor, second-session review is better than nothing, but it is not the same guarantee as a different vendor with a different training lineage and different failure surface.

### 4. Large-scale failure data confirms what the gates are actually for

The most concrete validation came from an analysis of real-world agent failure episodes across coding-agent deployments. Two categories dominate:

- **Instruction-following violations** — the agent did something the instructions explicitly said not to do, or skipped something they said it must do — account for roughly 38% of misalignment episodes, and the rate is *higher* in CLI/terminal-agent contexts than in more constrained environments.
- **Inaccurate self-reporting** — the agent claims success, completion, or a passing state that isn't actually true — accounts for roughly 23% of episodes, and that share is *growing* over time as agents get better at producing confident-sounding reports.

Read against our own architecture, this is not an abstract finding. It is a description of exactly the two failure modes our two heaviest guardrails exist to catch. The per-SHA merge hook (Chapter 2, Chapter 5) exists because an agent will, with some nonzero rate, skip or bypass an instruction under pressure — that's category one. The "never should-work, only red→green / curl / screenshot" verification discipline in Chapter 1's done checklist exists because an agent's own narration of its success is not reliable evidence — that's category two. We built both gates from incidents, one at a time, before this data existed. Seeing the aggregate numbers doesn't change the design; it says the design was pointed at the two biggest real problems all along, not at hypothetical ones.

## Part 2 — What We Changed

Validation of the big bets is not the same as validation of every detail. Four things changed.

### 1. The constitution went on a diet

Anthropic's guidance on the always-loaded project-instructions file is specific: keep it small, on the order of a couple hundred lines, because every line in that file is loaded into every single request regardless of relevance, and bloat measurably degrades how reliably the model follows the rules that matter most. A file that tries to be a full engineering handbook competes with itself — the rule you actually need buried on line 650 gets the same attention budget as a paragraph of stylistic advice nobody is currently violating.

Our own constitution had grown, incident by incident, to roughly 800 lines. Every rule in it traced to a real story — that was never the problem. The problem was that "traces to a real story" is not the same test as "needs to be loaded on every request forever." We re-sorted the file by that second test:

- **Procedural, domain-specific content moved to on-demand skills** — the "how do we validate a provider enum against its sandbox API" procedure, the webhook-delivery playbook, the migration-authoring checklist. These now load only when the matching domain work is actually happening, via the skill-invocation mechanism described in Chapter 4, instead of sitting permanently in the hot path.
- **File-specific constraints moved to path-scoped rules** — a rule that only matters when touching `supabase/functions/**` or `src/hooks/**` now lives as a rule scoped to that path, not as a global paragraph the model has to filter out of relevance on every unrelated edit.
- **What stayed** in the always-loaded file: the operating contract (Chapter 1), the hard-stop list, the merge-gate rule, and the small set of cross-cutting principles that apply regardless of what file is being touched.

The result went from roughly 800 lines to roughly 220. Nothing was deleted — every incident-derived rule still exists and still fires — it just moved to the layer that matches how often it's relevant. See `examples/claude-md/` for the trimmed structure and `examples/rules/` for how the path-scoped constraints are organized.

### 2. The cross-vendor review got an explicit rubric

The sweep's second finding was a caution about our own Chapter 2 mechanism, not a rejection of it. Bare "LLM-as-judge" — hand the diff to a second model and ask for a verdict — is a documented weak link: judges are inconsistent across near-identical inputs, susceptible to surface features (verbosity, confident tone) that have nothing to do with correctness, and prone to rubber-stamping when the prompt is vague. What actually improves judge reliability is giving the judge **explicit rules to check against and requiring it to explain *why* something fails**, not just render a verdict.

Our SHIP/BLOCK prompt already asked for a skeptical read of the exact diff — that part held up. What it lacked was a structured checklist the reviewer had to work through and justify, rather than a free-form "does this look okay." We added an explicit rubric: specific categories the review must address (does the diff match its stated scope, does it introduce an unguarded money-moving path, does it touch a hard-stop area without approval, does the report claim verification that the diff doesn't actually contain), each with a required one-line justification, before the final SHIP/BLOCK. See `examples/codex-review-rubric.md`, and Chapter 2 for the underlying gate this rubric now feeds.

### 3. Long-horizon loops got three upgrades

Chapter 7's engineering loops — the discover/plan/execute/verify cycle that runs multi-iteration work unattended — picked up three concrete changes:

- **Immutable feature lists.** Once a loop's target feature list is written for an iteration, agents inside that iteration cannot silently add, drop, or reword items. Scope drift inside a supposedly-bounded loop was a recurring failure mode; an immutable list makes drift visible as a diff against the list rather than an untracked decision.
- **One feature per iteration.** Loops that tried to advance several features per pass produced partial progress on all of them and a verification step that couldn't cleanly say pass or fail. One feature per iteration means the verify gate has a single, unambiguous thing to check.
- **Mandated browser-level end-to-end verification** for any loop touching user-facing behavior. Unit and integration tests passing is necessary but is exactly the kind of "should work" evidence Chapter 1 already warns against; a loop that touches a screen now has to drive that screen, not just its underlying functions.

See `examples/loops/` and Chapter 7 for the loop mechanics these upgrades attach to.

### 4. Feedback-driven model routing

We had been routing tasks to models by static role — one model for planning, another for mechanical execution, a third-party model for review. That's still the backbone. What changed is that we now record, per task type, which model actually succeeded without rework and which needed a retry or a handoff, and let that record inform future routing rather than routing purely by the static role assignment. A model that is the nominal "planner" but is empirically weak on a particular category of task (say, a narrow class of migration design) shouldn't keep getting that category by default just because the role chart says so. This is a lightweight addition — a log, not a new subsystem — and it composes with the roster in Chapter 3 rather than replacing it.

## Part 3 — What We Did Not Adopt, and Why

A methodology chapter that only lists adoptions is marketing, not engineering. Three things were evaluated and did not make the cut, plus one that made the cut and then got reversed.

**Agent-teams (first-party multi-session coordination).** Current tooling increasingly supports native coordination across multiple agent sessions working the same objective. We evaluated it and it overlaps substantially with the hand-rolled orchestration in Chapter 3 — our roster of specialized agents, dispatched from a single orchestrating conversation, already gets us most of the benefit, and it was built to our specific hard-stop and approval rules rather than generic ones. We're deferring adoption to a trial run rather than replacing working infrastructure on the strength of a sweep. If the trial shows a real reduction in orchestration overhead without weakening the approval boundaries, it graduates to a future chapter.

**Auto-mode classifier permissions.** Newer permission models can classify a requested action and auto-approve or auto-deny based on risk category, rather than relying solely on the static allow/deny lists our hooks currently enforce. This looks complementary to our deny-hooks rather than a replacement for them — a classifier is a second opinion on risk, not a substitute for a deterministic hard stop on, say, `gh pr merge` without an approval file. It's evaluated and pending a decision; we are not rushing it in because the current hook-based gates have zero false-negative incidents in production, and a classifier's risk categorization is inherently softer than a hook's exact-match check.

**The Stop-hook "done gate" — attempted, then descoped.** This one is worth walking through in detail because it's the most honest failure in this sweep. The idea: a `Stop` hook that runs when an agent claims a task is finished, checking that the files it says it touched actually exist and were actually modified, as a machine-checkable complement to Chapter 1's done checklist. The first implementation used a `find`-based check — did the claimed paths appear, with a recent mtime, under version control. It looked solid in testing. Cross-vendor review (the same Chapter 2 mechanism this chapter has been describing) caught the actual problem: a `find`-based existence check cannot see a file deletion or a rename as a completed unit of work — a loop step that legitimately deletes a stale file, or renames one file into another, would fail the done-gate for having done exactly what it was asked to do. We descoped it rather than special-casing it, because a done-gate with special cases is a done-gate nobody trusts. It's a clean example of the gate doing its job on something we were genuinely enthusiastic about adopting.

## Part 4 — The Meta-Lesson

The most useful data point from this exercise came from building the exercise itself. Producing the changes described in Part 2 — the trimmed constitution, the rubric, the loop upgrades — went through roughly eight rounds of the same cross-vendor review this chapter describes in Part 1, before it was judged ready. Two of those catches are worth naming directly, because a single-model pass would have shipped both:

- A stale reference to an old branch-naming scheme, left over from an earlier draft, that no longer matched the three-environment layout actually in use. Internally consistent, plausible, and wrong.
- A rule stated as "enforced by a hook," where the hook it named did not actually exist in the repository at the time of writing — a claim about enforcement that had no enforcement behind it. Exactly the kind of confident, unverified self-report that Part 1's failure-data section flags as a growing failure category, caught by the same mechanism that section is describing.

Neither catch was subtle in retrospect. Both were invisible on a single read-through, including ours. That is the actual argument for cross-vendor, independent review: it does not mostly find the bugs you're unsure about. It finds the ones you were confident about, because confidence is exactly the state in which a self-review skips the check that would have caught it.

## Sources

Findings in this chapter were checked against two kinds of primary material before being written down: Anthropic's own engineering and best-practices guidance on agentic coding workflows, context management, and permission/harness design; and two 2026 research papers, one analyzing model-routing strategies for multi-model agent systems and one building a taxonomy of real-world agent failure modes from production deployment data (the instruction-following and self-reporting figures in Part 1 come from the latter). Claims that could not be traced to one of these were either excluded or explicitly marked as unconfirmed in the text above. No specific URLs are cited here by design — the point of the sweep was the substance, not the citation list, and specific links rot faster than the claims they support.

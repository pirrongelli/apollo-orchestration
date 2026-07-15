# Lessons Learned: War Stories and the Rules They Produced

Every rule in this methodology exists because something broke. This chapter documents the incidents — fully genericized from our work on a regulated Banking-as-a-Service platform — and traces each one from failure, through the gap that allowed it, to the guardrail it became. If the other chapters describe the machine, this one explains why the machine has so many interlocks.

## How to read this chapter

Each story follows the same shape: **what happened**, **why the naive setup allowed it**, and **the rule it became**. The rules are not aspirational. They live in the project's instruction files, in CI checks, and in the worst cases in pre-tool-use hooks that deterministically block the action. An AI agent will re-derive the same plausible-looking mistake every session unless the environment makes the mistake impossible or at least loud.

---

## 1. The silent global default

### What happened

Early on, an agent made a one-line "performance optimization" to the frontend query-client's default options — disabling refetch-on-window-focus platform-wide. It looked like a textbook improvement: fewer redundant network requests, cleaner network tab, no test failures.

It silently killed auto-refresh across the entire platform. For six months.

Nobody noticed because every page still worked on navigation. Load a page, see fresh data. What disappeared was the *passive* freshness: an operator leaving a dashboard open and expecting balances and transactions to update on their own. Each individual observation ("hmm, I had to refresh") was too small to become a bug report. The failure had no error, no log line, no failing test — just a slow erosion of a property nobody had written down.

### Why the naive setup allowed it

Global client defaults are a single point of leverage over every page in the application. One line changes the behavior of hundreds of queries, but the diff looks like one line. Code review — human or AI — evaluates the line in isolation, where it reads as a reasonable optimization. Nothing in the pipeline connected "this config value" to "the platform-wide expectation that screens stay fresh."

Worse, the change was made by an agent operating in good faith. LLMs are trained on a corpus full of blog posts recommending exactly this optimization. Without a rule saying otherwise, the agent will keep rediscovering it.

### The rules it became

**Changing global client-behavior defaults is a hard stop.** Query-client default options, database-client options, anything in the application root that alters how *every* page fetches or refreshes — the agent must propose the change and get explicit human approval before touching it. This is written into the project instructions alongside the other hard stops (production promotion, money movement, irreversible operations), with the incident cited inline so future sessions understand *why*.

**The freshness expectation became an explicit contract with a CI check.** A static script verifies that every realtime subscription in the frontend targets a table that some migration actually publishes for realtime delivery. The property that silently eroded is now machine-checked on every PR. (More on this in the next story, because the subscription side had its own failure.)

The general lesson: any config whose blast radius is "the whole platform" needs friction proportional to that blast radius, regardless of how small the diff is.

---

## 2. The subscription that reported success and delivered nothing

### What happened

Our realtime stack requires two halves: the frontend subscribes to change events on a table, and a database migration adds that table to the realtime publication. We shipped features where only the first half existed. The subscription call returned `SUBSCRIBED`. The status looked healthy. And no event was ever delivered, because the database was never told to publish changes for that table.

This also shipped broken for roughly six months, compounding the previous story: even where focus-refetch had been the safety net, it had been turned off, so nothing caught the silent subscriptions.

### Why the naive setup allowed it

The API is a trap. "Subscribe succeeded" means "the channel connected," not "events will flow." There is no error state for subscribing to an unpublished table — it is indistinguishable from a table that simply hasn't changed yet. Manual testing passes if the tester triggers a change through the UI (which also invalidates the cache locally). The failure only appears when a *different* actor — a webhook, a cron job, a background worker — writes the row, and the screen never learns.

An AI agent writing a new feature copies the subscription pattern from an existing hook, sees `SUBSCRIBED` in the console, and reasonably concludes the work is done. The missing migration is in a different layer, a different directory, a different mental model.

### The rule it became

**The Live-Update Contract.** Every user-visible table that gets written by webhooks, crons, or workers must have an explicit, PR-time answer to one question: *"How does the screen learn about this without F5?"* The answer must be one of exactly two things:

1. **Realtime**: the table is added to the publication in a migration *and* a frontend hook subscribes and invalidates the right query keys. One without the other is defined as a bug.
2. **Polling**: the query uses an explicit refetch interval with a written justification.

The contract applies uniformly to every integration — no provider ships with less live-update coverage than the others for equivalent data.

**Enforced by a coverage-check script in CI.** The script statically parses every realtime subscription in the frontend and cross-references the migration history to confirm the target table is actually published. A subscription to an unpublished table fails the build. The class of bug where both halves look independently fine but the pair is broken is now structurally impossible to merge.

The general lesson: when a success signal doesn't actually verify the property you care about, write a check that does — and make the required pairing explicit, because "SUBSCRIBED" will fool every future contributor, human or AI.

---

## 3. useState is not a mutex

### What happened

A withdrawal form guarded against double submission the way most React codebases do: a `submitting` boolean in component state, checked at the top of the handler, set to `true` before the API call, button disabled while true.

In production, a user double-clicked. Two rapid clicks both read `submitting === false` before either state update flushed — React batches state updates, so the boolean is not a synchronization primitive. Two withdrawal requests went out. The upstream provider created two withdrawals. Real money moved twice.

### Why the naive setup allowed it

Three layers each looked like they were handling it, and none actually were:

- **The frontend boolean** is asynchronous. `setState` schedules an update; it does not take a lock. Under rapid interaction, both invocations see the pre-update value. This is well-documented React behavior that nevertheless reads as a correct guard to almost everyone, including code-review models.
- **The database unique constraint** on the upstream transaction ID caught nothing, because the two duplicate POSTs created two *different* transactions upstream, each with its own perfectly unique ID. The constraint protects against webhook replay — the same event delivered twice — not against duplicate creation. These are different failure modes that look superficially identical.
- **The server had no idempotency layer**, so it faithfully executed both requests.

The naive mental model is "somewhere in this stack, a uniqueness check will save us." The stack had uniqueness checks. They guarded the wrong thing.

### The rules it became

**Frontend: `useRef` is the synchronous dedup guard for every financial mutation.** A ref updates synchronously — `if (ref.current) return; ref.current = true;` actually excludes the second click. The `useState` boolean stays, but only for UI (disabled button, spinner); it is never trusted for concurrency. Two corollaries earned their own sub-rules: everything after setting the ref must sit inside `try/finally` so the ref is always released (an exception between the ref-set and the try block otherwise bricks the form permanently), and the reset happens in `finally`, never only on the success path.

**Backend: every money-moving endpoint supports an `Idempotency-Key` header, and the client always sends one.** The client generates a UUID per form submission. The server atomically reserves the key (`INSERT ... ON CONFLICT DO NOTHING`) *before* calling the upstream provider. Key already exists with a stored response → return the stored response. Key exists with no response yet (concurrent in-flight request) → return 409. And critically: the idempotency table stores **failure** responses as well as successes — if only successes are stored, a retry after a failure gets "409 in progress" forever instead of the real error, permanently wedging that key.

**Doctrine: no money-moving provider call ships without a double-charge guard.** If the provider supports idempotency keys, use theirs; if not, implement an internal reserve-before-call. This is now a standing rule, not a per-feature decision.

The general lesson: for financial mutations, defense must exist at the layer where the duplicate is *created*, not just where it is *recorded*. And a DB constraint is only protection if you can articulate precisely which duplicate it prevents.

---

## 4. The missing approval gate

### What happened

A six-figure fiat payment left the platform with single-person approval. The four-eyes control — a second human must approve any payment above a threshold — existed and worked for one payment rail. It had never been built for the other. And when we investigated, it got worse: the approval-rules table that the admin UI referenced for configuring thresholds *had never actually been created in the database*. The UI rendered; the configuration screen existed; the table behind it did not.

### Why the naive setup allowed it

Two independent gaps compounded:

**Feature asymmetry across integrations.** The approval gate was built when the first rail shipped. The second rail was integrated later, by a different session, focused on making payments *work* — and "does an equivalent control exist on the other rail?" was nobody's checklist item. Each rail's code passed its own review. The asymmetry was invisible unless you deliberately diffed the two control surfaces.

**UI referencing a phantom database object.** The frontend queried a table by name. The query failed silently (empty result reads the same as "no rules configured"), the UI showed sensible defaults, and everything *looked* configured. Nothing at build time verifies that a table name in a query corresponds to a table that a migration actually creates. An AI agent had at some point written the UI and the intended migration in the same session — and the migration never landed.

### The rules it became

**Parity checks across providers for every money-control feature.** Any feature about approvals, limits, monitoring, or holds must explicitly cover *all* integrated rails, or document why one is exempt. "Both providers, always" is written into the project instructions as a delivery requirement, not a nice-to-have. When we later added a monitoring gate to crypto sends, the PR was framed explicitly as "parity with fiat" — the incident made asymmetry a named category of bug.

**Verify referenced DB objects actually exist.** Before shipping code that queries a table, calls a database function, or joins through a foreign key: prove the object exists in the target environment. Grep the migrations; query the live schema. "The UI references it" is evidence of intent, not existence.

**An adversarial security pass before shipping anything that touches money.** Before declaring done, the agent must actively try to break its own work: Can another tenant reach this? Can this fire twice? Does the control exist on *both* rails? Does the table this depends on exist? This runs as an explicit checklist step in the loop, and a dedicated security-review pass is mandatory for changes touching auth, access rules, or money movement.

The general lesson: controls fail in the seams — between integrations, and between the layer that renders a control and the layer that stores it. Test the seams deliberately, because component-level review will never see them.

---

## 5. The reviewer that saved a double-payout

### What happened

An agent built an auto-rebroadcast feature: when a blockchain transaction was reported as dropped from the mempool, the system would automatically re-send it. The implementation was clean. Its tests passed. The doer's own verification pass was green across the board.

The independent adversarial review — run on a *different vendor's model* before merge — vetoed it. The reviewer's objection: a transaction reported as dropped is not guaranteed to be gone. Mempool state is not authoritative; a dropped transaction can later still be mined. Auto-rebroadcast therefore risks *both* transactions confirming — paying twice — and no amount of testing against the happy path would surface this, because the failure lives in the adversarial semantics of the underlying network, not in the code.

We didn't ship it. The double-payout never happened.

### Why the naive setup allowed it

The doer's tests encoded the doer's model of the world: "dropped means gone." Every test passed because every test shared the same wrong assumption. This is the fundamental limit of self-verification — an agent cannot test its way out of a premise it doesn't know is false. The same model that generated the design will, when asked to review it, largely re-generate the same reasoning and bless it.

The independent reviewer succeeded for two reasons: it was framed adversarially ("find a reason to block this"), and it came from a different model vendor, trained differently, with no investment in the design being correct.

### The rule it became

**The doer never judges its own work.** Every merge requires an independent adversarial review by a different model vendor, prompted skeptically for an explicit SHIP/BLOCK verdict on the exact diff being merged. The approval is recorded against the exact head commit; any new commit invalidates it and forces a re-review. A pre-merge hook deterministically blocks the merge command unless the per-commit approval exists — the rule is not a convention the orchestrator can forget, it is a gate the tooling enforces. The review runs in parallel with CI, so it costs no wall-clock time.

The general lesson: self-review catches implementation bugs; only independent review catches *premise* bugs. In a money system, the premise bugs are the expensive ones.

---

## 6. Theatrical bot findings

### What happened

Automated PR-review bots regularly flag issues that do not exist. Our canonical specimen: a bot flagged a `.gitignore` pattern as dangerous because it would also match a hypothetical file — in a repository containing zero files matching that name. The finding was grammatically confident, technically coherent, and about nothing.

The failure mode isn't the bot being wrong — it's what happens next. An agreeable agent, told "the review found three issues," fixes all three in one commit. Now a real fix, a cosmetic non-fix, and a change made purely to satisfy theater are fused into one diff. The PR balloons; the reviewer can no longer trace every changed line to the PR's goal; and code was changed for a bug that never existed, which is itself a regression risk.

### Why the naive setup allowed it

LLM agents have a strong prior toward accommodating feedback. A review comment arrives with the same authority whether it's a genuine bug or pattern-matched noise, and the path of least resistance is to "address" everything. Nothing in the naive loop asks the prior question: *is this finding real?*

### The rules it became

**Filter findings before changing code.** For every automated finding, the first step is verification against reality — does the flagged file exist, does the flagged path execute, does the claimed failure reproduce? Theatrical and false-positive findings are dismissed with a one-line justification, not "fixed." Changing code to appease a phantom is defined as a bug, not diligence.

**One finding = one commit.** Each verified finding gets its own commit unless findings are genuinely coupled (and the coupling is justified in the commit message). This keeps every change traceable and individually revertible, and it forces the filtering step — you can't batch-appease when each fix has to stand alone.

**The acceptance question for every PR:** *can a reviewer point at every modified line and trace it back to the PR's stated goal?* If the answer is "mostly," the PR is too broad. This question is in the PR template, filled out before review.

The general lesson: automated review is an input, not an instruction. The judgment step between "finding reported" and "code changed" is precisely the step an eager agent will skip unless the methodology makes it mandatory.

---

## 7. The meta-lesson: methodology is scar tissue

Look at the trajectory each story follows, because it is always the same trajectory:

1. **An incident happens** and gets investigated to root cause — not "the agent made a mistake" but *which structural gap made the mistake possible and invisible*.
2. **The root cause becomes a memory.** A written record with the mechanism, the fix, and the tell-tale symptoms, persisted where every future session reads it. Memories are cheap and fast to write; they are the first line of defense.
3. **Recurring or high-stakes memories get promoted into instruction-file rules.** The project's standing instructions are not a style guide — they are a compressed incident log. Nearly every emphatic rule in ours ("a state boolean is not a mutex," "changing global defaults is a hard stop," "the doer never judges its own work") is a scar with a story attached, and the story is usually cited inline so future sessions understand the *why*, not just the *what*.
4. **The worst ones become hooks** — deterministic, code-level denials that don't depend on any model reading, remembering, or agreeing with a rule. The merge gate that requires a recorded independent approval for the exact commit being merged is a hook. Rules can be forgotten under context pressure; hooks cannot.

This ladder — incident → memory → rule → hook — is the actual engine of the methodology. Each rung trades flexibility for reliability, so promotion up the ladder is deliberate: not every lesson deserves a hook, but a lesson that involves money, irreversibility, or a failure mode that is silent by nature usually does.

Two closing observations for anyone adopting this approach:

**AI agents make the ladder more necessary, not less.** A human team accumulates institutional memory in people's heads. An AI team starts every session amnesiac except for what you wrote down. The upside is that written rules are applied with far more consistency than human memory ever achieves — but only if the incident actually gets written down, at the right rung, with the mechanism explained.

**The rules compound.** The query-default incident and the phantom-subscription incident were separate failures that masked each other for six months — each one disabled the safety net for the other. The fix was not two patches; it was a contract plus a CI check plus a hard stop, and together they close the *class*. When you find one silent failure, assume it has been hiding others, and write the rule broad enough to catch the family.

The methodology in this repo is not a design we drew up front. It is the accumulated scar tissue of running real money through AI-written code and refusing to let the same thing cut us twice.

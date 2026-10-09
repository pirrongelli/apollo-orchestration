# 13 — Operational case: accepted maintenance, incomplete lifecycle

**Informative case, status as of 2026-10-09.** The maintainer accepted a reviewed
maintenance change delivered to the development branch at 01:39:22 UTC. This
does not establish a completed autonomous default-entrypoint lifecycle.

At 02:00:14 UTC, normal explicit reconciliation released task-claim and registry
custody while preserving the budget and failure history; its delivery flag
remained false. This administrative reconciliation is distinct from authoritative
work-item delivery acceptance and physical closure.

**Later observation, 02:09:15 UTC:** the owned directory and Git registration
were both confirmed absent. The normal Git removal first returned Directory not
empty after deregistration. A maintainer preserved the remaining files and links
in a private archive, verified them, and completed the partial cleanup. An initial
archive-comparison failure is retained separately from the successful fresh
verification. This establishes guarded operator cleanup, not an autonomous
default-entrypoint closure. The original Goal delivery flag and spent budget
remained unchanged.

**Unverified for the original finite lifecycle:** authoritative work-item
delivery reconciliation and receipt of the reserved completion notice.

[Apollo 2.0](12-apollo-2-standard.md) specifies a project-independent method.
This chapter describes one private integration of that method, including its
unsuccessful finite executions and disclosed maintainer interventions. The
[companion article](articles/apollo-2-responsible-development.md) discusses the
security rationale and research limits.

## What a reader can reproduce

The public reference uses the Python standard library and dependency-free Node
examples. From the repository root, with Python 3.10+ and Node 20+:

```sh
python3 --version
node --version
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s examples/fleet -p 'test_*.py' -v
python3 examples/fleet/validate.py --help
APOLLO_NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$APOLLO_NODE_MAJOR" -ge 22 ]; then
  export NODE_OPTIONS='--max-old-space-size=4096 --no-experimental-webstorage'
else
  export NODE_OPTIONS='--max-old-space-size=4096'
fi
node --test examples/quality/ratchet-lib.test.mjs examples/loops/check-features-immutable.test.mjs
```

The reference contains 77 Python and 29 Node checks: 106 synthetic conformance
checks. Its differently named project fixtures and hostile inputs test local
evidence predicates. They do not launch a model, authenticate a hidden backend,
merge a live change or confirm a real notice. Consult the
[coverage boundary](../examples/fleet/README.md#exact-coverage-boundary) before
claiming a runtime capability.

Private integration logs are retained by the maintainer and are not distributed
here. The private results below are a sanitized maintainer-reported case record,
not a publicly reproducible dataset. Public fixture success and private execution
results must remain separate.

Here, a native work execution is an actual worker execution through the
integration's model runtime. Admissions that stopped before a worker launched
and reviewer executions are accounted for separately.

| Evidence | Reported result | What it establishes |
|---|---|---|
| Public reference | 77 Python + 29 Node checks | Reproducible synthetic local conformance |
| Private registered job | 152 declared, 152 executed, zero skips, successful exit | Actual integration-control execution on the accepted candidate |
| Private application suite | 10,904 passing tests across 739 files, zero skips | Application verification on that candidate |
| Five current private gates | Preflight, lint, application tests, build and registered job completed successfully | Candidate validation; earlier-version results remain historical |
| Independent review | Two distinct non-author contexts returned SHIP; canonical R11 reported no finding | Exact-candidate review, separately authenticated by the maintainer |
| Development delivery | Accepted maintenance delivered at 2026-10-09T01:39:22Z | Development-branch delivery, not production promotion or lifecycle completion |
| Historical native work | Ten heterogeneous executed work attempts; zero completed autonomous lifecycles | An unsuccessful operational history, not a homogeneous success-rate experiment |

## The reusable operational method

An adopter supplies its own task, execution, review, forge and notification
adapters. The public validator checks only its documented subset. A minimal
integration should make the following boundaries observable:

1. **Register before effects.** Preserve an immutable objective, repository,
   branch, allowed paths, owner, implementing contexts, authorization and finite
   limits. Bind original bytes with a protected digest. A digest detects changes
   against an original; it does not authenticate a fabricated original.
2. **Charge and identify execution.** Retain the real command, input, working
   directory, deadline and attributable job identity. Local process custody
   includes PID, birth and group. Keep the conversational exit separate from the
   actual command exit, executed count and skipped count.
3. **Journal uncertainty.** Distinguish prepared, running, succeeded, failed and
   unknown effects. After interruption, inspect the original owned effect before
   retrying. Timeout, absence of a message and an expired lease are insufficient
   reasons to repeat an uncertain external operation.
4. **Coordinate integration.** Let independent development proceed. Cooperative
   coordinators on one machine can order integration through a shared common-Git
   FIFO reservation with a durable identity and finite deadline. Waiting consumes
   no model launch merely for waiting. Release short journal locks before gates
   or network operations; retain one consistent lock order.
5. **Validate the current candidate.** Both initial and recovery entry paths need
   the applicable current-head gates. Rejoin authenticated pending effects before
   testing final source cleanliness. A changed integrated tree invalidates the
   affected current validation and review; preserve older results as history.
6. **Review and admit.** Exclude every author from review. Sensitive changes need
   two distinct contexts. Independence is a context and authorship boundary,
   not a price tier. Bind original verdicts to exact head/base and check current
   CI and target state before a merge pinned to the reviewed head.
7. **Close from receipts.** Reconcile the authoritative work item, preserve needed
   work and evidence, and verify both directory and Git-registration removal.
   If notice receipt is required, observe one exact received notice rather than
   treating a send operation as completion.

For this case, whole completion is the conjunction of actual job execution,
current validation, independent approval, confirmed delivery, work-item
reconciliation, owned closure and verified notice receipt. A successful subset
does not make the remaining terms true.

## What interrupted delivery exposed

The integration evolved through corrective maintenance rather than unattended
success. Queue waits, target movement, synthetic fixtures dependent on ambient
capacity, missing retained-tool dependencies and an initial path that omitted
mandatory gates all produced distinct failures. These required diagnosis and
bounded repair; passing a narrower test did not erase the original outcome.

Two independent blocking reviews exposed separate interruption windows despite
earlier green suites:

| Boundary | Controlled observation | Required correction |
|---|---|---|
| Reservation publication | The shared journal published a ticket before the task journal persisted it; subsequent drift could strand the ticket. | Authenticate the original intent/ticket across both stores and release quiescent custody before releasing the task claim. |
| Reservation release | The shared journal recorded RELEASED, then task cleanup was interrupted; a retry restored a stale ACTIVE representation and lost its release reference. | Replace in-memory custody only after cleanup commits; preserve the old ticket's terminal state and original immutable release receipt. |
| Recovery timing | Broader admission bounds did not enforce the smaller immutable recovery window. | Check registered generation feasibility and remaining recovery time before charging a paid effect. |

These were disposable exception and target-movement controls, not observations
of every operating-system crash or distributed interleaving. The release-side
regression produced two intended assertion failures before repair; 47 affected
controls subsequently passed without skips. The accepted maintenance candidate
then passed the current five gates and two independent reviews. Those scoped
results establish the tested corrections, not universal crash safety.

The history also distinguishes terminal execution from live process authority.
An operating system can reuse a numeric PID or group identifier. An authenticated
historical receipt may establish what an old execution did; it cannot authorize
signaling the identifier's current occupant. Owned cancellation requires fresh
exact PID, birth, group and task custody. Unknown, changing or foreign identity
remains held.

## Concurrency and admission limits

The local integration mechanism is cooperative and same-machine/common-Git in
scope. Its journal has a bounded 128-entry lifetime inventory. It neither freezes
other development nor excludes a remote, manual or uncooperative target update.
Waiting and recovery therefore need explicit retained outcomes and enough
remaining time and review reserve for each registered generation.

GitHub documents its merge SHA condition as a head match. Strict required status
checks require the branch to be current with its base. Our inference is that a
local reservation plus a head pin does not supply an atomic remote base pin.
[GitHub merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

The maintainer activated and normally read back a strict development-only server
check policy; production branches were unchanged. This is a reported policy
observation, not proof of server compare-and-swap or distributed correctness.
Client precheck and readback cannot rule out every intervening settings change.

All three original renewals and all five credits in the final finite budget are
exhausted. They remain historical, with no refund, rewritten deadline or new
pilot implied by maintenance acceptance. A finite attempt can finish
unsuccessfully while the owner's broader product objective remains incomplete.

## Remaining acceptance boundary

Development delivery is accepted as maintenance. A complete autonomous lifecycle
through the default entrypoint was not demonstrated: the record remains ten
heterogeneous native work executions and zero whole-lifecycle completions.
The stock retirement route does not accept the observed combination of
successful work and failed delivery as completed retirement. No resource removal
or notice receipt should be inferred from source approval or development merge.

The separately dated operator cleanup above confirms owned physical and
Git-registration closure with preserved originals. It does not establish stock
Goal retirement or autonomous delivery. Authoritative work-item delivery
reconciliation and the original reserved notice remain unverified; later
observations must not retroactively convert failed finite trials into autonomous
successes.

Reviewed learning means an evidence-backed rule with retained failure history
and an independent promotion decision. It does not mean model-weight training.
This case supports specific transition tests and an accountable method. It
provides no measured causal security benefit, savings estimate, certification
or endorsement.

# Apollo 2.0: accountable orchestration for responsible software development

## Abstract

AI-assisted development needs an account of what was authorized, executed,
reviewed and delivered. Apollo 2.0 specifies finite execution, durable custody,
independent version-bound review and observable completion. Its public reference
offers 106 synthetic conformance checks. A private financial-software integration
also produced accepted maintenance with current validation and development
delivery, but did not complete an autonomous default-entrypoint lifecycle across
ten heterogeneous native work executions. This article explains the method's
security rationale, its relation to public risk-management guidance and the
limits of the evidence. It makes no causal security-improvement claim.

## The problem: fluent output is not accepted software

A development system can write a plausible patch while failing to preserve the
authority or evidence needed to accept it. For example, a changed target can
make a review stale; an interrupted external operation can have an unknown
outcome; a success message can arrive before owned resources are safely closed.
These are properties of orchestration as well as code generation.

Financial software makes the consequences concrete. Tenant isolation,
authorization, transaction integrity, idempotency and provider reconciliation
need application-specific implementation and adversarial testing. Development
controls can help make changes to those protections inspectable. They cannot
substitute for the protections themselves. Our hypothesis is that explicit
authority, original evidence and bounded recovery reduce specified workflow
failure modes; this case does not measure financial loss or incident reduction.

Prior empirical work motivates care without settling the effect of today's
models. Perry and colleagues studied assistance from an older coding model on
security tasks and found less secure code and greater confidence among assisted
participants. [Perry et al., version 3](https://arxiv.org/abs/2211.03622v3).
Sandoval and colleagues reported a smaller security impact in a different
58-person study involving a C data-structure task.
[Sandoval et al., version 4](https://arxiv.org/abs/2208.09727v4).
The assistants, participants, tasks and measurements differ. Neither study
evaluates Apollo or establishes a universal result for current models. Comparing
their conclusions without those design differences would overstate the evidence.

## A method built around authority and evidence

[Apollo 2.0's normative controls](../12-apollo-2-standard.md) divide
responsibility between a human owner, accountable coordinator, scoped executor,
independent reviewers and delivery integrator. An adopter chooses the concrete
adapters; the standard does not require a particular provider, application,
board service or harness.

Before effects, an immutable intent binds scope, original authorization, source,
implementing identities and finite limits. Charges precede execution and remain
counted after failure. Process or job receipts bind the real input, command,
source and terminal outcome. Unknown effects remain unresolved until attributable
observation permits a supported transition. Independent review excludes authors
and approves an exact candidate and base. Completion requires confirmed delivery,
authoritative work-item state, owned resource closure and any required received
notice.

This design separates three concepts that are easy to conflate: a worker ending,
a finite attempt ending, and the owner's objective being completed. Maintaining
accountability for an unfinished objective does not authorize unlimited retries,
refunds or extension of an expired attempt. A further effect needs an applicable
authority, remaining capacity and a supported bounded transition.

The same distinction governs resource custody. Historical terminal evidence is
an account of an earlier execution. Live cancellation authority requires fresh
identity, including PID, birth, group and task binding. A recycled identifier
must not turn a foreign process into an owned resource. Likewise, a working
directory is not closed until both its disk path and Git registration are gone
under preservation guards.

## A single integration case, with disclosed interventions

The [operational case](../13-operational-case.md) is a sanitized maintainer report,
not a controlled comparison. Private execution logs and integration source context are
retained privately. Successive candidate versions, shared host capacity,
development-target changes and maintainer corrections make the ten actual native
work executions heterogeneous. Zero completed autonomous lifecycles is a
description of that history, not an estimate of a stable failure probability.

The accepted maintenance candidate passed five current gates: preflight, lint,
application verification, build and the integration's registered job. Application
verification passed 10,904 tests across 739 files; the registered job executed
152 of 152 cases, both with zero skips. Two distinct non-author review contexts
issued authentic favorable verdicts with no canonical R11 finding. The maintainer
accepted development delivery at 2026-10-09T01:39:22Z. These are private integration
results, separate from the public 106 synthetic checks.

Work-item delivery reconciliation and the original reserved completion-notice
receipt remain unverified. Owned physical and Git-registration closure was
subsequently verified at 02:09:15 UTC through explicit maintainer intervention,
including private archival of remnants after a partial Git removal. The original three
renewals and final five spent credits remain exhausted. No further pilot is
implied. The accepted result is reviewed maintenance, not an autonomous lifecycle
success or a reversal of earlier finite failures.

Before the physical cleanup, normal explicit reconciliation at 02:00:14 UTC
released claim and registry custody with the budget unchanged and the delivery
flag still false. That administrative
result is separate from work-item delivery acceptance. The separately observed
manual physical closure does not demonstrate autonomous lifecycle completion.

Independent review found useful counterexamples despite broad green suites.
One interruption occurred after a shared reservation journal was written but
before a task journal persisted the corresponding ticket. Another occurred after
the shared journal recorded release but before local cleanup committed. In the
second case, a restart resurrected an old active representation and lost its
release reference. The release correction updates in-memory custody only after
the cleanup transaction commits. Separate recovery-window checks now account
for registered generations and remaining time before paid effects.

These controlled disposable interruptions distinguish publication from release;
they are not demonstrations of all kernel crashes or distributed schedules.
They show why a broad passing suite can miss a particular transition. Keeping
the counterexample and extending a meaningful failed-first regression is a
stronger account than silently replacing the failed run with a later success.
It does not establish the sensitivity of independent review in general.

## Cooperative concurrency has an explicit boundary

Several development efforts should be able to coexist without stopping unrelated
work. The integration orders cooperative attempts on the same machine and common
Git repository with a finite FIFO reservation. Short durable transactions bind
owner, task, generation, source, target and deadline. Journal locks are released
before tests or network operations. Waiting alone consumes no model launch;
expiration alone cannot transfer an active or unknown owner's custody.

The local journal is bounded to 128 lifetime entries and has no distributed
guarantee. A different machine or manual operation can still move the target.
Changed integrated trees require current verification and review capacity;
old results remain attached to their original versions.

GitHub's documented merge SHA condition pins the pull request head, while strict
status checks require an up-to-date base. We infer that a local lease and head
pin cannot by themselves establish an atomic remote base constraint.
[Merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
The case's development-only strict check policy was activated and read back;
that observation does not prove server compare-and-swap. A client readback
cannot exclude every intervening server-policy edit.

Reviewer independence is defined by distinct context and author exclusion.
Provider diversity can be a project risk choice, but a higher price tier alone
does not make a review independent or more secure. Distinct contexts also do not
guarantee statistically independent errors. Review effort should follow the
change's risk and evidence gaps rather than an assumed ranking of models.

## Public guidance and applicability in the United States

NIST's Secure Software Development Framework version 1.1 describes practices
that organizations can incorporate into their development lifecycles. Apollo's
source and review custody can contribute evidence to an organization's own
secure-development assessment; it does not establish that the organization
satisfies the framework. [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final).

NIST AI RMF 1.0 organizes risk management into GOVERN, MAP, MEASURE and MANAGE.
The following mapping is our engineering interpretation, not a NIST assessment
of Apollo. [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf).

| Function | Candidate development evidence |
|---|---|
| GOVERN | Named accountable roles, bounded authorization, author exclusion and preserved refusals |
| MAP | Declared project scope, affected users, sensitive operations and unsupported capabilities |
| MEASURE | Exact-source commands, real executed/skipped counts, original reports and adverse controls |
| MANAGE | Finite recovery, explicit unknown outcomes, guarded resource closure and reviewed corrective rules |

For US teams, this supplies a public vocabulary for evaluating development
workflows and communicating their limits. NIST describes the AI RMF as voluntary;
adopting Apollo is not a certification, regulatory approval, endorsement or
determination of legal compliance.
[NIST AI RMF overview](https://www.nist.gov/itl/ai-risk-management-framework).
Financial organizations still need their own domain, security and legal
assessments. This article makes no immigration-eligibility or universal
model-security claim.

## What a stronger evaluation would measure

The present evidence supports specific repaired behaviors and an explicit
method. It has no randomized control arm, incident-rate baseline or measured
counterfactual cost. A security or efficiency benefit therefore remains a
testable hypothesis.

A stronger study would fix the candidate version and task distribution, record
all attempts and interventions, and compare specified failures with and without
the relevant control. Useful outcomes include uncertain-effect replay, stale
approval acceptance, foreign-resource changes, complete closure and genuine
notice receipt. It should measure queue time, review costs and failed admissions
separately, preserve unknown usage, and never infer savings from an unbuilt
counterfactual. Any evaluation requiring additional executions needs a separate
bounded authorization; this case does not authorize one.

Reviewed learning is the preservation of an observed cause, its evidence and an
independent decision to promote a reusable rule. It is not model-weight learning.
The contribution available now is an inspectable control specification,
reproducible local checks and a case that retains both accepted maintenance and
unfinished operational acceptance.

## Availability and reproduction

Run the dependency-free commands in the
[operational case](../13-operational-case.md#what-a-reader-can-reproduce) or
[reference README](../../examples/fleet/README.md). The public fixtures are
synthetic and project-independent. The private 152-case integration job and
10,904-test application suite are not included and cannot be reproduced from
this repository. Documentation and examples use the repository's
[MIT license](../../LICENSE); private evidence is not part of that release.

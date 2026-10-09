# Apollo 2.0: accountable orchestration for responsible software development

*An open proposal for governing development agents, protecting sensitive decisions and evaluating results through reproducible evidence.*

## Abstract

Delegating software development requires an account of what was authorized,
executed, reviewed and delivered. Apollo 2.0 proposes 14 observable controls for
that process: finite execution, durable custody, independent review of an exact
version, supported recovery and confirmed completion. The public package
contains a specification and 106 synthetic conformance checks. A private
financial-software integration subsequently delivered accepted maintenance,
validated by 10,904 application tests and 152 registered integration cases, with
two authentic non-author reviews. Its ten heterogeneous native work executions
still produced zero fully autonomous whole-lifecycle successes. This article
explains the controls through a fictional reservation example, adapts the
reasoning to financial operations and proposes a stronger evaluation method.
The available evidence supports specific tested behaviors and disclosed
maintenance delivery; security improvement and efficiency remain hypotheses.

## Where Apollo came from

You give an agent a task. It finds files, writes a patch, runs commands and says
it has finished. Later, you discover that the change never reached the intended
branch, the work item still reports an earlier state and several working
directories remain open. There was substantial activity, but you still have to
reconstruct the result.

Apollo grew out of that problem while developing financial software. A plausible
answer was insufficient when a modification could affect permissions, balances,
identities or sensitive data. The surrounding workflow needed to preserve
responsibility across sessions and explain why a particular change could be
accepted.

Several recurring difficulties shaped the design: lost task continuity,
reviews attached to an earlier version, processes whose ownership was unclear
and resources left behind after work stopped. Each raised a practical question.
Who owns the objective? Which effects are authorized? What original evidence
survives interruption? How can another session continue without inventing a new
history?

The name has a personal origin. Apollo was the dog who kept the project's
creator company through long nights of work. The repository carries his name
in his memory, as explained in the [public README](../../README.md).

Version 2.0 turns those lessons into a project-independent control specification.
Adoption does not require the originating application, its board service, a
particular model provider or a specific agent runtime. A team supplies its own
adapters and proves the capabilities it claims. The
[normative standard](../12-apollo-2-standard.md) defines the requirements; the
[operational case](../13-operational-case.md) describes one integration and its
limits.

## Why financial software needs these boundaries

A deployment rollback may restore source code while leaving an external effect
untouched. Money might already have moved, a customer might have received
another tenant's data or a provider might have accepted an instruction. This
makes authority, integrity, confidentiality and availability concrete engineering
concerns.

Two layers share responsibility. The application protects its operations through
authorization, durable state, concurrency handling and provider reconciliation.
The development environment controls who may propose changes, which tools may
execute them and what evidence permits delivery. Apollo primarily addresses the
second layer. It can require adversarial tests of the first; it cannot supply
their missing implementation.

### Authority: authentication is only the beginning

A valid user session does not authorize access to every account. An API that
accepts an object identifier must check whether the caller may perform that
action on that object. OWASP's account of broken object-level authorization
explains why changing an identifier can expose or modify another user's data;
an unpredictable identifier does not replace authorization.
[OWASP API1:2023](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/).

For a hypothetical fintech change, useful acceptance evidence would include
attempts by one organization's user to read, modify and retry another
organization's operation. A successful request by the rightful owner alone
would not establish tenant isolation.

Development authority has a related boundary. Tool access is a capability,
while permission to use it for this objective is an authorization. A task to
repair a form should not acquire authority to alter production settings because
the same terminal can reach them. The execution adapter needs enforceable
permissions consistent with the owner's scope.

### Integrity: an unknown outcome can produce a duplicate effect

Suppose a service persists a request and then loses its response. The caller
sees a timeout, but the service may have succeeded. Repeating the request under
a new identity could create a second effect.

The system therefore needs an explicit unknown state. Unknown is neither proof
of failure nor permission to announce success. Recovery examines attributable
state before deciding what may happen next. The same reasoning applies to a
development merge, job launch or resource transfer whose response was lost.

Apollo's durable records are intended to preserve that distinction. Application
idempotency, database transactions and external-provider reconciliation remain
separate mechanisms. A development record stating that a test passed cannot
make a financial operation idempotent.

### Confidentiality: evidence needs a data boundary

Useful traces can also create sensitive copies. Commands, tool responses and
conversation context may contain customer information or secrets. An integration
should retain the minimum material needed to verify the result, redact
unnecessary values, control access and define retention.

For example, an authorization test can retain the caller's synthetic role, the
resource's synthetic tenant and the observed refusal without exporting a real
customer record. A public case can report executed counts and failure categories
while keeping raw private evidence under controlled custody.

Evidence quality depends on both authenticity and appropriate disclosure.
Publishing every input is not a prerequisite for accountability; an unverifiable
summary should still disclose its limits.

### Availability: execution must fit the environment

An agent can exhaust a shared machine by spawning more processes, running
several large suites or accumulating working copies. A controller that keeps
retrying also consumes time needed for review and cleanup.

Finite budgets need enforcement before effects: enough capacity for the next
launch, a fixed cutoff, a bounded number of attempts and a reserve for required
verification. A restart must retain previous charges. Resource ownership
matters as much as resource count: reclaiming capacity must preserve other
people's work.

These controls create testable admission and closure conditions. Their effect
on throughput or incident rates needs measurement in the actual environment.

## What the harness contributes

A model proposes actions. The software connecting it to files, tools, processes
and permissions executes them and returns observations. That surrounding
environment is commonly called a harness.

Apollo asks the harness to make consequential transitions observable. Before
work starts, it retains an immutable intent. During execution, it records the
actual command, input, source, deadline and attributable process or remote job.
Before admission, it checks current validation and original independent
reviews. After delivery, it reconciles the work item and closes owned resources
with preservation evidence.

The owner authorizes the objective and sensitive effects. The coordinator
maintains scope and custody. An executor implements within declared paths.
Independent contexts assess the candidate; an integrator verifies admission
and delivery. One person or tool may perform several operational roles, but an
implementing context cannot approve its own change.

A policy document helps explain these rules; the adapter must enforce the
relevant boundaries. A request embedded in a source file, log or external
response remains task data. Saving it in memory does not grant it authority to
change recipients, reveal secrets or relax approval.

This architecture also separates a worker ending, a finite attempt ending and
the owner's objective being completed. An unsuccessful attempt can be terminal
while the objective remains unfinished. Continuing accountability does not
authorize unlimited retries or renewal of an expired budget.

## What the research supports

Empirical results about coding assistants depend on the assistant, participants,
tasks and security measurements. Perry and colleagues studied an older coding
assistant on security-related tasks. Assisted participants produced less secure
code overall and were more likely to believe their code was secure.
[Perry et al., version 3](https://arxiv.org/abs/2211.03622v3).
That result motivates scrutiny of confident output, but does not establish how
every current model performs.

Sandoval and colleagues studied 58 student programmers implementing a linked
shopping-list structure in C. They reported a relatively small security effect
in that setting.
[Sandoval et al., version 4](https://arxiv.org/abs/2208.09727v4).
The population, task and measurement differ from the Perry study. Treating
the two findings as interchangeable universal claims would lose those conditions.

Neither study evaluated Apollo, autonomous whole-lifecycle development or this
financial-software integration. They cannot supply a measured effect size for
the controls described here.

Our design hypothesis is narrower: explicit authority, original evidence and
bounded recovery may reduce specified workflow failures. Examples include
accepting stale approval or repeating an effect with an unknown outcome.
Testing that hypothesis requires a comparison with defined outcomes. It must
remain possible for a study to find no improvement, an unfavorable trade-off
or an inconclusive result.

## A scoped threat model

The following table describes failures an adopter should evaluate. These are
design scenarios, not a list of incidents established by the public reference.
The environment includes authorized developers, development agents, external
content and tools with potentially sensitive capabilities. Application and
provider boundaries require their own enforcement.

| Property to protect | Failure scenario | Related Apollo control | Additional integration evidence |
|---|---|---|---|
| Tenant isolation | A change permits another tenant's operation | Scope, independent review, behavioral verification | Backend authorization failures under hostile callers |
| Operation integrity | An unknown effect is blindly repeated | Durable state and recovery | Persisted state, idempotency contract and concurrent tests |
| Sensitive information | A tool or trace exports unnecessary private data | Bounded authority and provenance | Access, network, redaction and retention enforcement |
| Owner authority | External content redirects the task | Immutable intent and human control | Tool-side authorization and prompt-injection cases |
| Review validity | A different candidate is accepted | Exact-version review and current admission | Authenticated reports, source observations and forge enforcement |
| Owned resources | Cleanup damages foreign work or leaves owned resources alive | Process custody, finite limits and closure | Fresh identity, preservation receipts and actual removal |

OWASP describes indirect prompt injection through external material such as
files or websites. An agent can encounter such content during an otherwise
authorized task.
[OWASP LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).
Our design response is to keep content separate from authority and enforce
permissions outside the model. Logs and deadlines alone do not prevent an
adverse instruction.

OWASP also associates excessive agency with unnecessary functionality,
permissions or autonomy.
[OWASP LLM06:2025](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/).
The correspondence with Apollo is an engineering interpretation: scoped tools,
bounded effects and required human decisions can constrain what an unexpected
output is allowed to cause. Each adapter still needs adversarial evaluation.

## A worked example: canceling a reservation

Consider a fictional service in which a customer wants to cancel a reservation
from the existing account page. The following six stages illustrate the
contracts; they are not a reported execution of the public package.

### 1. Turn the request into a verifiable agreement

The owner asks for a cancellation button on the reservation page. Before editing,
the coordinator records the objective and acceptance conditions:

- A customer can cancel only a reservation they are authorized to manage.
- An eligible reservation changes from active to canceled and stays canceled
  after a reload.
- Repeated clicks do not create inconsistent state or repeated side effects.
- The existing reservation page displays the result and an understandable error
  when cancellation is refused.
- Applicable checks pass, the reviewed change reaches the agreed development
  target and the declared delivery and closure effects are confirmed.

The agreement also specifies how already canceled, completed or otherwise
ineligible reservations behave. Without those decisions, a test may encode an
unintended business rule.

The immutable intent names the repository, branch, comparison base, allowed
files, owner, implementing contexts, risk and finite limits. For illustration,
the executor might own the reservation page, its service operation and their
tests. Payment-provider behavior would remain outside this task's scope.

A stable work-item identity binds later sessions to the same agreement. If a
session restarts, it resumes the existing objective and spent history. If
implementation reveals a missing refund requirement, the coordinator raises
that scope decision rather than silently adding a financial workflow.

### 2. Assign responsibility and separate review

One executor implements the feature. The coordinator remains accountable for
the delivery conditions; an independent context reviews the resulting candidate.
If the task includes sensitive authorization or enforcement changes, Apollo
requires two distinct independent review contexts.

The executor first adds a failing test showing that an unauthorized customer
can cancel someone else's reservation, then repairs the relevant authorization
path. The reviewer examines whether the test reaches that path and whether the
permission matches the intended operation. A failure caused only by an
unrelated missing dependency would not reproduce the authorization defect.

Review records bind the exact candidate head and comparison base, the original
verdict, reviewer identity and gate results. If a later fix changes the candidate,
the earlier approval remains historical. It cannot approve the new bytes.

A coordinator or executor who implemented any portion of the change belongs in
the author exclusions. Copying an approving report into another context does
not create a second review. Separate contexts provide another opportunity to
detect a defect, but do not establish statistically independent errors: two
reviewers can share the same mistaken assumption.

Parallel implementation is justified only when scopes are disjoint and capacity
is available. A small cancellation feature generally needs one executor.

### 3. Give the task finite autonomy

Before launch, the integration fixes limits for attempts, time, output, disk
and registered resources. It also reserves capacity for verification and review.
The exact numbers belong to the project; the principle is that the next effect
must be admissible within known remaining capacity.

A launch is charged before execution. If the regression fails, a bounded
diagnosis-and-fix cycle may follow. Repeated failure from the same cause reaches
the declared circuit breaker, at most three such fix cycles under the standard.
Restarting a session does not refund attempts or move the original cutoff.

Suppose the task uses a Git worktree. Its inventory binds owner, branch and
working directory, and admission checks both count and disk capacity before
creation. The worktree helps separate changes; filesystem and network
permissions still need their own sandbox boundary.

The deadline must account for the entire required path. A budget that fits
editing but excludes the shared test queue, review and cleanup cannot establish
whole completion. If the remaining time cannot support the next required stage,
the controller should preserve the unfinished result and explain the refusal.

That refusal is an observable outcome. It does not automatically justify
launching a replacement actor or extending the same attempt.

### 4. Preserve evidence that makes recovery possible

Imagine a test command loses its connection. The coordinator needs to distinguish
a completed command, a command still running and an unknown outcome. It retains
the original input, command, source and process or remote-job identity, then
consults that attributable execution before retrying.

For a local process, a numeric PID is insufficient by itself: the operating
system can reuse it. Live cancellation authority needs a fresh match of PID,
birth, group and task custody. A historical receipt can establish what the
earlier process did without authorizing a signal to the current occupant of
that number.

The same logic applies when exercising the reservation service. If the response
is lost after persistence, the test should query the reservation's state before
issuing another effect. A controller should retain the unknown observation
until a supported read resolves it.

Records also distinguish configured runtime information from observed identity.
A launch configuration names the requested model or execution environment;
the observed backend is reported only when exposed and authenticated. Missing
metadata remains unknown.

Recovery preserves original failures and receipts. It should not rebuild a
successful record with a new timestamp and present it as the original result.
The purpose is continuity of evidence, not a cleaner-looking history.

### 5. Verify the behavior and complete delivery

Verification follows the customer's existing click path. An authorized customer
opens the reservation page, cancels an eligible reservation and reloads it.
The canceled state persists. A second customer's direct API attempt is refused;
a repeated cancellation has the declared harmless or explicit refusal behavior.
An ineligible reservation follows the agreed rule.

These observations test different properties. A unit test may check a state
transition, a backend test may check access and concurrency, and a browser
check may establish that the existing screen uses the repaired operation.
A new parallel page would leave the original request unresolved.

Current validation and independent review must describe the same candidate.
Immediately before integration, the adapter observes the repository, head,
base and applicable CI, then requests a merge pinned to the reviewed head.
It confirms the actual merge and any required deployment separately.

Whole completion also requires authoritative work-item reconciliation, safe
owned-resource closure and any declared received notice. Cleanup retains needed
commits, uncommitted changes and ignored evidence. Both the physical directory
and Git registration must be accounted for. A successful send operation is
insufficient when the contract requires the recipient to have received notice.

The customer feature may work while one of these delivery terms remains open.
Apollo requires reporting that remaining term instead of collapsing all stages
into a single success message.

### 6. Turn a failure into reviewed knowledge

Suppose the double-click test exposes a race. The lesson records the observed
sequence, confirmed cause and proposed corrective rule. It might recommend a
concurrency test for operations sharing that state-transition pattern.

The lesson begins as proposed. Independent review determines whether the
evidence supports promoting it into shared memory or policy; later evidence
may supersede it. A single local incident should not become a universal
provider guarantee.

A useful record preserves the failure and why the repair worked under the
tested conditions. It also names applicability: a reservation transition is
different from an external payment effect. The next task can consult the
reviewed rule without assuming the two systems share every contract.

This is learning through maintained knowledge and governance. It does not
mean automatically updating model weights. Nor can an instruction discovered
in an external response become trusted merely because it was retained.

The six stages leave a chain from authorized intent to observed behavior,
accepted source, confirmed delivery and reviewed lessons. Missing evidence
remains visible at the stage where it belongs.

## Adapting the example to a financial operation

Now consider a fictional sandbox operation: a customer requests a transfer,
the service persists it and the response is lost. The customer retries. The
acceptance objective is to preserve the same economic intention without
creating a second effect within the declared identity and retention window.

That requires a precise application contract. A possible set of invariants is:

- The same tenant, operation intent, idempotency key and payload produce at
  most one economic effect within the supported window.
- Reusing that key with a different payload is explicitly refused.
- A caller cannot inspect or replay another tenant's operation.
- An unknown provider outcome is reconciled before another effect is authorized.
- Repeated or out-of-order notifications follow declared state-transition rules.

These are proposed properties for the hypothetical service. Implementing them
may require a tenant-scoped uniqueness constraint, transactional reservation
of the key, durable operation states and provider-specific reconciliation.
The retry and retention behavior of the actual provider must be validated;
a local key does not imply a universal exactly-once guarantee.

Tests should inject failures at consequential boundaries. Two simultaneous
requests with the same key examine concurrency. Losing the response after
persistence examines ambiguity. Replaying a notification examines event
deduplication. Delivering events out of order examines transition integrity.
A hostile caller examines authorization independently of those retry properties.

Each case needs a defined starting state, controlled sequence and observable
effect count or state. A test that checks only the response code could miss
a duplicate ledger entry. Conversely, a service refusing an unauthorized request
before reaching the intended retry path would not test the retry mechanism.

Apollo can make these tests mandatory delivery evidence, retain their actual
commands and results and require sensitive-change review. The application and
sandbox integration must demonstrate the economic invariants. Public synthetic
orchestration checks cannot establish them.

This separation also prevents a dangerous inference: reviewed source is not
permission to move production money. Irreversible effects and production
promotion require their own bounded human authorization.

## The public package and its 14 controls

Apollo 2.0 publishes a normative specification, a portable local validator,
synthetic fixtures, adversarial tests and adoption documentation. Earlier
chapters describe historical experience; the current normative chapter prevails
where their examples differ. The package does not ship a live autonomous
controller or a production forge adapter.

The controls can be read as questions with observable answers. This is a
reader's summary; the [standard](../12-apollo-2-standard.md) defines their exact
requirements and failure actions.

| Control | Question an integration must answer |
|---|---|
| A2-01 Scope | What immutable objective, paths and effects were authorized? |
| A2-02 Ownership | Who retains task custody, and who actually implemented it? |
| A2-03 Limits | Were finite charges and reserves enforced before effects? |
| A2-04 Process | Which attributable process or job executed the real input? |
| A2-05 State | What succeeded, failed or remained unknown? |
| A2-06 Recovery | What was observed before retry, adoption or retirement? |
| A2-07 Provenance | Which runtime details are configured, observed or unavailable? |
| A2-08 Review | Did distinct non-author contexts approve this exact head and base? |
| A2-09 Verification | Did applicable checks execute the changed behavior and failures? |
| A2-10 Admission | Was current admission checked and actual delivery confirmed? |
| A2-11 Done | Were the work item, owned closure and required receipt reconciled? |
| A2-12 Learning | Was an evidence-backed lesson independently reviewed? |
| A2-13 Human control | Did sensitive effects retain their required human authority? |
| A2-14 Adoption | Which controls and runtime capabilities were demonstrated? |

The reference uses two conspicuously fictional projects, Cedar and Harbor.
Their provider identities, process records, reviewer reports and effects are
synthetic. The public suites contain 77 Python checks and 29 dependency-free
Node checks: 106 synthetic checks, with zero skips in the reported successful
runs. These counts describe executed checks, not independent tasks or completed
live lifecycles.

Structured records replace retired marker-only approval examples. A hash detects
a difference from a protected original; it does not prove that the original is
truthful. The caller must authenticate actual authorization, reviewer execution,
source identity and remote effects. A fabricated evidence set can satisfy local
syntax while failing that trust requirement.

The [reference coverage table](../../examples/fleet/README.md#exact-coverage-boundary)
identifies what the parser checks and what remains the integrator's job.
Review mode and completion mode inspect local contracts. Neither launches a
model, merges code, removes resources or observes a real recipient.

## What the operational case actually established

The private integration case is a sanitized maintainer report, not a controlled
experiment or a publicly reproducible dataset. It includes source changes,
shared-host constraints, target movement and maintainer interventions. A native
work execution means an actual worker execution through the integration's model
runtime. Admissions refused before launch and reviewer executions are separate
categories.

The final accepted maintenance candidate passed five current gates: preflight,
lint, application verification, build and the registered integration job.
Application verification passed 10,904 tests across 739 files; the job executed
152 of 152 registered cases. Both had zero skips. Two distinct non-author
contexts returned authentic favorable reviews, with no canonical R11 finding.
Development delivery was accepted at **2026-10-09T01:39:22Z**.

Those results demonstrate reviewed maintenance on the accepted candidate.
They are separate from the public synthetic checks, and overlapping suites must
not be added as independent observations.

The lifecycle history remains **ten heterogeneous native WORK executions and
zero fully autonomous whole-lifecycle successes**. All three original renewals
and the final five credits are exhausted. Later maintenance acceptance did not
refund spent attempts, replace their deadlines or establish a new trial.

At **2026-10-09T02:00:14Z**, normal explicit reconciliation released claim and
registry custody. The budget remained unchanged and the delivery flag remained
false. Administrative release did not establish authoritative work-item
delivery acceptance.

At **2026-10-09T02:09:15Z**, the owned directory and Git registration were
confirmed absent through maintainer intervention. Normal Git removal had
deregistered the worktree but returned a directory-not-empty result. The
maintainer preserved the remnants in a private archive, verified preservation
and completed physical cleanup. An initial archive-comparison failure remains
part of the record.

The original work-item delivery acceptance and reserved completion-notice
receipt remain unverified. Observed operator cleanup is real evidence of closure,
but does not retroactively convert the finite executions into autonomous
lifecycle successes.

### Why the interruption counterexamples matter

Independent review found concrete gaps despite earlier broad green suites.
One interruption occurred after a shared reservation journal published a ticket
but before the task journal persisted it. Subsequent drift could strand that
reservation. Recovery needed to authenticate the original intent and ticket
across both stores before releasing task custody.

A second interruption occurred after the shared journal recorded release but
before task cleanup committed. Restart then restored an old active representation
and lost the release reference. The correction updates in-memory custody only
after cleanup commits and preserves the original release receipt. Separate
checks also enforce the registered recovery generation and remaining time
before paid effects.

These were controlled disposable interruption cases, not proof for every
kernel crash or distributed schedule. They show why transitions deserve their
own tests: each operation can satisfy a local contract while their composition
strands custody or prevents progress.

Earlier episodes also exposed queue exhaustion, source-base movement, differing
execution environments and temporary validation artifacts observed before
their processes finished. The educational lesson is about evidence and
ordering. A worker's conversational success exit is not the command's exit;
a passing subset is not the full gate; a transient blocker disappearing does
not justify advancement without rechecking the current contract.

The [operational case](../13-operational-case.md) retains the fuller account.
The final figures above replace historical progress counts without erasing
the failures that led to repair.

## Cooperative concurrency has an explicit boundary

Multiple tasks should coexist without stopping unrelated development. The
private integration uses a finite FIFO reservation for cooperative attempts on
the same machine and common Git repository. Short durable transactions bind
owner, task, generation, source, target and deadline. Journal locks are released
before tests and network operations; waiting alone consumes no model launch.

The local journal has a **128-entry lifetime bound**. It is not a distributed
lock and does not exclude another machine, a manual action or an uncooperative
coordinator. Expiration alone cannot transfer active or unknown custody.

When the integrated tree changes, affected validation and review need current
evidence. Old results remain attached to the source they actually examined.
This creates a practical capacity requirement: the remaining budget must cover
target movement and renewed mandatory stages, or the next effect must be refused.

GitHub documents the merge SHA condition as a match on the pull-request head;
strict required status checks require the branch to be current with its base.
[Merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
Our inference is that a local reservation and head pin do not by themselves
establish an atomic remote-base compare-and-swap. The case's strict development
policy was activated and read back, but that observation cannot rule out every
intervening server-policy edit or prove distributed correctness.

Review independence has a similarly specific meaning: separate contexts and
author exclusion. Provider diversity may be a project's risk choice. Neither
a higher price tier nor different providers guarantees independent errors.

## How to evaluate Apollo scientifically

A specification states required behavior. A synthetic check demonstrates a
predicate under its fixture. An integration observation establishes what
happened in that execution. A causal benefit requires a comparison that can
attribute a difference to the control being studied.

A stronger evaluation would predeclare falsifiable hypotheses. Binding review
to exact source might reduce stale-approval admission under controlled target
changes. Preserving unknown effects might reduce unsupported replay after lost
responses. Enforced budgets might reduce resource-limit violations while
changing completion rates. Independent review might detect seeded defects
missed by automated checks. These are proposed hypotheses, not reported results.

### Designing the comparison

Use disposable environments and synthetic data. Specify a baseline condition
and a condition containing the control under evaluation; remove protections
only in those isolated experiments. Define legitimate tasks and injected
failures before execution, including stale review, response loss, hostile
external content and interrupted cleanup.

Keep the candidate version, task distribution, tools, permissions and runtime
configuration comparable. Randomize condition order where appropriate and
repeat equivalent tasks to observe variability. Separately label configured
model identity and authenticated observed identity; unavailable backend details
remain unknown.

Define success, failure, unknown outcome and necessary human intervention
before seeing the results. Evaluators should be separate from implementation.
Retain failed starts, abandoned tasks, recovery costs and refusals. An admission
that stops before a worker launch belongs in an admission denominator, while
an actual launch belongs in the execution denominator.

Whole completion is a conjunction: correct behavior, current verification,
independent approval, confirmed delivery, work-item reconciliation, owned closure
and required notice receipt. A successful subset cannot make the other terms
true. Report autonomous completion and completion with operator assistance
separately.

### Metrics with explicit denominators

| Proposed metric | Numerator and denominator, or measurement unit |
|---|---|
| Whole completion | Cycles satisfying every declared completion term / all initiated cycles |
| Autonomous whole completion | Cycles satisfying those terms without disallowed intervention / all initiated cycles |
| Improper admission | Unauthorized actions accepted / controlled unauthorized-action attempts |
| Defect escape | Eligible seeded-defect cases not detected before admission / all eligible seeded-defect cases |
| Review contribution | Seeded defects first detected by review after automated checks missed them / seeded defects presented to review |
| Safe recovery | Ambiguous cases resolved without duplicate effects or foreign actions / all introduced ambiguous cases |
| Resource closure | Owned resources safely closed with preservation / all owned resources requiring closure |
| Budget violations | Runs exceeding a declared limit / all runs subject to that limit |
| Human intervention | Necessary and avoidable interventions / all initiated cycles, using predeclared classifications |
| Time and cost | Elapsed time to a terminal result and observed expenditure per initiated cycle, including failures and recovery |

Report resource peaks in counts and bytes, queue delay and execution time in
consistent units, and costs only when observed. Missing provider usage is
unknown rather than zero. Waiting, review, admission refusal and maintenance
need their own accounting categories; otherwise the apparent cost of a
successful task hides failed work.

Sample size should follow the effect to be detected. Report effect sizes and
uncertainty alongside averages. Repeated executions on one task, candidate or
machine may be dependent and require an analysis that respects that structure.
The private case's ten executions changed conditions, so its zero autonomous
completions are a historical count, not an estimate of a stable success
probability.

Zero observed failures in a finite sample do not establish an infallible control.
Likewise, passing many assertions cannot substitute for measuring incident
reduction. This case has no randomized control arm, incident baseline or
measured counterfactual cost. It supports no savings estimate or causal
financial-security claim.

Publication should provide task definitions, configuration, criteria and
sanitized records sufficient to challenge the conclusions. Any additional
execution study needs its own bounded authorization; the existing case does
not imply another pilot.

## Reproduction and adoption

Readers can reproduce the public local checks with Python 3.10+ and Node 20+,
using the dependency-free commands documented in the
[operational case](../13-operational-case.md#what-a-reader-can-reproduce):

```sh
python3 --version
node --version
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s examples/fleet -p 'test_*.py' -v
python3 examples/fleet/validate.py --help
NODE_OPTIONS='--max-old-space-size=4096' node --test examples/quality/ratchet-lib.test.mjs examples/loops/check-features-immutable.test.mjs
```

These commands run local synthetic checks. They do not require provider
credentials or launch development agents. Other historical examples have
separate dependencies, described in the repository. The private 152-case job
and 10,904-test application suite are not included and cannot be reproduced
from this release.

For adoption, begin with a small bounded task. Declare the project policy,
supported adapters, sensitive-change classification and completion effects.
Protect original intent and ledgers, then collect genuine receipts from
execution, review, admission and closure. Test both permitted operations and
refusals, including interruption between durable transitions.

A conformance claim should name the standard version, project, implemented
controls, evidence period and unsupported capabilities. Declaring a control
or passing its local schema test does not demonstrate the runtime effect.
When an adapter lacks a required capability, narrow the claim and preserve
the refusal.

Documentation and examples are available under the [MIT license](../../LICENSE).
Private logs and customer context are not part of that release. A useful
contribution is a reproducible counterexample, a tested adapter boundary or
an independently reviewed improvement to a control.

## Why make it public, including for US teams?

A public specification gives developers and organizations a vocabulary for
asking what an agent was permitted to do and how a result was accepted.
For US teams, the proposed benefit is practical: inspectable contracts and
examples can support evaluation, supplier discussions and internal development
governance without requiring the originating platform.

NIST's Secure Software Development Framework **version 1.1** describes
high-level practices that organizations can incorporate into their software
development lifecycles. Apollo's intent, source custody, validation and reviewed
lessons can contribute evidence to an organization's own assessment.
That correspondence is our engineering interpretation, not a finding that
adoption satisfies the framework.
[NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final).

NIST AI RMF 1.0 organizes risk management through GOVERN, MAP, MEASURE and
MANAGE. The following mapping is also our interpretation.
[NIST AI RMF 1.0](https://doi.org/10.6028/NIST.AI.100-1).

| Function | Candidate evidence from a development integration |
|---|---|
| GOVERN | Accountable roles, bounded authority, author exclusions and preserved refusals |
| MAP | Project scope, affected users, sensitive effects and unsupported capabilities |
| MEASURE | Exact-source checks, executed/skipped counts, original reports and adverse cases |
| MANAGE | Finite recovery, explicit unknown states, guarded closure and reviewed corrective rules |

NIST describes the AI RMF as voluntary.
[NIST AI RMF overview](https://www.nist.gov/itl/ai-risk-management-framework).
Apollo adoption is not certification, regulatory approval, endorsement or a
determination of financial compliance. Organizations retain their domain,
security and legal assessment responsibilities.

The public-benefit objective is to let teams examine the controls, reproduce
their local cases and publish evidence about where they work or fail. Broader
adoption, incident reduction and economic benefit have not been established.
Making the proposal open allows others to test those questions.

Apollo aims to make a delegation intelligible from its authorized beginning
through its actual outcome. The contribution available now is a full control
specification, reproducible local checks and an operational case that preserves
both accepted maintenance and incomplete lifecycle acceptance.

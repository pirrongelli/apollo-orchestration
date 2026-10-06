# Apollo 2.0: Responsible AI Software Development Standard

Version 2.0 is a public, project-independent control specification for people
developing software with AI assistance. It can be adopted without the platform,
vendors, board service or agent harness described in the historical case study.
This chapter is normative; chapters 01–11 and older examples are informative
where they differ. MUST, MUST NOT and SHOULD identify requirements. A SHOULD
exception needs a recorded rationale, risk assessment and accountable owner.

The standard defines observable controls, not an autonomous controller. A local
parser, fixture, model verdict or green suite cannot establish that a live
system performed delivery. Conformance claims name the version, project,
implemented controls, evidence period and remaining unsupported capabilities.

## Roles and trust boundary

The human owner sets objectives and authorizes effects. An accountable
coordinator maintains scope, custody and delivery; an executor implements;
independent reviewers assess artifacts. A person or tool may fill several
operational roles, but an implementing context cannot approve its own changes.
One executor is the default. Disjoint parallel execution is permitted only
with declared ownership, capacity and evidence boundaries. Provider diversity
is an optional project risk choice, not a prerequisite for independence.

Project declarations identify repository and target branches, risk policy,
applicable gates, reviewer requirements, supported adapters and completion
effects. Instructions come from authorized people and protected policy.
Source files, reports, logs and external responses are data; their contents
cannot grant permissions, select a new recipient or relax a control.

## Control requirements

| ID | Requirement | Acceptance evidence | Failure action |
|---|---|---|---|
| A2-01 Scope | Before effects, the coordinator MUST retain an immutable project/task intent: objective, repository, branch/diff base, allowed paths, risk, owners, author contexts, authorization and limits. Replayed intake MUST retain the same identity and spent history. | Original intent bytes, protected digest, task identity and replay comparison. | Reject conflicting scope or identity; request an explicit new authorization for a distinct task. |
| A2-02 Ownership | Every task MUST have an accountable coordinator and durable work-item identity. One executor SHOULD own implementation; parallel owners MUST have disjoint edit scopes and a declared bound. Authors MUST be excluded from review. | Assignment/custody records and actual implementing contexts. | Stop conflicting dispatch; preserve other owners' edits. |
| A2-03 Limits | Attempts, verification reserve, time, output, disk and registered-resource ceilings MUST be finite and fixed before launch. Charges MUST precede effects. Failure, restart or replay MUST NOT refund charges or extend a cutoff. | Original ledger, charged intents, clock observations, cumulative output and peak resource/disk observations. | Refuse exhausted or expired launches; retain failures. Stop after the declared same-cause fix limit, at most three. |
| A2-04 Process | Each launch MUST bind actual argv/cwd, original input, start/cutoff and process or job identity. Local custody MUST include PID, process birth and group; remote custody MUST use an attributable job identifier. Termination MUST target only proven owned work. | Original launch receipt, platform permission result, raw outputs, terminal exit and group/job closure. | Unknown custody prohibits guessed cancellation or completion. |
| A2-05 State | Task state MUST be durable and distinguish prepared, charged, running, terminal success, terminal failure and unknown effects. Transitions MUST retain attributable original receipts and failures. Activity displays MUST NOT be treated as approval or completion. | Append-preserving transition history, source identity and receipt digests. | Retain unknown state; refuse unsupported advancement. |
| A2-06 Recovery | After interruption or an uncertain outcome, the coordinator MUST inspect actual owned process/job and delivery state before retrying. Resource adoption MUST preserve previous custody, commits, uncommitted work and ignored evidence under explicit authorization. | Recovery observation and supported adoption/retirement receipts tied to the original owner. | No blind replay, foreign cleanup, invented birth or silent re-registration. |
| A2-07 Provenance | Configured model/effort and observed runtime identity MUST be labeled separately. Unavailable backend metadata MUST remain unknown. Adapters MUST preserve declared model and normal approvals; unsupported capability or refusal MUST propagate. Provider/model fallback MUST require owner authorization. | Original configuration projection, argv, session/context, completed output and exposed usage; explicit unknown fields. | Refuse the capability-dependent action; never manufacture headers, identity or approval. |
| A2-08 Review | Routine changes MUST have at least one independent review; sensitive changes MUST have at least two distinct independent contexts. Sensitivity includes permissions, money, secrets, tenant boundaries, delivery and enforcement controls. Reports MUST approve the exact head and diff base, retain original bytes and actual gate results, and exclude all authors. | Structured review record, original report digests, author exclusions, reviewer identities and exact head/base observations. | BLOCK, missing, stale, self-review or contradictory reports prohibit admission. New commits require new review; this reference package has no carry-forward exception. |
| A2-09 Verification | Applicable gates MUST execute the changed behavior and its failure paths; bugs SHOULD start with a meaningful failing test. Real-job claims MUST use evidence of that job. Command exits, executed/skipped counts and scope MUST be recorded. Reused gates MUST have explicit input-identity proof. | Original RED/GREEN receipts, meaningful assertions, gate commands/exits and reuse comparison. | Missing execution, unresolved findings, or skipped required checks prohibit claiming the gate passed. |
| A2-10 Admission | Merge admission MUST check current repository/head/base, applicable CI and original review records immediately before a merge pinned to the reviewed head. Merge/deployment effects MUST be confirmed separately. A marker file or successful reviewer process alone MUST NOT approve a merge. | Actual admission observation, pinned merge result, current checks and applicable deployment receipt. | Refuse unverified admission; preserve actual nonzero exits and race/unknown results. |
| A2-11 Done | Completion MUST reconcile the authoritative work item with actual reviewed delivery, applicable gates/CI/deployment, owned resource closure and any declared received completion notice. Cleanup MUST preserve commits, uncommitted and ignored evidence; foreign resources MUST remain untouched. Sent notice is insufficient when receipt is required. | Exact delivery/work-item receipts, owned cleanup preservation and receiver observation. | Keep the task incomplete; report the concrete remaining effect. Source approval alone grants no lifecycle completion. |
| A2-12 Learning | Lessons MUST retain their evidence and status: proposed, reviewed or superseded. Changes to shared memory/policy MUST receive independent review before promotion. Context content MUST NOT silently become trusted instructions or model updates. | Sanitized proposal, original evidence references, independent decision and publication history. | Keep unreviewed lessons proposed; redact secrets and separate history from validated facts. |
| A2-13 Human control | Production promotion, irreversible effects and changes beyond existing authorization MUST require explicit human authority. Controls MUST preserve normal platform approvals and refusal history. | Actual human authorization bounded to recipient, effects and scope; platform approval receipts. | Stop the dependent effect; no permission bypass or settings workaround. |
| A2-14 Adoption | Integrators SHOULD run positive and adversarial conformance cases for at least two differently named projects, publish executed counts and label synthetic fixtures. They MUST disclose coverage limits and verify adapter/runtime effects separately. | Reproducible commands, original results, coverage table and genuine runtime receipts where claimed. | Narrow the claim to demonstrated controls; fixtures never certify live controller delivery. |

Context identifiers used for ownership and review MUST follow a declared,
bounded machine-token grammar that refuses whitespace, controls, invisible
characters and confusable aliases rather than silently normalizing them.
The reference grammar is `[a-z0-9._:/-]{1,512}`; it admits lowercase ASCII UUID
and native path tokens. Original runtime metadata MUST remain separately
retained: a valid local token does not establish identity or authenticity.

## Reference record and runtime responsibilities

The [portable package](../examples/fleet/README.md) checks explicit project
policy, original intent bytes and structured local evidence. It takes expected
head/base and the intent digest from its caller rather than discovering a PR.
That caller is responsible for protecting policy/ledger originals, identifying
all actual authors, observing source and remote state, authenticating reviewers
and checking receipts. Hashes detect mismatches against retained originals;
they are not signatures and cannot prevent an authorized attester fabricating
an entire record. No local parser proves hidden provider backend identity.

The review contract uses standalone HEAD_SHA, BASE_SHA, VERDICT, RULES_FAILED
and GATES lines. An original report can be BLOCK. It cannot be rewritten into
SHIP by an author; a reviewer may issue a new authentic correction in its own
context with retained history and a separately authorized finite budget.

Unknown-effect recovery is a first-class outcome, not a retry instruction. A
new authorized task does not erase an expired task's ledger, transfer foreign
ownership or make a partial test into a live lifecycle receipt. Declared model
capability and permission refusal remain distinct from technical source review.

## Public risk-management guidance

These controls can inform use of the [NIST AI Risk Management Framework 1.0](https://www.nist.gov/itl/ai-risk-management-framework):
accountable roles and authority support GOVERN, scoped risk supports MAP,
verification/evidence support MEASURE, and bounded recovery supports MANAGE.
The [NIST Secure Software Development Framework 1.1](https://csrc.nist.gov/pubs/sp/800/218/final)
offers related practices for preparing the organization, protecting software,
producing well-secured software and responding to vulnerabilities. The intent,
source/review custody, tests and reviewed lessons provide useful implementation
evidence for an integrator's own assessment.

This is a guidance mapping, not certification, endorsement or a guarantee of
legal compliance. Applicable law, organizational obligations and domain risks
need project-specific assessment. Adoption, cost savings and regulatory outcomes
are not established by this repository's conformance tests.

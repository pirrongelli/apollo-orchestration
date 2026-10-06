# Portable local conformance reference

This small Python 3.10+ standard-library package implements a **subset** of
[Apollo 2.0](../../docs/12-apollo-2-standard.md). It is a validator, not a Fleet
controller, reviewer adapter, merge hook or delivery service. It performs no
network/model calls, shell execution, writes or cleanup. The test harness uses
disposable local files and subprocesses to check retired hooks and the CLI.

From the repository root:

```sh
python3 -m unittest discover -s examples/fleet -p 'test_*.py' -v
python3 examples/fleet/validate.py --help
```

The Cedar and Harbor fixtures use differently named repositories, branches,
authors and reviewers. Every provider, PID, report, receipt and remote effect
in those fixtures is **synthetic**. No reviewer or live controller performed
their claimed work. Their timestamps represent a historical completed window;
the parser can inspect historical evidence but cannot authorize a new launch
after its cutoff. Test success means local predicates behaved as specified.

## Inputs and trust

`project.json` is protected project policy: schema version 1, project ID,
repository, base branch, sensitive path prefixes, required gates and required
completion effects. Risk assessment must also cover semantic sensitivity; paths
alone cannot classify money, permissions or enforcement changes safely.

`intent.json` is original UTF-8 JSON retained **before effects**. It binds
project/repository/branch, task ID, head/base, exact allowed file paths, risk,
coordinator and all implementing contexts, authorization receipt/effects,
UTC start/cutoff and positive finite limits. Limits are attempts, verification
reserve, seconds, cumulative output bytes, peak resources and peak disk bytes.
The caller retains a protected SHA-256 digest of these exact bytes; recomputing
an anchor from a modified intent is not integrity verification.

`evidence.json` binds that intent digest and project/task/head/base. Reviews
retain original UTF-8 report text and digest, provider/context, verdict and
separate `configured_model` / `observed_model` fields. `null` means unavailable;
the parser does not attest model identity. Each original approving report has
exactly one of each line:

```text
HEAD_SHA: <full lowercase head SHA>
BASE_SHA: <full lowercase diff-base SHA>
VERDICT: SHIP
RULES_FAILED: NONE
GATES: PASS
```

BLOCK or contradictory reports cannot be admitted. The coordinator and every
implementer are excluded from review; routine/sensitive scopes require one/two
distinct contexts. Original report hashes are checked without normalizing text.
Gates include head/base, PASS, positive `executed`, zero `skipped` and a receipt
digest. A receipt digest field validates shape only; the integrator must retain,
authenticate and inspect the referenced original.

For completion, add status/finish, append-preserving charged attempts with
ordinal/role/timestamps/outcome/exit/output/process custody, peak resource/disk
observations, owned/foreign resource dispositions and effect receipts. A failed
attempt remains charged and can coexist with later completed work; unknown
attempts/effects cannot. Work cannot consume the declared verification reserve.
Each inventoried owned resource needs closed disposition and preservation of
committed, uncommitted and ignored evidence. Foreign resources must be preserved.
Required notice must be received. See the fixture files for the complete field
shape and tests for refused variations.

Complete mode requires baseline `ci`, `merge`, `work_item` and `cleanup` effect
receipts. Deployment and notice are additionally required when declared by
project policy. Unsupported completion shapes need an integrator's own tested
implementation; reducing the baseline cannot turn review-only evidence into Done.

An integrator invokes `validate.py` with explicit `--project`, `--intent`,
`--evidence`, `--intent-sha256`, `--head`, `--base` and `--mode review|complete`.
Expected head/base must come from an independent current repository/forge
observation; do not copy them out of untrusted evidence. Exit 0 prints either
`REVIEW: local contract satisfied` or `COMPLETE: local contract satisfied`.
Exit 1 prints `CONTRACT: BLOCK` for invalid evidence. Neither result launches,
approves or confirms an external effect. Review mode never claims completion.
Input files are bounded to 1 MiB; reports to 24,000 bytes. Duplicate JSON keys,
non-finite JSON values and boolean integer counters are refused.

## Other example prerequisites

The hosted conformance workflow runs this standard-library suite and the
existing dependency-free Node ratchet/feature-immutability suites. It does not
install packages or run the CRAP tests, which require TypeScript, or the Python
database CLI-parity tests, which require PyYAML. These historical examples have
separate dependency/verification boundaries; their absence from this workflow
does not waive a project's applicable production gates.

## Exact coverage boundary

| Controls | Executed here | Integrator proof still required |
|---|---|---|
| A2-01, A2-02 | Project/task/repository/base bindings, intent byte digest, path containment, context exclusions. | Protected original intent, real authorization, complete author inventory and assignment custody. |
| A2-03 | Finite declared limits, charge-before-start timestamp ordering, contiguous attempts, reserve, output/peak counters and terminal inside cutoff. | Actual clock enforcement, spend history completeness, no refunds, measured counters and pre-launch resource admission. |
| A2-04, A2-05 | Typed process identity, known outcome/exit consistency, group-closed assertion. | Original PID birth/group/job observations, actual termination and durable transition storage. |
| A2-06 | Unknown attempts/effects refuse completion; foreign resource closure refused. | Recovery observations, replay idempotency, safe adoption, complete resource inventory and original preservation receipts. |
| A2-07 | Separate configured/observed fields, unavailable metadata retained as null. | Runtime/provider authenticity, configured-model preservation, permissions, refusal propagation and adapter capability. |
| A2-08 | Exact original report hash/head/base/verdict, one/two independent contexts, strict standalone lines. | Actual reviewer independence and completed-turn provenance; source scope/risk independently confirmed. |
| A2-09 | Required gate assertions, exact head/base, positive execution and zero skips. | Meaningful tests, real job execution, authentic raw logs and reused-input identity. |
| A2-10 | Review-record predicates only. | Current forge state/CI, atomic reviewed-head pin, protected server-side admission, actual merge/deploy receipts. |
| A2-11 | Known completion/effects, task/repository/head binding, cleanup dispositions and received-notice assertion. | Real work-item reconciliation, remote delivery, complete cleanup/preservation and receiver observation. |
| A2-12, A2-13 | Authorization receipt/effect fields checked; learning publication is not implemented. | Real human authority, platform approvals and independently reviewed learning promotion. |
| A2-14 | Two synthetic project cases and adversarial local tests. | Independent source review and every claimed runtime/lifecycle control. |

## Retired marker approval

`../hooks/record-approval.sh` writes nothing and exits 2. The old marker-only
`../hooks/merge-gate.sh` is a retired refusal placeholder, not an installable
admission integration. The settings fragment no longer includes its marker
check. Historical chapters retain examples for explanation, clearly superseded
by version 2.0. A marker's existence cannot establish review.

Before adopting merge automation, implement and adversarially test your forge
adapter: protected policy and originals, live head/base/CI observation, this
structured contract, an explicit reviewed-head pin and actual terminal receipt.
Required server-side checks are needed for enforcement outside a local harness.
This repository ships no such live forge adapter and offers no alternate merge
path or approval bypass.

---
paths:
  - "functions/**"
  - "src/pages/customer/**"
  - "src/hooks/**"
---
### Financial Mutations Need Server-Side Idempotency

`useState` is **not a mutex**. React batches state updates, so two rapid
clicks can both read `submitting === false` before either
`setSubmitting(true)` flushes. This class of bug caused duplicate
withdrawals in production on this platform.

- **Frontend**: Use `useRef` as the primary dedup guard for all financial
  mutations (withdrawals, transfers, exchanges). The ref updates
  synchronously: `if (ref.current) return false; ref.current = true;`. Keep
  `useState` for UI (button disabled, spinner) but never trust it as the
  concurrency guard.
- **Backend**: Every money-moving API endpoint (`POST /withdrawals`,
  `/transfers`, `/exchanges`) must support an `Idempotency-Key` header.
  Check/reserve the key in an `idempotency_keys` table **before** calling
  the external provider. If the key exists with a stored response, return
  it. If the key exists without a response yet (a request is in flight
  concurrently), return 409.
- **A DB unique constraint is not enough**: `UNIQUE(provider_transaction_id)`
  prevents the same transaction ID from being saved twice, but two duplicate
  POSTs create two **different** IDs on the provider's side. The constraint
  catches webhook replay, not duplicate creation at the source.
- **Pattern**: client generates a UUID per form submission → sends it as the
  `Idempotency-Key` header → server atomically reserves the key with
  `INSERT ... ON CONFLICT DO NOTHING` → proceeds only if the insert
  succeeded → stores the response after success.
- **Store ALL responses, success and failure**: if only successes are
  stored, a retry after a failure gets 409 "in progress" instead of the
  actual error — permanently blocking that key from ever completing.
- **`useRef` must be set inside `try/finally`**: all async code after
  `ref.current = true` must run inside the `try` block. If a call between
  setting the ref and entering `try {}` throws, the `finally` never runs and
  the ref stays `true` forever — permanently blocking that user's
  submissions.

### Dedup Guards Must Compare Status, Not Just Existence

Any guard that checks "is this ID already in the DB?" and returns early must
**also compare the incoming status** against the stored status. A later
event for the same entity can carry a different status (e.g.,
`AUTHORIZED → CANCELLED`). Skipping without checking causes silent data
loss.

- **Wrong**: `if (exists) return;` — silently drops status changes.
- **Right**: `if (exists && exists.status === newStatus) return;` then
  `if (exists) { update status; return; }`.
- **Terminal status guards**: block regressions (`COMPLETED → PENDING`) but
  allow terminal→terminal transitions (`COMPLETED → CANCELLED`). Pattern:
  `if (terminal.has(old) && !terminal.has(new)) return;`.
- **A ledger transaction ID is not the same as the parent order/withdrawal
  ID.** Cancellation events from a provider commonly key off the provider's
  internal ledger entry ID, not the ID your system generated for the parent
  request. Match via the field the provider actually correlates
  (`category_id`, `reference`, etc.), not via the ledger ID directly.

### Local Balance Is Stale — Fetch Live for Validation

A locally cached account balance only updates on webhook events, a
periodic sync cron, or manual refresh. Deposits arriving between syncs
aren't reflected. **Never use the locally cached balance as the source of
truth for pre-validation checks.**

- Fetch a live balance from the provider before balance comparisons in
  exchanges, withdrawals, transfers, and payments.
- The cached balance is acceptable for display hints (e.g., inline
  "Available: X" text) but not for blocking decisions ("Insufficient
  balance" error).

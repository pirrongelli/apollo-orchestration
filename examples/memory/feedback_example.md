---
name: client-state-not-a-concurrency-guard
description: A double-click created a duplicate payment because the submit
  guard was client-side render state — use a synchronous ref plus a
  server-side idempotency key on every money-moving mutation
type: feedback
---

# Client-side state is not a concurrency guard

On 2026-02-18 a user double-clicked "Send payment" and two payments were
created. The form's submit handler checked a `submitting` boolean held in
render state and set it to `true` on entry — but UI frameworks batch state
updates, so both clicks read `submitting === false` before either update
flushed. The guard looked correct in code review and passed every test,
because tests click once.

**Why:** Render state updates are asynchronous by design; there is a window
between "read the flag" and "the flag is visibly set" in which a second
event handler runs with stale state. Any guard built on asynchronous state
has this window. The same mechanism bites debounced saves, wizard
next-buttons, and anything else where two rapid events are possible — but
it only becomes an incident when the action moves money.

**How to apply:**
- Frontend: guard financial mutations with a synchronously-updated ref
  (`if (ref.current) return; ref.current = true;`), reset in a `finally`
  block. Keep the render-state boolean for the spinner only — never as the
  guard.
- Backend: the frontend guard is defense-in-depth, not the fix. Every
  money-moving endpoint accepts an `Idempotency-Key` header; the client
  generates one UUID per form submission; the server reserves the key
  atomically before calling the vendor and replays the stored response on
  retry. See [[payvendor-response-envelope]] for the vendor call this
  protects.
- Tests: every financial mutation gets a rapid-double-invoke test that
  asserts exactly one downstream call.

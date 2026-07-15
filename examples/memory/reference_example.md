---
name: payvendor-response-envelope
description: PayVendor wraps every response in an extra data envelope
  (payload at response.data.data) and returns UPPERCASE statuses that must
  be lowercased before inserting into our status enum columns
type: reference
---

# PayVendor API: double envelope and uppercase statuses

Discovered 2026-02-11 while debugging "undefined account id" errors: our
HTTP client already returns parsed JSON under `data`, and PayVendor *also*
nests its payload under a top-level `data` key. The real fields therefore
live at `response.data.data`, not `response.data`. This applies to every
PayVendor endpoint — single resources and lists alike.

Verified against the PayVendor sandbox (not just the docs):

- **Unwrap everywhere:**
  `const payload = response.data?.data ?? response.data;`
  Never destructure fields off `response.data` directly.
- **List keys vary by resource.** Lists nest under a resource-named key
  inside the envelope: `data.data.accounts`, `data.data.payments`, etc.
  Route all list responses through the shared normalizer helper rather
  than writing ad-hoc `x?.accounts || x?.data` chains.
- **Statuses are UPPERCASE** (`ACTIVE`, `FROZEN`, `CLOSED`), while our DB
  status enums are lowercase. Always `.toLowerCase()` before insert — a
  raw insert throws an enum violation only in the environments that have
  the constraint, so the bug hides in dev.
- **Missing optional fields come back as `null`, not absent.** Presence
  checks must use `!= null`, not `!== undefined`.

**How to apply:** never write a new PayVendor integration from the docs
alone — capture one real sandbox response first and code against that.
Money-moving calls to this API additionally need the guard in
[[client-state-not-a-concurrency-guard]].

---
paths:
  - "functions/**"
---
**Serverless function auth patterns:**

- Public/programmatic APIs use **API key auth** (`x-api-key` header) — for
  external integrations calling in from outside the platform.
- UI-facing internal functions use **session JWT auth**
  (`supabase.auth.getUser()` or equivalent) — for the frontend calling its
  own backend.
- Never mix these patterns in the same function. If a table has no
  row-level policy for the caller (e.g., a table that hides a signing
  secret from direct client reads), the frontend must go through a
  session-auth function, not a direct table query.

**A client that calls an external provider directly (bypassing your own
proxy layer) has extra obligations:**

- If one function's provider client (`_shared/providers/<name>/client.ts`)
  calls the provider's API directly via `fetch()` instead of routing through
  a shared proxy function, any payload transformation logic added to the
  proxy's normalizer must be **manually ported** to that direct client too.
  Two code paths that both talk to the same provider will drift silently if
  only one gets updated.
- Many providers wrap every response in an envelope
  (`{ data: { actual_payload } }`). Always unwrap explicitly:
  `const inner = (result.data as Record<string, unknown>)?.data ||
  result.data`. Don't assume the shape — check a real response first.
- Field name mappings between your internal field and the provider's
  nested field (e.g., `name` → `profile.name` for a PATCH) must be done in
  the handler, not assumed to pass through unchanged.

**A single account/resource table holding multiple asset classes** (e.g.,
one `accounts` table storing both fiat and crypto balances) needs explicit
filtering everywhere it's queried for one class only. Webhook handlers and
approval flows that auto-create rows in a shared table don't discriminate
by type — always filter by a known list of the other class's identifiers
(a `CRYPTO_CURRENCIES` constant, or equivalent) rather than assuming the
table only contains what you expect.

**New public API endpoint checklist** — when adding an endpoint to a public
API surface, update all of:

1. The function handler (route branching + request validation schema + DB
   logic + any webhook/event delivery).
2. Public-facing API documentation.
3. Customer/user-facing API documentation (if it differs from the public
   docs).
4. Any committed API client collection (Postman, Insomnia, OpenAPI spec)
   used for manual testing.

**All customer-facing responses use local identifiers only** — webhook
payloads, API responses, and UI displays must always use your own internal
`id` column. Never expose the external provider's own ID for the same
resource. External IDs are for internal reference and provider
communication only; leaking them gives integrators a foothold to reason
about (or hit) the provider's API directly.

**API response format:**

```typescript
interface ApiResponse<T> {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: { pagination?: { page: number; limit: number; total: number } };
}
```

### Runtime Lint (Serverless Functions)

If your serverless runtime has its own linter distinct from the one used by
the rest of the frontend (e.g., Deno's built-in linter for Deno-based
functions), treat it as a separate, mandatory gate — the frontend linter's
config typically excludes this directory entirely, so nothing else catches
these issues:

- Unused destructured variables must be prefixed with `_`:
  `const { secret: _secret, ...safe } = obj;`.
- Use the runtime's inline suppression comment (e.g.,
  `// deno-lint-ignore no-explicit-any`) sparingly and only with
  justification.
- Run the runtime's own lint task from the functions directory — it is not
  covered by the frontend's lint command.
- If a function under test calls a server-start primitive (e.g.,
  `Deno.serve()`) at module scope, tests that import it will need broad
  permissions even if they never open a real listener.

**File structure:** each function gets its own directory under
`functions/`; shared logic goes in `_shared/`. Keep functions small and
focused — split when one starts doing too much.

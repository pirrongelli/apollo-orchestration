---
paths:
  - "src/**"
---
### Trace the Full Path Before Writing Integration Code

When two functions communicate (e.g., function A calls function B), **read
function B's actual implementation** before writing the call. Don't assume
it accepts your parameters or handles your data the way you expect.

- **Verify the callee's contract**: if you send `event_type: 'test.ping'` to
  a function that filters by `.contains('event_types', [event_type])`, your
  event will never match. Read the filter logic, not just the function
  name.
- **Reuse existing error handlers**: before writing `if (error) throw
  error;`, search the codebase for an existing error-extraction utility
  (e.g., `extractApiError`). A raw thrown error's top-level `.message` is
  often generic — the real message is nested in `error.context` or
  equivalent.
- **Never `.sort()` a React state array in place**: `.sort()` mutates.
  Always copy first: `[...array].sort()`. This applies anywhere state is
  compared or transformed during render.
- **Early returns skip sibling JSX**: if a component does
  `if (condition) return <A />;` then `<B />` written after it never
  renders. Dialogs, modals, and portals that respond to shared state must
  render unconditionally — use conditional *content*, not a conditional
  `return`.
- **Delete dead exports immediately**: if you define a constant and only
  one consumer exists, verify it's actually imported. Unused exports are
  confusing signals about what's canonical.

### Shared Components: Add Props, Don't Change Defaults

Never change the default behavior of a shared/reusable UI component to fix
one consumer's needs. Add an opt-in prop with the existing behavior as the
default, and let the specific consumer enable it.

- **Wrong**: change a shared `Stepper`'s `isClickable` logic globally to
  allow future-step navigation.
- **Right**: add an `allowFutureSteps` prop (default `false`); the one
  consumer that needs it passes `allowFutureSteps` explicitly.

### External API Status Checks: Reject-Lists Over Allow-Lists

When verifying if an external API action succeeded, use a reject-list of
known failure states rather than an allow-list of known success states.
External APIs may omit status fields, return new values, or rename fields
without notice.

- **Reject-list**: `const failed = ['INCOMPLETE', 'REJECTED'].includes(status)`
  — missing/unknown status is treated as success.
- **Allow-list**: `const ok = ['SUBMITTED', 'PROCESSING'].includes(status)`
  — missing/unknown status is treated as failure. This is the wrong default
  for most integrations.
- Check every field name an API is documented to use inconsistently (e.g.,
  `application_status || status`) rather than picking one.

### Route Renames: Complete Legacy Redirects

When renaming route paths, add redirects for **all** variations — not just
the index route. Preserve path parameters and query parameters:

- **Path params**: need a component with `useParams()` to forward them
  (e.g., `/old-customers/:id` → `/new-customers/:id`).
- **Query params**: need `useLocation().search` forwarded explicitly.
- **Index routes**: a simple `<Navigate to="..." replace />` is fine.

### Don't Introduce New Problems While Fixing Old Ones

Review your own code before committing with the same rigor you'd apply to
someone else's PR. If you just wrote a block that duplicates existing logic,
has a subtle bug, or violates a principle from this file — catch it
yourself. Don't rely on the next review cycle to find mistakes you could
have avoided by re-reading your own diff. When a result is computed from
branching logic, don't re-evaluate the same conditions elsewhere —
reference the computed result instead.

### Workflow

Always run the project's linter before committing. All new and modified
code must pass lint with zero errors. Fix lint issues inline as you write,
rather than batching fixes at the end.

### ESLint Rules

- `@typescript-eslint/no-explicit-any`: **error** — never use `any` in
  production code. Use proper types, generics, or `unknown` with narrowing.
- `@typescript-eslint/ban-ts-comment`: error (requires a description for
  `@ts-expect-error`; allows `@ts-nocheck`).
- `prefer-const`: error.
- `react-hooks/exhaustive-deps`: warn.
- **Test files** (`*.test.{ts,tsx}`, `src/test/**`): `no-explicit-any` and
  `ban-ts-comment` relaxed to off.
- ESLint ignores the build output directory and the serverless functions
  directory (which use a different runtime's linter — see
  `edge-functions.md`).

### File Size & Structure

Keep files small and focused. When building new features:

- **Components**: one component per file. If a component grows beyond
  ~150-200 lines, extract sub-components into separate files in the same
  directory.
- **Hooks vs utilities**: files in `src/hooks/` prefixed with `use` **must**
  be actual React hooks (called during render, using `useState`/
  `useEffect`/etc.). Plain async functions used imperatively (e.g., inside
  a `fetchData` callback) belong in `src/lib/` without the `use` prefix. If
  a "hook" doesn't use React hook primitives, it's a utility — move it.
- **Hooks**: each custom hook gets its own file. A hook file should do one
  thing.
- **Utilities**: group related utility functions into focused files in
  `src/lib/`. Don't add unrelated helpers to an existing util file — create
  a new one.
- **Pages**: page components should be thin orchestrators that compose
  hooks and components. Extract business logic into hooks and UI sections
  into components.

When a file starts doing too much, split it. Prefer many small,
well-named files over fewer large ones. (Serverless-function file structure
lives in `.claude/rules/edge-functions.md`, which loads when you edit that
directory.)

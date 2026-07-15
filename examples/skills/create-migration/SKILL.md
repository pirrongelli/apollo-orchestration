---
name: create-migration
description: Create safe database migrations with row-level security policies,
  correct role checks, and idempotent SQL. Use when adding tables, columns,
  indexes, enums, or RLS policies, or when modifying database schema in any way.
argument-hint: [migration-name]
---

# Create Migration

Create a database migration for: **$ARGUMENTS**

This playbook assumes Postgres with row-level security (RLS) and a
migration-file workflow (e.g. the Supabase CLI, or any tool that applies
timestamped SQL files in order). Adapt the commands to your migration runner;
the SQL rules are universal.

## Step 1: Generate the migration file

```bash
npx supabase migration new $ARGUMENTS
# or your equivalent: creates migrations/<timestamp>_<name>.sql
```

**Verify**: a new timestamped file exists in the migrations directory and is
the newest file there (ordering is how the runner sequences it).

## Step 2: Write the migration SQL

Follow these rules strictly.

### Table creation — RLS on by default

```sql
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
```

A table without RLS is world-readable the moment any API layer (PostgREST or
similar) exposes it. Enabling RLS is part of `CREATE TABLE`, not a follow-up.

### RLS policies — always DROP IF EXISTS first

```sql
-- Admin access
DROP POLICY IF EXISTS "admin_full_access" ON public.orders;
CREATE POLICY "admin_full_access" ON public.orders
  FOR ALL USING (is_admin(auth.uid()));

-- Org members read their own org's rows
DROP POLICY IF EXISTS "member_read_own_org" ON public.orders;
CREATE POLICY "member_read_own_org" ON public.orders
  FOR SELECT USING (is_org_member(auth.uid(), org_id));

-- Org-level role for writes
DROP POLICY IF EXISTS "org_editor_write" ON public.orders;
CREATE POLICY "org_editor_write" ON public.orders
  FOR ALL USING (has_org_role(auth.uid(), org_id, 'editor'));

-- Service role (backend workers bypass user-scoped policies explicitly)
DROP POLICY IF EXISTS "service_role_all" ON public.orders;
CREATE POLICY "service_role_all" ON public.orders
  FOR ALL USING (auth.role() = 'service_role');
```

`CREATE POLICY` has no `IF NOT EXISTS` clause and fails on re-run. The
`DROP POLICY IF EXISTS` + `CREATE POLICY` pair makes every policy migration
idempotent — it can be re-applied to any environment regardless of prior state.

### Use the current role-check functions — never dropped legacy ones

Role systems get consolidated over a project's life, and old helper functions
(`has_role()`, a legacy `user_roles` table, an old role enum) get dropped. A
new migration that references a dropped object passes review by looking
familiar, then fails at deploy time — or worse, gets copy-pasted from an old
migration file that predates the consolidation.

- Admin checks: `is_admin(auth.uid())`
- Plain membership (any role, including the account owner): `is_org_member(uid, org_id)`
- Specific org role: `has_org_role(uid, org_id, 'role')`
- **Never copy policy SQL from old migration files.** Copy from the newest
  migrations only — they reflect the current role system.

Membership deserves special care when it has more than one source of truth
(e.g. the account owner recorded on the organization row itself, plus invited
members in a roles table). A policy that checks only the roles table silently
locks out the owner. That is why plain membership goes through
`is_org_member()` — one function that knows all the sources — and never
through a direct query against the roles table.

### Sensitive columns

Columns holding secrets (signing keys, tokens, API-key hashes) get
service-role-only policies. Never expose them through the general API layer;
the frontend reaches them through a backend function that returns only safe
fields.

### Adding columns to existing tables

```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_external_ref
  ON public.orders(external_ref);
```

Add indexes for any column used in `WHERE` or `JOIN` — especially the tenant
column (`org_id`), which every RLS policy filters on.

### Unique indexes on external IDs — exclude empty strings

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external_ref
  ON public.orders(external_ref)
  WHERE external_ref IS NOT NULL AND external_ref != '';
```

Multiple rows may legitimately carry an empty external ID (records created
before the integration existed, or rows awaiting assignment). A plain unique
index makes the second such row fail insertion. Exclude both `NULL` **and**
`''` — data imported from CSVs and forms uses empty strings where you expect
NULLs.

### Deduplicating existing data — use ROW_NUMBER, not hardcoded IDs

When a migration must clean up duplicates before adding a unique constraint:

```sql
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY org_id, external_ref
           ORDER BY created_at ASC
         ) AS rn
  FROM public.orders
  WHERE external_ref IS NOT NULL AND external_ref != ''
)
DELETE FROM public.orders
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
```

`ROW_NUMBER()` over the conflicting columns catches **every** duplicate group.
Hardcoding the specific IDs you found in one environment fixes that
environment and breaks in every other one, where the duplicates are different.

### Enum types

```sql
-- Create idempotently
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('pending', 'active', 'closed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Adding a value cannot run inside the same transaction that uses it
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'archived';
```

**Verify**: read the finished SQL top to bottom and confirm every `CREATE
POLICY` is preceded by `DROP POLICY IF EXISTS`, every new table has
`ENABLE ROW LEVEL SECURITY`, and no dropped legacy object is referenced.

## Step 3: Test locally with a full reset

```bash
npx supabase db reset   # or: apply ALL migrations from scratch to a local DB
```

A reset replays the entire migration history, which catches two failure
classes a "just apply the new file" test misses: your migration conflicting
with earlier state, and your migration being non-idempotent. Then run the test
suite — schema changes break queries in application code, and the type errors
show up in tests before they show up in production.

**Verify**: reset completes with zero errors; test suite green.

## Step 4: Regenerate database types (typed clients)

If the project generates TypeScript (or other) types from the schema,
regenerate them now so application code compiles against the new schema.

**Verify**: type generation succeeds and the build compiles.

## Step 5: Deploy through the normal pipeline

Commit the migration file and let CI/CD apply it per environment. Do not apply
migrations to shared environments by hand unless that is explicitly your
project's process — hand-applied migrations desynchronize the recorded
migration history from the actual schema, and the *next* deploy fails.

**Verify**: the deploy pipeline's migration step reports success; spot-check
the target database (`\d public.orders` or an information_schema query) shows
the new objects.

## Gotchas

- **Always `DROP POLICY IF EXISTS` before `CREATE POLICY`** — `CREATE POLICY`
  fails on re-run; this pair is what makes migrations idempotent across
  environments.
- **Never reference dropped legacy role objects** — after a role-system
  consolidation, old function/table names linger in old migration files and in
  the model's memory of the codebase. New references fail at deploy time.
  Check the newest migrations for the current pattern before writing policies.
- **Membership checks go through the one membership function** — if
  membership has multiple sources of truth (owner on the org row + members in
  a roles table), a roles-table-only policy locks out the owner.
- **Unique indexes on external IDs must exclude `NULL` and `''`** — otherwise
  the second legitimately-blank row fails insertion.
- **Dedup with `ROW_NUMBER()` over the conflicting columns** — never by
  hardcoding IDs found in one environment.
- **`ALTER TYPE ... ADD VALUE` can't run in the same transaction that uses the
  new value** — split it into its own migration if the next statement needs it.
- **RLS gates any realtime/subscription delivery too** — if the platform
  streams row changes to clients, subscribers only receive rows their SELECT
  policy allows. Publishing a table without a SELECT policy for the intended
  viewers produces a subscription that connects successfully and silently
  delivers nothing.

## When NOT to use this skill

- **Ad-hoc data fixes on a live database** — a one-off `UPDATE` run by an
  operator is not a migration. But note: if deployed code *requires* a manual
  data fix afterward, the code has a bug — fix the pipeline, not the data.
- **Destructive changes to production data** (dropping columns/tables with
  data, irreversible rewrites) — these need an explicit human decision and a
  backup plan first; this playbook's steps are necessary but not sufficient.
- **Schema exploration** — if you're only reading the current schema to answer
  a question, query it; don't create a migration.

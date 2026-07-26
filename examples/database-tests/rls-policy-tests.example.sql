-- Row-level-security policy tests that fail for the right reasons.
--
-- Runnable as-is: it supplies the few things a hosted Postgres normally gives
-- you (a function reading the caller's id out of the request JWT, plus an
-- `authenticated` role), builds a small generic schema, and rolls everything
-- back at the end. On a managed platform the `current_user_id()` defined below
-- already exists under some other name, and the policies would call that
-- instead; it is defined locally here only so the file stands alone.
--
--   psql "$DB_URL" -c 'CREATE EXTENSION IF NOT EXISTS pgtap;'
--   pg_prove -d "$DB_URL" examples/database-tests/rls-policy-tests.example.sql
--
-- It demonstrates the three mistakes that make an RLS suite worthless while it
-- still reports green. See ../../docs/11-testing-and-code-health.md, section
-- "Security tests that pass for the wrong reason".
--
--   1. Asserting under a session that bypasses RLS. Fixtures are seeded as
--      superuser, but every assertion runs under an explicit SET LOCAL ROLE,
--      and tests 1-2 are a negative control proving the two differ.
--   2. Denial tests with nothing to deny. Test 3 only means something because
--      the non-admin owns a row that a weakened policy would expose.
--   3. Overlapping grants that mask a branch. Tests 4-5 exercise the owner and
--      membership branches with users who satisfy exactly one each.

BEGIN;
SELECT plan(6);

-- ── stand-ins so the file runs on a plain Postgres ─────────────────────────
CREATE FUNCTION current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;

-- ── schema under test ───────────────────────────────────────────────────────
CREATE TABLE tenants (
  id            uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  name          text NOT NULL
);

CREATE TABLE platform_roles (
  user_id uuid NOT NULL,
  role    text NOT NULL
);

CREATE TABLE tenant_members (
  user_id   uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  role      text NOT NULL
);

CREATE TABLE admin_preferences (
  user_id        uuid PRIMARY KEY,
  digest_enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE tenant_documents (
  id        uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title     text NOT NULL
);

-- SECURITY DEFINER so the helper can read the role tables regardless of the
-- caller's own visibility — the canonical membership check, which callers must
-- use instead of querying the role tables directly.
CREATE FUNCTION is_platform_admin(uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_roles WHERE user_id = uid AND role = 'platform_admin'
  )
$$;

-- Membership is ownership OR an explicit member row. A check that consults only
-- the member table silently misses every owner.
CREATE FUNCTION is_tenant_member(uid uuid, tid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM tenants WHERE id = tid AND owner_user_id = uid)
      OR EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = tid AND user_id = uid)
$$;

ALTER TABLE admin_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_preferences_own ON admin_preferences FOR ALL TO authenticated
  USING (user_id = current_user_id() AND is_platform_admin(current_user_id()))
  WITH CHECK (user_id = current_user_id() AND is_platform_admin(current_user_id()));

CREATE POLICY tenant_documents_read ON tenant_documents FOR SELECT TO authenticated
  USING (is_platform_admin(current_user_id()) OR is_tenant_member(current_user_id(), tenant_id));

GRANT USAGE ON SCHEMA public TO authenticated;
-- Granted per table rather than ON ALL TABLES IN SCHEMA public, which would also
-- try to grant on pgTAP's own views and emit warnings.
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_preferences, tenant_documents TO authenticated;
GRANT SELECT ON tenants, platform_roles, tenant_members TO authenticated;

-- ── fixtures, seeded as superuser (RLS does not apply here) ─────────────────
-- Two admins, so "admin sees only their own row" can fail if the policy widens.
INSERT INTO platform_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'platform_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'platform_admin');

INSERT INTO tenants (id, owner_user_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Tenant One'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b9', 'Tenant Two');

-- b2 reaches tenant c1 through membership only; b1 owns c1 and has NO member
-- row. Giving the owner a member row too would let the owner assertion pass
-- through the membership branch even after the ownership branch regressed.
INSERT INTO tenant_members (user_id, tenant_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'editor');

-- b1's preferences row is the point of test 3: without a row this user owns,
-- a zero result would be explained by "no row matched" rather than by the
-- is_platform_admin() half of the policy, and dropping that half would still
-- leave the test green.
INSERT INTO admin_preferences (user_id) VALUES
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b1');

INSERT INTO tenant_documents (id, tenant_id, title) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'C1 doc'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 'C2 doc');

-- ── 1-2: negative control — the harness really does enforce RLS ─────────────
-- If these two agree, the assertions below are meaningless: it means the
-- session never left superuser and every policy is being bypassed.
SELECT is(
  (SELECT count(*) FROM admin_preferences),
  3::bigint,
  'seeding runs as superuser and sees every row (RLS bypassed)');

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM admin_preferences),
  1::bigint,
  'the same query under SET ROLE authenticated is filtered to the caller''s row');

-- ── 3: denial that would fail if the policy lost its admin half ────────────
SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM admin_preferences),
  0::bigint,
  'non-admin sees no preferences, not even the row they own');

-- ── 4-5: each visibility branch asserted by a user who satisfies only it ────
SELECT is(
  (SELECT count(*) FROM tenant_documents),
  1::bigint,
  'tenant owner reads their tenant''s documents via ownership alone');

SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM tenant_documents),
  1::bigint,
  'member reads the same documents via membership alone');

-- ── 6: an unrelated signed-in user reads nothing ───────────────────────────
SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM tenant_documents),
  0::bigint,
  'unrelated user reads no documents, though two exist');

SET LOCAL ROLE postgres;
RESET "request.jwt.claims";

SELECT * FROM finish();
ROLLBACK;

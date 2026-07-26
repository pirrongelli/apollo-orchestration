# Database and RLS tests that can actually fail

These come out of reviving a database test suite that had been dead for months.
Six of its seven files could not produce a single passing assertion — and nothing
in CI or the package manifest ever ran it, so the rot was invisible. The suite
had been written, reviewed, merged, and then quietly stopped meaning anything.

The narrow lesson is about row-level security. The general one is that a test
asserting an *absence* — "this user cannot see that row" — passes by default. It
takes deliberate work to make such a test capable of failing, and almost none to
convince yourself it works.

Full write-up: [`docs/11-testing-and-code-health.md`](../../docs/11-testing-and-code-health.md),
sections "Security tests that pass for the wrong reason" and "Making the gate
survivable".

## Files

| File | What it is |
|---|---|
| [`rls-policy-tests.example.sql`](rls-policy-tests.example.sql) | A runnable pgTAP suite demonstrating the three ways an RLS test passes for the wrong reason, and the fix for each |
| [`database-tests.example.yml`](database-tests.example.yml) | The blocking, path-gated CI job — including the two rules that keep it from being silently switched off |
| [`check-cli-version-parity.py`](check-cli-version-parity.py) | Asserts the suite validates migrations on the same CLI the deploy workflows install, instead of a comment claiming it does |
| [`check-cli-version-parity.test.py`](check-cli-version-parity.test.py) | 12 cases, 11 of them ways the gate could wrongly pass |

## Running them

The SQL file is self-contained — it creates its own schema, roles and policies,
and rolls everything back — so it needs only a Postgres with pgTAP:

```bash
psql "$DB_URL" -c 'CREATE EXTENSION IF NOT EXISTS pgtap;'
pg_prove -d "$DB_URL" rls-policy-tests.example.sql
# Files=1, Tests=6, Result: PASS
```

```bash
python3 check-cli-version-parity.test.py
# all parity-checker tests passed
```

## The three failure modes, concretely

**1. Asserting under a session that bypasses RLS.** The suite's original helper
set the request JWT claims but never issued `SET ROLE`. The session stayed
superuser, RLS never applied, and every "user X cannot see Y" assertion passed
without exercising a single policy. Nothing about the output looked wrong.

The example seeds fixtures as superuser (deliberately — that is what makes
seeding possible) but runs each assertion under an explicit `SET LOCAL ROLE`, and
its first two tests are a **negative control**: the same query, counted as
superuser and again as the restricted role. If those two numbers ever agree, the
harness is broken and every later assertion is worthless.

**2. Denial tests with nothing to deny.** A test asserting a non-admin sees zero
rows proves nothing if that user owns no row a weakened policy would have
exposed. The zero is explained by "nothing matched", not by the check under test.
Delete the authorization clause from the policy and the test still passes.

The way to know is mutation: strip the clause, rerun, confirm the test fails,
restore. In the example, `is_platform_admin(...)` removed from the preferences
policy turns test 3 red (`have: 1, want: 0`). Before the fixture row was added it
stayed green.

**3. Overlapping grants that mask a branch.** When a policy grants access through
two independent paths — direct ownership *or* explicit membership — a fixture
user holding both makes each branch untestable. Either can regress while the
assertion passes through the other.

The example gives each branch a user who satisfies exactly that one. Its own
history is the cautionary tale: the seed originally granted the owner a
membership row too, described in a comment as "defensive". It was the opposite —
it defended the test from ever failing.

## Two rules for the gate itself

Both are in the workflow, with the reasoning inline.

**A required check must always run and always report.** Filtering the whole
workflow by `paths:` means the check is *skipped* rather than *passed* on
unrelated PRs — and a skipped required check blocks merges indefinitely, which is
how required checks get un-required. Let the job always start and decide
internally whether there is work to do.

**A gate must gate on its own runner.** If the path filter covers only the code
under test, a PR that edits the workflow, the script it invokes, or the manifest
entry it calls will not trigger it — so the gate can be weakened by exactly the
change it should have caught. The filter here covers all of those, plus the files
whose invariant it asserts.

Related: [`examples/quality/`](../quality/) for ratchets that bound debt you
cannot fix today, and [`examples/hooks/`](../hooks/) for the merge gate that
makes a review verdict unevadable.

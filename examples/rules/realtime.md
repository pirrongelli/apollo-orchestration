---
paths:
  - "supabase/migrations/**"
  - "src/hooks/**"
---
### Live-Update Contract (all data sources, no exceptions)

Every user-visible table that gets written by webhooks, crons, or background
workers must have an explicit answer to "how does the screen learn about
this without a manual refresh?". The answer is one of exactly two things,
decided in the PR that ships the feature:

1. **Realtime**: the table is added to the realtime publication in a
   migration (`ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>`)
   AND a frontend hook subscribes to it and invalidates the right query
   keys. One without the other is a bug — a subscription to an unpublished
   table reports `SUBSCRIBED` and silently never delivers. This exact gap
   shipped broken in production for six months before being caught.
2. **Polling**: the query uses `refetchInterval` with an explicit, justified
   interval.

Rules:

- This applies **uniformly to every data source and integration** — no
  provider or subsystem ships with less live-update coverage than another
  for equivalent data. If deposits from provider A get realtime, deposits
  from provider B do too.
- A static coverage check (e.g., a small script run in CI and locally)
  should verify that every `postgres_changes` subscription in the frontend
  targets a table some migration actually adds to the publication. Run it
  locally after touching realtime code or migrations, not just in CI.
- Realtime delivery is gated by RLS: the subscriber only receives rows their
  `SELECT` policy allows. Before publishing a table, confirm it has RLS
  enabled and a `SELECT` policy for the intended viewers — publishing a
  table with no policy means nobody gets rows, and publishing one with too
  broad a policy leaks data across tenants.
- Global window-focus refetching (e.g., React Query's
  `refetchOnWindowFocus: true`) is the platform-wide safety net for anything
  this contract misses. Treat turning it off as a platform-wide UX decision,
  not a per-feature optimization — a past "perf tweak" that disabled it
  silently killed auto-refresh everywhere for months before anyone noticed.

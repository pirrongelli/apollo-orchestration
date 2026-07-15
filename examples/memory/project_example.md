---
name: saved-views-dashboard
description: Saved views for the operations dashboard — shipped to dev
  2026-03-02, promoted to staging 2026-03-05, NOT in production; open
  items are the empty-state UI and the filter-column index migration
type: project
---

# Saved views for the operations dashboard

Lets operators save named filter combinations on the operations dashboard
and reload them from a dropdown. Requested by the owner 2026-02-27.

## Status by environment

- **dev** — shipped 2026-03-02. Feature verified end-to-end: created,
  reloaded, and deleted a view through the UI; lint, tests, and build green.
- **staging** — promoted 2026-03-05 via a scoped cherry-pick (the promotion
  branch carried only the three saved-views commits; unrelated dev work was
  held back). Smoke-tested same day.
- **production** — NOT deployed. Promotion is a hard stop requiring
  explicit owner approval; do not assume this feature exists for customers.

## What shipped

- New `saved_views` storage keyed to the user, with row-level access checks
  so operators only see their own views.
- Dropdown + save/rename/delete UI on the dashboard toolbar.
- Views serialize the full filter state, so new filter fields added later
  load as their defaults instead of breaking old views.

## Open items

1. **Empty-state UI** — first-time users see a bare dropdown with no hint;
   owner asked for a one-line "Save your current filters as a view" prompt.
2. **Index migration** — view loads filter by owner column with no index
   yet; fine at current volume, needs an index before production promotion.
3. **Decision pending (owner):** whether views can be shared org-wide or
   stay personal. Do not build sharing without an explicit OK — it changes
   the access-control model.

## Gotchas hit

- Serializing filter state naively captured a transient "loading" flag;
  stripped non-filter keys before persisting. If adding dashboard state,
  keep the persisted shape explicit, not spread from component state.
- Double-checked the save button against
  [[client-state-not-a-concurrency-guard]] — not a money move, but the
  rapid-double-invoke test pattern was reused.

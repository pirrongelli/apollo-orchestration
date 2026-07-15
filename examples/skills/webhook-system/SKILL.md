---
name: webhook-system
description: Design and implement outbound webhook features including event
  delivery, retry logic, HMAC signing, SSRF protection, and event type
  management. Use when working on webhook endpoints, delivery pipelines,
  customer webhook configuration, or event-driven architecture.
argument-hint: [task-description]
---

# Webhook System

Work on the outbound webhook system for: **$ARGUMENTS**

This playbook covers **sending** webhooks to customer-supplied URLs — the
riskiest kind of outbound HTTP a platform does, because the destination is
attacker-controllable. The patterns are stack-agnostic; code samples use
TypeScript.

## Architecture

```
Internal event → event handler → find matching subscriptions
                                     (webhooks table, filter by event_types)
                                          ↓
                                 delivery worker
                                 (validate URL → HMAC sign → send)
                                          ↓
                                 delivery log
                                 (status + attempts + backoff schedule)
```

## Step 1: Schema — two tables, secrets locked down

### `webhooks` (customer subscriptions)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `org_id` | UUID | Owning tenant |
| `url` | TEXT | Destination (SSRF-validated at write AND at send) |
| `event_types` | TEXT[] | Subscribed event types |
| `signing_secret` | TEXT | HMAC secret — **service-role access only** |
| `is_active` | BOOLEAN | Manually or automatically disabled |
| `consecutive_failures` | INTEGER | Auto-disable counter |

### `webhook_delivery_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `webhook_id` | UUID | FK to webhooks |
| `event_type` | TEXT | What triggered the delivery |
| `payload` | JSONB | Full payload as sent |
| `status` | TEXT | pending, success, failed, retrying |
| `attempts` | INTEGER | Current attempt count |
| `response_status` | INTEGER | HTTP status from the customer endpoint |
| `next_retry_at` | TIMESTAMPTZ | Backoff schedule |

The `signing_secret` column must never be readable through the general API
layer. If the table has no tenant-facing read policy for that column, the
frontend manages webhooks through an authenticated backend function that
returns only safe fields — never by querying the table directly.

**Verify**: attempt to read `signing_secret` with a tenant-scoped credential;
it must fail or return nothing.

## Step 2: SSRF protection — the non-negotiable part

A webhook URL is an attacker-controlled destination that your infrastructure
will POST to. Without filtering, `http://169.254.169.254/` reads your cloud
metadata service and `http://10.0.0.5:8080/admin` reaches your internal
network.

### Block private ranges — IPv4 AND IPv6

```typescript
// IPv4
10.0.0.0/8         // private
172.16.0.0/12      // private
192.168.0.0/16     // private
169.254.0.0/16     // link-local (cloud metadata lives here)
127.0.0.0/8        // loopback
0.0.0.0/8          // unspecified

// IPv6 — forgetting these leaves the front door open
fc00::/7           // unique-local (fc00::, fd00::)
fe80::/10          // link-local
::1                // loopback
::                 // unspecified
// plus IPv4-mapped IPv6 (::ffff:10.0.0.5) — unmap and re-check as IPv4
```

An IPv4-only blocklist is a bypass, not a defense: on dual-stack
infrastructure, `http://[fd00::1]/` walks straight past it.

**Bracket gotcha**: `new URL('http://[fd00::1]/').hostname` returns the
IPv6 address **wrapped in brackets** (`[fd00::1]`). Strip the brackets before
matching against the ranges, or every IPv6 check silently never matches.

### Validate at TWO points, not one

1. **Registration time** — when the customer creates or updates the webhook.
2. **Send time** — immediately before every outbound `fetch()`.

Registration-time-only validation is defeated by DNS rebinding: the hostname
resolves to a public IP when the customer registers it, then the attacker
flips the DNS record to `10.0.0.5`. Revalidate (including resolution) at the
moment of use.

### Kill redirect-based SSRF

```typescript
const response = await fetch(webhookUrl, {
  method: 'POST',
  headers,
  body: rawBody,
  redirect: 'error',   // MANDATORY
  signal: AbortSignal.timeout(10_000),
});
```

Without `redirect: 'error'`, a customer endpoint at a perfectly valid public
URL can respond `302 Location: http://169.254.169.254/` and your fetch
follows it. This one line closes the entire class.

**Verify**: unit-test the validator with `http://10.0.0.1/`, `http://[fd00::1]/`,
`http://[::1]/`, `http://[::ffff:192.168.1.1]/`, and a 302-to-internal
redirect — all must be rejected.

## Step 3: HMAC signing

Sign every delivery so receivers can authenticate it and reject replays.

```typescript
const timestamp = Math.floor(Date.now() / 1000);
const signaturePayload = `${timestamp}.${rawBody}`;
const signature = hmacSha256Hex(signingSecret, signaturePayload);

headers['x-webhook-signature'] = `t=${timestamp},v1=${signature}`;
```

Document the verification steps for receivers:

1. Extract timestamp and signature from the header.
2. Reconstruct `` `${timestamp}.${rawBody}` `` from the **raw** request body
   (not a re-serialized parse — key order changes break the signature).
3. HMAC-SHA256 with the signing secret; compare in constant time.
4. Reject if the timestamp is more than 5 minutes old (replay protection).

**Verify**: a round-trip test — sign a payload, verify it with the documented
receiver steps; then flip one byte and confirm verification fails.

## Step 4: Delivery, retries, auto-disable

1. Internal event fires → find subscriptions:
   `is_active = true AND event_types @> ARRAY[eventType]`.
2. Insert a delivery log row (`status: 'pending'`) **before** sending — the
   log is the source of truth, not the send.
3. Send with the validated URL, signed headers, and a hard timeout.
4. On failure: exponential backoff (e.g. 1min, 5min, 30min, 2h, 24h), max 5
   attempts, then mark `failed`.
5. After N consecutive failures across deliveries, auto-disable the webhook
   and surface that state in the UI — hammering a dead endpoint forever helps
   no one, and silent disablement without UI visibility generates support
   tickets.

A separate retry worker (cron-triggered) picks up rows where
`status = 'retrying' AND next_retry_at <= now()`.

**Test events**: provide a `test.ping` event that **bypasses** the event-type
filter and delivers directly. Customers need to verify their endpoint before
subscribing to real events; if the ping goes through the subscription filter,
an endpoint with no subscriptions yet can never be tested.

**Verify**: force a failing endpoint (e.g. a URL returning 500) and watch the
log row walk pending → retrying (with correct `next_retry_at`) → failed, and
the webhook auto-disable after the threshold.

## Step 5: Idempotent, dedup-safe processing

Webhook systems face duplicates on both sides — providers redeliver events to
you, and your retries redeliver to customers.

- **Give receivers a stable event ID** in every payload so they can dedup;
  deliver at-least-once and say so in the docs.
- **Never create a second delivery for the same (event, webhook) pair** —
  reserve with `INSERT ... ON CONFLICT DO NOTHING` on a unique key and only
  proceed if the insert won.

### Dedup guards must compare status, not just existence

The classic silent-data-loss bug, learned the hard way: an inbound handler
that checks "does this ID already exist?" and returns early **drops status
changes**. A later event for the same entity legitimately carries a new status
(`authorized → cancelled`).

```typescript
// WRONG — silently discards the cancellation
if (existing) return;

// RIGHT — same status is a duplicate; different status is an update
if (existing && existing.status === incoming.status) return;
if (existing) { await updateStatus(existing.id, incoming.status); return; }
```

Guard against status **regressions** without blocking terminal-to-terminal
transitions: `completed → pending` must be rejected, but
`completed → cancelled` can be real.

```typescript
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
if (TERMINAL.has(existing.status) && !TERMINAL.has(incoming.status)) return;
```

**Verify**: replay the same event twice (no duplicate row), then replay it
with a changed status (row updated), then attempt a terminal → non-terminal
regression (rejected).

## Key invariants (checklist before shipping)

- Signing secrets unreachable from tenant-scoped credentials.
- URL validated at registration AND revalidated at every send.
- IPv4 **and** IPv6 private ranges blocked; brackets stripped from parsed
  IPv6 hostnames; IPv4-mapped IPv6 unmapped and re-checked.
- `redirect: 'error'` and a timeout on every outbound fetch.
- HMAC over `timestamp.rawBody`, 5-minute replay window documented.
- Delivery logged before sending; bounded retries with backoff; auto-disable
  with UI visibility.
- Dedup guards compare status, not just existence; terminal statuses can't
  regress.
- Cap subscriptions per tenant (e.g. 10) so one tenant can't turn your
  delivery worker into their load generator.

## When NOT to use this skill

- **Receiving webhooks from third-party providers** — the inbound problem is
  different (signature *verification*, provider retry semantics, mapping their
  events to your domain). Only the "dedup guards compare status" section
  applies to inbound handlers.
- **Internal service-to-service calls** — if you control both ends, you don't
  need customer-facing subscription management or SSRF filtering of your own
  URLs; use a queue.
- **Real-time UI updates** — pushing changes to your own frontend is a
  realtime/subscription concern, not a webhook one.

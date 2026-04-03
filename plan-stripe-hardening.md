# Plan: Stripe Integration Hardening

Fixes identified in the 2026-04-03 security audit. Prioritised by real-world
impact — each phase is self-contained and can be committed independently.

---

## Phase 1 — Webhook correctness (highest impact)

**Files:** `src/app/api/webhooks/stripe/route.ts`

### 1a. Add webhook secret guard before constructEvent

Currently `STRIPE_WEBHOOK_SECRET` is accessed with `!` (non-null assertion).
If unset the catch returns a misleading "Invalid webhook signature" 400.

- Before calling `constructEvent`, check `process.env.STRIPE_WEBHOOK_SECRET`
- If missing, log `console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set")` and return 500

### 1b. Replace `updateMany` with `findUnique` + `update` in all three invoice handlers

`stripeSubscriptionId` is `@unique` in the schema, so `updateMany` always
affects 0 or 1 rows but silently succeeds when 0. An orphaned Stripe
subscription (no matching wedding) goes completely undetected.

For each of the three cases (`invoice.payment_succeeded`,
`invoice.payment_failed`, `customer.subscription.deleted`):
- Replace `updateMany({ where: { stripeSubscriptionId } })` with:
  1. `prisma.wedding.findUnique({ where: { stripeSubscriptionId }, select: { id: true } })`
  2. If null → `console.warn` the subscription ID and `break`
  3. `prisma.wedding.update({ where: { id: wedding.id }, data: ... })`

### 1c. Fix TOCTOU in `customer.subscription.deleted`

After the `updateMany` the handler does a separate `findFirst` to get the
weddingId for the Inngest event. Once 1b is done this is free — the `findUnique`
from 1b already returns the `id`; use it directly for the Inngest send.

### 1d. Don't record skipped `checkout.session.completed` events as processed

When `weddingId` is missing (line 46–48), the event `break`s out of the switch
but is still written to `StripeEvent` on line 166. Stripe won't retry it,
so the customer's subscription is silently never activated.

Two options — pick one:
- **Option A (simpler):** Return a 400 error response instead of `break` when
  weddingId is missing. Stripe will retry the webhook delivery.
- **Option B (safer):** Keep the `break` but move `stripeEvent.create` inside
  the switch arms (only on successful processing), so skips are never recorded.

Option A is simpler and aligns with how the error handler already works (line
161–162 returns 500, intentionally not recording, so Stripe retries).

---

## Phase 2 — Schema: add `createdAt` to `StripeEvent`

**Files:** `prisma/schema.prisma`, new manual SQL migration

The `StripeEvent` table has no timestamp field. It grows unboundedly and there
is no way to clean up old entries.

- Add `createdAt DateTime @default(now())` and `@@index([createdAt])` to the
  `StripeEvent` model
- Write a manual SQL migration (Node 23 Prisma CLI workaround — see memory):
  ```sql
  ALTER TABLE "StripeEvent" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
  CREATE INDEX "StripeEvent_createdAt_idx" ON "StripeEvent"("createdAt");
  ```
- Add a cleanup step to the existing Inngest `stripe-reconcile` function (or
  a new dedicated nightly function) that deletes events older than 90 days:
  ```ts
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.stripeEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  ```

---

## Phase 3 — Startup validation and checkout hardening

**Files:** `src/lib/env.ts`, `src/app/api/billing/checkout/route.ts`

### 3a. Add Stripe env var warnings to `validateEnv()`

`STRIPE_SECRET_KEY` throws at first use (good). `STRIPE_WEBHOOK_SECRET` and
`STRIPE_PRICE_ID_STANDARD` have no equivalent guard. Add `console.warn` lines
in `validateEnv()` for all three so a misconfigured deploy is visible at startup
rather than on the first real user action.

```ts
if (!process.env.STRIPE_WEBHOOK_SECRET)
  console.warn("[env] STRIPE_WEBHOOK_SECRET not set — webhook verification will fail");
if (!process.env.STRIPE_PRICE_ID_STANDARD)
  console.warn("[env] STRIPE_PRICE_ID_STANDARD not set — checkout will fail");
```

### 3b. Guard `STRIPE_PRICE_ID_STANDARD` in checkout route

Line 56 uses `process.env.STRIPE_PRICE_ID_STANDARD!` — if unset, the Stripe
API call throws a cryptic error. Add an explicit check before the Stripe call:

```ts
const priceId = process.env.STRIPE_PRICE_ID_STANDARD;
if (!priceId) {
  return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
}
```

---

## Out of scope / won't fix

- **Replay attack window** — Stripe SDK `constructEvent` already validates the
  `t` timestamp in the signature header; adding a manual 5-minute check would
  reject legitimate webhooks that Stripe retries after a delivery failure.
- **Log sanitisation** — logs are local Docker stdout on a self-hosted Mac mini,
  not shipped to any external service; the overhead isn't justified.
- **Content-Type validation on webhook** — Stripe always sends
  `application/json`; checking it adds noise with no real protection since
  signature verification already covers payload integrity.

---

## Execution order

```
Phase 1a  →  1b  →  1c  →  1d   (all in one commit — same file)
Phase 2                           (separate commit — schema change + migration)
Phase 3a  →  3b                  (one commit — env hardening)
```

Phases 1 and 3 require no DB changes; Phase 2 requires a migration and a Docker
rebuild.

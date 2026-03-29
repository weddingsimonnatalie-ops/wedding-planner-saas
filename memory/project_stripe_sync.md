---
name: Stripe sync and recovery
description: Auto-recovery from missed webhooks; syncWeddingFromStripe() utility + billing page sync + manual sync button + nightly cron + webhook hardening — all phases complete
type: project
---

Started 2026-03-29. Branch: `feature/stripe-sync`.

**Why:** Stripe webhooks can be missed (no CLI in local dev, delivery failures in production). Without recovery the DB drifts — status stays TRIALING when ACTIVE, stripeSubscriptionId stays null after checkout, etc. The billing page showed "Complete billing setup →" for Steve and Jane despite having a valid Stripe subscription because the checkout webhook never fired locally.

**Scope:** All recovery scenarios — missing stripeSubscriptionId, status drift (payment succeeded/failed/cancelled missed), trial end changes, upgrade/downgrade.

**Architecture decision:** All Stripe API calls stay in the SaaS app (never in admin console — §2.6 of ADMIN-CONSOLE-PLAN.md is non-negotiable: no Stripe SDK in admin console).

**Multi-instance safety:**
- Phases 2 & 3 (on-demand sync): idempotent — safe with multiple instances (worst case: duplicate Stripe API calls, correct result)
- Phase 4 (nightly cron via Inngest): naturally multi-instance safe — Inngest is external scheduler, sends one HTTP request regardless of instance count
- Without Inngest (daemon mode): duplicate cron runs are harmless (idempotent) but wasteful; Redis lock could be added if needed

---

## Phase progress

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | `syncWeddingFromStripe()` utility (`src/lib/stripe-sync.ts`) | ✅ complete |
| 2 | Auto-sync on `/billing` page load | ✅ complete |
| 3 | `POST /api/billing/sync` endpoint + "Refresh from Stripe" button | ✅ complete |
| 4 | Nightly reconciliation cron (Inngest) | ✅ complete |
| 5 | Webhook hardening (`checkout.session.completed` null subscription guard) | ✅ complete |

All phases deployed to `feature/stripe-sync` branch, ready for merge.

---

## Phase 1 — `src/lib/stripe-sync.ts`

`syncWeddingFromStripe(weddingId: string): Promise<SyncResult>`

- Loads wedding (stripeCustomerId, stripeSubscriptionId, all status/date fields)
- Bails early if no stripeCustomerId (never registered with Stripe)
- Fetches subscription: tries `stripe.subscriptions.retrieve(id)` first, falls back to `stripe.subscriptions.list({ customer, status: 'all', limit: 10 })`
- `pickBestSubscription()` — prefers trialing/active over terminal states, then most recently created
- Status mapping: `trialing→TRIALING`, `active→ACTIVE`, `past_due→PAST_DUE`, `canceled→CANCELLED`, `paused→PAUSED`, `incomplete_expired→CANCELLED`, `unpaid→PAST_DUE`, `incomplete→null` (skip — checkout in progress)
- `gracePeriodEndsAt`: only set if newly PAST_DUE and not already set; cleared on ACTIVE
- `cancelledAt`: uses Stripe's `canceled_at` if available; preserved otherwise
- `deleteScheduledAt`: set only when transitioning to CANCELLED and not already set (uses DATA_RETENTION_DAYS env var, default 90)
- Does NOT touch: `subscriptionPlan`, `deleteScheduledAt` if already set, any non-billing fields
- Returns `{ changed: boolean, before, after, skipped? }` — before/after for audit logging

## Phase 2 — billing page auto-sync

`/billing/page.tsx` is a server component — calls `syncWeddingFromStripe(weddingId)` after fetching wedding if `stripeCustomerId` is present, then re-fetches wedding to render fresh data. Every visit to /billing self-heals the DB.

## Phase 3 — sync endpoint + button

- `POST /api/billing/sync` — ADMIN only; calls `syncWeddingFromStripe()`; returns `{ changed, skipped, before, after }`
- `SyncFromStripeButton` client component on billing page; calls endpoint then `router.refresh()`
- Shows sync status: "Subscription data updated" / "Already in sync" / skipped reason

## Phase 4 — nightly reconciliation cron (Inngest)

- `stripeReconcile` function, cron `0 2 * * *` (2 AM UTC)
- Query all weddings where `stripeCustomerId IS NOT NULL AND subscriptionStatus NOT IN ('CANCELLED')`
- Calls `syncWeddingFromStripe()` for each; logs summary (N checked, N updated)
- Uses `step.run()` for parallel execution and reliability

## Phase 5 — webhook hardening

- `checkout.session.completed`: `session.subscription` can be null if Stripe hasn't created the subscription object yet
- Enhancement: if null, schedule a delayed Inngest event (30s) that calls `syncWeddingFromStripe()` to pick up the subscription ID once available
- `stripeSyncDelayed` Inngest function handles the delayed sync
- Closes the gap that caused the current "Complete billing setup" bug in local dev and protects against the same race in production
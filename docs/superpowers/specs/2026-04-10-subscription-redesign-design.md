# Subscription Model Redesign

## Context

The current model requires payment upfront (Stripe or PayPal) and starts users in a 14-day TRIALING status with limited feature access. This creates friction at registration and unnecessary complexity (grace periods, trial end tracking, PayPal trial emulation, activation flows).

The new model replaces this with a **Free Tier** that requires no payment, removing the signup barrier entirely. Paid subscriptions unlock premium features. Data retention is tied to the wedding date and subscription status rather than arbitrary grace periods.

## New Subscription Model

### Tiers and Feature Access

| Status | Dashboard | Guests | Email | Uploads | Timeline | Music |
|--------|-----------|--------|-------|---------|----------|-------|
| FREE (incl. cancelled) | Full access | Max 30 | Blocked | Blocked | Blocked | Blocked |
| ACTIVE | Full access | Unlimited | Allowed | Allowed | Allowed | Allowed |
| PAST_DUE (in grace) | Full access + banner | Unlimited | Allowed | Allowed | Allowed | Allowed |
| PAST_DUE (expired) | Hard gate | — | Blocked | Blocked | Blocked | Blocked |

### Status Flow

```
Register (FREE, no payment required)
      │
      ▼
  Upgrade to Paid ──▶ ACTIVE (full access)
        │                    │
        │              Payment fails
        │                    │
        │                    ▼
        │              PAST_DUE (7-day grace from currentPeriodEnd)
        │                    │
        │              Grace expires
        │                    │
        ▼                    ▼
     FREE ◀────────────────┘
  (30 guest cap, no premium)
        │
        ▼
  Purge cron
  (see purge logic)
```

### Purge Logic

Data is purged by a single cron job. The purge date is calculated as:

| Scenario | Purge trigger |
|----------|--------------|
| FREE tier (never upgraded) | 60 days after `weddingDate` |
| FREE (cancelled before wedding) | 60 days after `weddingDate` |
| FREE (cancelled after wedding) | 60 days after `cancelledAt` |
| ACTIVE / PAST_DUE (paid) | Never purged |

If `weddingDate` is null and the user is on FREE tier, fall back to `createdAt + 365 days`.

### Downgrade Gate (>30 guests)

When a paid subscription is cancelled and the user has more than 30 guests, they see a hard gate screen before accessing the dashboard. This screen offers two options:

1. **"Upgrade"** — re-subscribe via Stripe checkout
2. **"Select guests to remove"** — choose which guests to delete until the count is 30 or below

The user cannot access the dashboard until they resolve this. Guests above the cap remain visible but no new guests can be added.

## Registration Flow

**Current:** Sign up → Stripe checkout session → create Wedding with TRIALING status.

**New:** Sign up → create Wedding with `subscriptionStatus: FREE` → no Stripe interaction. User can upgrade from the billing page at any time.

The `/api/register` route will:
1. Create User and Wedding with `subscriptionStatus: "FREE"`
2. No Stripe customer or checkout session
3. No `trialEndsAt` field

## Database Changes

### SubStatus enum — replace TRIALING with FREE, remove CANCELLED and PAUSED

```prisma
enum SubStatus {
  FREE        // was TRIALING; also replaces CANCELLED (cancel → downgrade to FREE)
  ACTIVE
  PAST_DUE
}
```

**Rationale:** CANCELLED and PAUSED no longer need separate statuses. When a Stripe subscription is cancelled (`customer.subscription.deleted`), the wedding is downgraded to FREE with `cancelledAt` set. PAUSED was never used in practice. This simplifies gating logic — only three states to check.

### Wedding model — field changes

**Remove:**
- `trialEndsAt` — no trials
- `gracePeriodEndsAt` — grace is now derived from `currentPeriodEnd`
- `subscriptionPlan` — single tier, unused
- `paypalSubscriptionId` — PayPal removed
- `billingProvider` — Stripe only, no need for enum

**Add:**
- (nothing new — `cancelledAt` and `deleteScheduledAt` already exist)

**Keep:**
- `stripeCustomerId`
- `stripeSubscriptionId`
- `subscriptionStatus`
- `currentPeriodEnd`
- `cancelledAt`
- `deleteScheduledAt`

### Remove models
- `PayPalEvent` — PayPal webhooks removed

### BillingProvider enum
- Remove `BillingProvider` enum entirely (Stripe only)

## What's Removed

| Component | Files |
|-----------|-------|
| PayPal client | `src/lib/paypal.ts` |
| PayPal sync | `src/lib/paypal-sync.ts` |
| PayPal webhooks | `src/app/api/webhooks/paypal/` |
| PayPal billing routes | `src/app/api/billing/paypal-checkout/`, `paypal-capture/`, `paypal-cancel/`, `paypal-reactivate/`, `paypal-sync/` |
| PayPal UI components | `src/components/billing/PayPalSubscriptionButton.tsx`, `CancelPayPalButton.tsx` |
| Activate trial flow | `src/app/api/billing/activate/route.ts`, `src/components/billing/ActivateTrialButton.tsx` |
| Trial-ending reminder | `src/lib/inngest/functions/trial-ending-reminder.ts` |
| Trial-related Stripe webhook logic | `customer.subscription.trial_will_end` handler |
| `TRIALING` status references | All files referencing `TRIALING` |
| `BillingProvider` enum | Schema + all references |
| PayPal env vars | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_PLAN_ID_STANDARD` |

## What's Added

| Component | Description |
|-----------|-------------|
| FREE tier feature gating | `canAccessTimeline()`, `canAccessMusic()` in `src/lib/permissions.ts` |
| Guest count gate | API middleware blocking guest creation when count >= 30 for FREE tier |
| Downgrade gate page | New page at `/billing/downgrade` — hard gate for >30 guests |
| Upgrade prompts | Timeline, Music, Email, Upload pages show `UpgradePrompt` for FREE users |
| Purge cron update | `purge-expired-weddings` uses wedding-date-based logic |
| Billing page update | Show FREE tier info, upgrade CTA instead of trial info |

## What's Changed

| Component | Change |
|-----------|--------|
| `SubStatus` enum | `TRIALING` → `FREE`, remove `CANCELLED` and `PAUSED` |
| `/api/register` | No Stripe checkout; create Wedding as FREE |
| `src/lib/api-auth.ts` | `requireEmailFeature` / `requireUploadFeature` check for FREE instead of TRIALING |
| `src/lib/stripe-sync.ts` | Map Stripe `trialing`/`canceled`/`paused` → `FREE`; set `cancelledAt` on cancel; update grace logic |
| Dashboard layout | Check FREE tier for Timeline/Music access; show downgrade gate for >30 guests |
| `WeddingContext` | Add `canAccessTimeline`, `canAccessMusic`; update `getEmailBlockReason`/`getUploadBlockReason` for FREE |
| Billing page | Remove trial UI; show FREE tier info + upgrade CTA |
| Inngest `grace-period-expiry` | Use `currentPeriodEnd` instead of `gracePeriodEndsAt` |
| Inngest `pre-deletion-warning` | Use wedding-date-based purge logic |
| Inngest `payment-failure-email` | Keep as-is (still relevant for PAST_DUE) |

## Grace Period Simplification

**Current:** `gracePeriodEndsAt` is set to `now + GRACE_PERIOD_DAYS` when entering PAST_DUE. Checked by dashboard layout and `requireRole`.

**New:** Grace period is simply `currentPeriodEnd`. When `now > currentPeriodEnd`, the subscription is expired. No separate `gracePeriodEndsAt` field needed. Stripe's `current_period_end` already provides this date.

This means:
- PAST_DUE with `now <= currentPeriodEnd` → full access + banner
- PAST_DUE with `now > currentPeriodEnd` → hard gate (same as cancelled)

## Migration Strategy

1. **Prisma migration** — rename `TRIALING` to `FREE`, remove `CANCELLED` and `PAUSED` from enum, drop PayPal fields, drop `BillingProvider` enum, drop `PayPalEvent` table, drop `trialEndsAt`, `gracePeriodEndsAt`, `subscriptionPlan` columns
2. **Data migration SQL** — Update all `TRIALING` rows to `FREE`, update all `CANCELLED`/`PAUSED` rows to `FREE` (with `cancelledAt` set where appropriate), in `Wedding.subscriptionStatus`; delete all `PayPalEvent` rows
3. **Backfill `deleteScheduledAt`** — For existing FREE/FROM-TRIALING weddings, set `deleteScheduledAt` based on wedding date + 60 days
4. **Stripe cleanup** — Cancel any active PayPal subscriptions via API before removing PayPal code

## Critical Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Enum + model changes |
| `src/app/api/register/route.ts` | Remove Stripe checkout, create FREE |
| `src/lib/api-auth.ts` | Update feature gates for FREE tier |
| `src/lib/permissions.ts` | Add timeline/music gates |
| `src/lib/stripe-sync.ts` | Map trialing/canceled/paused→FREE, set cancelledAt on cancel, update grace logic |
| `src/lib/stripe.ts` | Keep as-is |
| `src/lib/env.ts` | Remove PayPal env vars |
| `src/context/WeddingContext.tsx` | Add canAccessTimeline/Music, update block reasons |
| `src/app/(dashboard)/layout.tsx` | Add downgrade gate, feature access checks |
| `src/app/billing/page.tsx` | Remove trial UI, add FREE tier display |
| `src/app/billing/suspended/page.tsx` | Update for FREE/PAST_DUE expired |
| `src/app/billing/downgrade/page.tsx` | New page for >30 guest gate |
| `src/components/billing/` | Remove PayPal/ActivateTrial, add upgrade CTA |
| `src/components/ui/UpgradePrompt.tsx` | Update for FREE tier messaging |
| `src/lib/inngest/functions/purge-expired-weddings.ts` | Wedding-date-based purge logic |
| `src/lib/inngest/functions/grace-period-expiry.ts` | Use currentPeriodEnd |
| `src/middleware.ts` | Update if needed |

## Verification

1. **Registration:** New user signs up → gets FREE tier → no Stripe redirect → dashboard loads with Free Tier restrictions
2. **Upgrade:** Free user clicks upgrade → Stripe checkout → webhook sets ACTIVE → full access
3. **Guest cap:** Free user at 30 guests → "Add guest" blocked → shown upgrade prompt
4. **Feature gates:** Free user navigates to /timeline or /music → redirected or shown upgrade prompt
5. **Downgrade:** Paid user cancels → Stripe webhook sets PAST_DUE/CANCELLED → if >30 guests, hard gate page shown
6. **Downgrade resolution:** User removes guests to ≤30 → can access dashboard on FREE tier
7. **Purge:** Cron runs → weddings with `deleteScheduledAt <= now` are purged with all related data
8. **Stripe webhooks:** All webhook handlers still work with new status mapping
9. **Existing data:** All TRIALING weddings correctly migrated to FREE
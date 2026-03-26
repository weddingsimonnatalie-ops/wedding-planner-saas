---
name: wedding-planner-saas-phase-status
description: SaaS migration phase completion status and key decisions
type: project
---

This is the SaaS multi-tenant rewrite of the personal wedding planner app.

**Why:** Turning the personal app into a product that other couples can use.

**How to apply:** Check phase status before starting new work to avoid re-implementing completed phases.

## Phase Status

### Phase 1 — Multi-tenancy Foundation ✅ Complete
- Row-level tenancy: `weddingId` on all tenant tables + PostgreSQL RLS
- `Wedding` model with `subscriptionStatus`, billing fields, `stripeCustomerId`
- `WeddingMember` join table (User ↔ Wedding with role)
- Signed JWT cookie (`wedding_id`) for tenant context via `src/lib/wedding-cookie.ts`
- `getServerContext()` / `requireServerContext()` in `src/lib/server-context.ts`
- `requireRole()` in `src/lib/api-auth.ts` — validates session + weddingId cookie + subscription status
- `/select-wedding` page for switching between weddings
- `/api/auth/set-wedding` sets the signed cookie
- `/api/weddings` — list user's weddings
- Middleware updated: checks Better Auth session + weddingId cookie; no Prisma (Edge runtime)
- Subscription gate in dashboard layout (Node.js, not middleware)
- Migrations: `20260325000000_add_multi_tenant`, `20260325000001_add_rls_policies`

### Phase 2 — Stripe Billing ✅ Complete (verified 2026-03-26)
- `src/lib/stripe.ts` — Stripe SDK singleton
- `POST /api/register` — creates User+Account+Wedding+WeddingMember, Stripe Customer, Checkout session (14-day trial), sets weddingId cookie, returns checkoutUrl
- `src/app/register/page.tsx` — sign-up form; calls Better Auth signIn after register, then redirects to Stripe Checkout
- `POST /api/webhooks/stripe` — handles: checkout.session.completed, invoice.payment_succeeded, invoice.payment_failed, customer.subscription.deleted, customer.subscription.trial_will_end; idempotent via StripeEvent table
- `GET|POST /api/billing/portal` — Stripe Customer Portal; uses `allowLapsed: true` so cancelled users can reactivate
- `src/app/billing/page.tsx` — subscription status, next billing date, trial end, grace period info
- `src/app/billing/suspended/page.tsx` — shown when CANCELLED or PAST_DUE past grace period
- `src/components/billing/GracePeriodBanner.tsx` — amber banner in dashboard layout when PAST_DUE
- `requireRole()` extended with `options.allowLapsed` to skip subscription gate for billing routes
- Onboarding: `/onboarding/wedding`, `/onboarding/invite` (stub), `/onboarding/done`

Verification checks passed:
- Registration → Stripe Checkout → session → onboarding wizard ✅
- Webhooks returning 200 for all event types ✅
- Grace period banner shown when PAST_DUE ✅
- Suspended redirect when grace period expired ✅
- Stripe Customer Portal accessible from /billing ✅

Post-verification additions:
- Billing tab added to Settings page (`src/components/settings/SettingsClient.tsx`) — shows subscription status, next billing date, trial end, grace period end, and "Manage subscription in Stripe" button; accessible via `?tab=billing`
- `/billing` standalone page still exists but primary access point is Settings → Billing tab
- `settings/page.tsx` passes `billing` prop (subscriptionStatus, currentPeriodEnd, trialEndsAt, gracePeriodEndsAt) to SettingsClient

Key implementation decisions:
- Stripe SDK v20: `Invoice.subscription` not in TypeScript types — cast via `unknown` intermediate
- `docker compose restart` does NOT re-read env vars — use `docker compose up -d --force-recreate`
- Subscription gate is in dashboard layout (Node.js), NOT middleware (Edge runtime blocks Prisma)
- Better Auth `signIn.email()` must be called client-side after registration to establish session before Stripe redirect

### Phase 3 — Invitation System
Not started.

### Phase 4+
Not started.

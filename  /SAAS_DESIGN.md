# Wedding Planner SaaS — Architecture Design

## Overview

A multi-tenant SaaS platform built on the existing wedding planner codebase. Multiple couples each manage their own wedding in complete isolation. Access is gated by a Stripe subscription. The system runs as a stateless monolith across two app instances for high availability and zero-downtime deploys.

This document covers the full architectural design for the new repository, forked from the personal wedding planner app.

---

## 1. Infrastructure Stack

```
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare (DNS + CDN)                                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Load Balancer   │
                    │   (Railway)       │
                    └────────┬──────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │   App Server A  │           │   App Server B  │
    │   Next.js 16    │           │   Next.js 16    │
    │   (Railway)     │           │   (Railway)     │
    └────────┬────────┘           └────────┬────────┘
             └──────────────┬──────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  Supabase    │  │   Upstash    │  │ Cloudflare   │
  │  PostgreSQL  │  │   Redis      │  │     R2       │
  │  (database)  │  │   (cache +   │  │   (files)    │
  │              │  │  rate limit) │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘

External Services:
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  Stripe  │  │ Inngest  │  │   SMTP   │
  │(payments)│  │  (jobs)  │  │ (email)  │
  └──────────┘  └──────────┘  └──────────┘
```

### Service Decisions

| Service | Purpose | Plan |
|---------|---------|------|
| **Railway** | Host Next.js app (2 replicas) + Redis | Usage-based, ~$10–20/month |
| **Supabase** | PostgreSQL database | Pro ($25/month) |
| **Upstash** | Redis — shared cache + rate limiting | Free tier initially |
| **Cloudflare R2** | File storage (attachments, receipts) | Free up to 10GB |
| **Stripe** | Subscription billing | % of revenue only |
| **Inngest** | Background jobs (reminders, emails) | Free up to 50k runs/month |
| **Cloudflare** | DNS, CDN | Free |

---

## 2. Tenancy Model

**Row-level tenancy** — all tenant data filtered by `weddingId` in every query. Simple to implement from the existing codebase, appropriate for this scale.

### Tenancy Isolation

Every table that belongs to a wedding carries a `weddingId` foreign key. The middleware resolves the active wedding from the user's session and attaches it to every request. Every API route receives the `weddingId` from the auth context — it is never trusted from the request body or query params.

### Data Leak Prevention

The biggest risk in row-level tenancy is a missing `weddingId` filter leaking one couple's data to another. Two layers of protection:

1. **Convention**: `requireRole()` returns `{ user, weddingId }` — routes must use both. Code review enforces this.
2. **PostgreSQL Row-Level Security (RLS)**: Set a session variable at the start of each Prisma request. The database enforces tenant isolation at the storage layer, so even a bug in application code cannot return another tenant's rows.

```sql
-- RLS policy on Guest table (applied to all tenant tables)
ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Guest"
  USING ("weddingId" = current_setting('app.current_wedding_id'));
```

```typescript
// Set before each query via Prisma middleware
prisma.$use(async (params, next) => {
  await prisma.$executeRaw`
    SET LOCAL app.current_wedding_id = ${weddingId}
  `;
  return next(params);
});
```

---

## 3. Data Model

### New Models

```prisma
// Replaces the WeddingConfig singleton (id=1)
model Wedding {
  id                 String          @id @default(cuid())
  slug               String          @unique  // URL-friendly name e.g. "simon-natalie-2026"
  coupleName         String          @default("Our Wedding")
  weddingDate        DateTime?
  venueName          String?
  venueAddress       String?
  reminderEmail      String?
  sessionTimeout     Int             @default(30)
  sessionWarningTime Int             @default(5)

  // Stripe
  stripeCustomerId       String?     @unique
  stripeSubscriptionId   String?     @unique
  subscriptionStatus     SubStatus   @default(TRIALING)
  subscriptionPlan       String?
  currentPeriodEnd       DateTime?
  trialEndsAt            DateTime?

  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  // Relations
  members            WeddingMember[]
  invites            WeddingInvite[]
  guests             Guest[]
  tables             Table[]
  rooms              Room[]
  suppliers          Supplier[]
  payments           Payment[]
  appointments       Appointment[]
  tasks              Task[]
  mealOptions        MealOption[]
  supplierCategories SupplierCategory[]
  appointmentCategories AppointmentCategory[]
  taskCategories     TaskCategory[]
  attachments        Attachment[]
}

enum SubStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELLED
  PAUSED
}

// User ↔ Wedding membership with per-wedding role
model WeddingMember {
  id        String    @id @default(cuid())
  userId    String
  weddingId String
  role      UserRole  @default(VIEWER)
  joinedAt  DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  wedding   Wedding   @relation(fields: [weddingId], references: [id], onDelete: Cascade)

  @@unique([userId, weddingId])
  @@index([userId])
  @@index([weddingId])
}

// Invitation tokens for adding members to a wedding
model WeddingInvite {
  id        String    @id @default(cuid())
  weddingId String
  token     String    @unique @default(cuid())
  role      UserRole  @default(RSVP_MANAGER)
  email     String?   // optional — pre-fill if known
  expiresAt DateTime
  usedAt    DateTime?
  usedBy    String?   // userId who accepted

  wedding   Wedding   @relation(fields: [weddingId], references: [id], onDelete: Cascade)

  createdAt DateTime  @default(now())

  @@index([weddingId])
}
```

### Modified Models — Add weddingId

Every tenant-scoped model gets a `weddingId` FK. Examples:

```prisma
model Guest {
  id        String  @id @default(cuid())
  weddingId String                          // ← NEW
  wedding   Wedding @relation(fields: [weddingId], references: [id], onDelete: Cascade)
  // ... all existing fields unchanged ...

  @@index([weddingId])
  @@index([weddingId, groupName])
  @@index([weddingId, rsvpStatus])
}

model Supplier {
  id        String  @id @default(cuid())
  weddingId String                          // ← NEW
  wedding   Wedding @relation(fields: [weddingId], references: [id], onDelete: Cascade)
  // ... all existing fields unchanged ...
}

// Same pattern for: Table, Room, RoomElement, Payment, Attachment,
// Appointment, Task, MealOption, SupplierCategory,
// AppointmentCategory, TaskCategory
```

### Modified User Model

User is no longer wedding-scoped. It becomes a pure identity record:

```prisma
model User {
  id                String          @id @default(cuid())
  email             String          @unique
  name              String?
  // role removed — role is now per-wedding on WeddingMember
  twoFactorEnabled  Boolean         @default(false)
  twoFactorSecret   String?
  lockedUntil       DateTime?
  sessionVersion    Int             @default(0)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  weddings          WeddingMember[]
  backupCodes       BackupCode[]
  sessions          Session[]
  accounts          Account[]
  trustedDevices    TrustedDevice[]
}
```

### Removed

- `WeddingConfig` model (replaced by `Wedding`)
- `UserRole` on `User` (moved to `WeddingMember.role`)
- Singleton pattern (`id = 1`)

---

## 4. Authentication & Session

### What Changes

Better Auth is retained — no migration to Clerk needed. The key change is that the session needs to carry the **active wedding context**.

After login, the user selects (or is auto-redirected to) their wedding. The active `weddingId` is stored in a short-lived cookie alongside the Better Auth session cookie.

```
Login flow:
  1. User submits email + password
  2. Better Auth validates credentials → creates session
  3. App fetches user's WeddingMember records
  4. If one wedding → auto-select, set weddingId cookie
  5. If multiple weddings → show wedding picker
  6. All subsequent requests carry both session cookie + weddingId cookie
```

### requireRole() Changes

The existing `requireRole()` helper is extended to also resolve and validate the wedding context:

```typescript
type AuthSuccess = {
  authorized: true;
  user: SessionUser;
  weddingId: string;
  role: UserRole;
  wedding: { subscriptionStatus: SubStatus; currentPeriodEnd: Date | null };
};

export async function requireRole(
  allowedRoles: UserRole[],
  req: NextRequest
): Promise<AuthSuccess | AuthFailure> {
  // 1. Validate Better Auth session (unchanged)
  // 2. Read weddingId from cookie
  // 3. Validate user is a member of that wedding with the required role
  // 4. Check subscription is active (ACTIVE or TRIALING)
  // 5. Check sessionVersion (unchanged)
  // Returns { authorized: true, user, weddingId, role, wedding }
}
```

Every API route receives `weddingId` from `requireRole()` — never from `req.body` or query params.

### Middleware Changes

Middleware gains an additional check — subscription status:

```
Request comes in:
  1. Is session valid?                    → no  → redirect /login
  2. Is weddingId cookie set?             → no  → redirect /select-wedding
  3. Is subscription ACTIVE or TRIALING?  → no  → redirect /billing/suspended
  4. Pass through
```

Public paths remain: `/login`, `/register`, `/invite/*`, `/rsvp/*`, `/api/auth/*`, `/api/rsvp/*`, `/api/webhooks/stripe`, `/api/health`

---

## 5. Stripe Subscription Integration

### Subscription Lifecycle

```
New customer:
  /register → Stripe Checkout → webhook: checkout.session.completed
    → create User + Wedding + WeddingMember(ADMIN) + set stripeCustomerId

Payment success:
  webhook: invoice.payment_succeeded
    → set subscriptionStatus = ACTIVE, update currentPeriodEnd

Payment failure:
  webhook: invoice.payment_failed
    → set subscriptionStatus = PAST_DUE
    → send warning email to couple
    → allow 7-day grace period before locking

Cancellation:
  webhook: customer.subscription.deleted
    → set subscriptionStatus = CANCELLED
    → send data export reminder email
    → lock to read-only after currentPeriodEnd

Trial:
  webhook: customer.subscription.trial_will_end (3 days before)
    → send reminder email
```

### New Webhook Handler

```
POST /api/webhooks/stripe
  - Validates Stripe signature (STRIPE_WEBHOOK_SECRET)
  - Idempotent — safe to receive same event twice
  - Handles:
    checkout.session.completed
    customer.subscription.created
    customer.subscription.updated
    customer.subscription.deleted
    invoice.payment_succeeded
    invoice.payment_failed
    customer.subscription.trial_will_end
```

### New Routes

```
GET  /register                    — Marketing/signup landing page
POST /api/register                — Create Stripe Checkout session
GET  /billing                     — Stripe Customer Portal redirect
GET  /billing/suspended           — Subscription lapsed page (read-only notice)
POST /api/billing/portal          — Create Stripe portal session
GET  /select-wedding              — Wedding picker (for multi-wedding users e.g. planners)
```

### Pricing Model

Define tiers in Stripe Products. Even if launching with one tier, store `subscriptionPlan` on `Wedding` now so feature-gating can be added later without a migration.

Suggested initial pricing:
```
Trial:    14 days free, full access
Standard: £12/month — full access to all features
```

---

## 6. Invitation System

```
Admin creates invite:
  POST /api/invites { role: "RSVP_MANAGER", email: "planner@example.com" }
  → creates WeddingInvite record with 7-day expiry token
  → sends email with link: https://app.com/invite/[token]

Invitee clicks link:
  GET /invite/[token]
  → if token valid and not expired:
      → if user has account: show "Join [Couple Name]'s wedding" confirm page
      → if no account: show registration form (no Stripe — they're joining, not creating)
  → POST /api/invites/[token]/accept
      → create User if needed
      → create WeddingMember with role from invite
      → mark invite as used
      → redirect to /dashboard

Routes:
  GET  /invite/[token]              — Accept invitation page
  POST /api/invites                 — Create invite (ADMIN only)
  POST /api/invites/[token]/accept  — Accept invite
  GET  /api/invites                 — List active invites for wedding
  DELETE /api/invites/[id]          — Revoke invite
```

---

## 7. File Storage — Cloudflare R2

Replace all `fs` operations in the current upload/download routes with the R2 SDK (S3-compatible).

### Path Structure

```
R2 bucket: wedding-planner-uploads

/{weddingId}/suppliers/{supplierId}/{uuid}_{originalFilename}
/{weddingId}/receipts/{paymentId}/{uuid}_{originalFilename}
```

### API Route Changes

```typescript
// Current: src/app/api/suppliers/[id]/attachments/route.ts
import fs from "fs";
fs.writeFileSync(`./data/uploads/${supplierId}/${storedAs}`, buffer);

// New:
import { r2 } from "@/lib/r2";
await r2.put(`${weddingId}/suppliers/${supplierId}/${storedAs}`, buffer, {
  httpMetadata: { contentType: file.type },
});
```

```typescript
// Current: src/app/api/uploads/[supplierId]/[filename]/route.ts
const file = fs.readFileSync(path);
return new Response(file);

// New:
const object = await r2.get(`${weddingId}/suppliers/${supplierId}/${filename}`);
return new Response(object.body);
// Or: return signed URL redirect (better for large files)
```

### r2.ts helper

```typescript
// src/lib/r2.ts
import { S3Client } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
```

---

## 8. Background Jobs — Inngest

Replace the `entrypoint.sh` reminder daemon subprocess with Inngest functions. Inngest handles scheduling, retries, exactly-once execution, and deduplication across multiple app instances.

### Functions to Migrate

```typescript
// Appointment reminders — replaces reminder-daemon.ts
inngest.createFunction(
  { id: "appointment-reminders", name: "Check Appointment Reminders" },
  { cron: "0 * * * *" }, // every hour
  async () => {
    // iterate all active weddings, check reminders
    // same logic as current checkAppointmentReminders()
    // but loops across all tenants
  }
);

// Overdue payment marking — removes dashboard-load write
inngest.createFunction(
  { id: "mark-overdue-payments", name: "Mark Overdue Payments" },
  { cron: "0 6 * * *" }, // daily at 6am
  async () => {
    await prisma.payment.updateMany({
      where: { status: "PENDING", dueDate: { lt: new Date() } },
    });
  }
);

// Trial ending reminder
inngest.createFunction(
  { id: "trial-ending-reminder" },
  { event: "stripe/trial.will_end" },
  async ({ event }) => {
    // send reminder email to couple
  }
);

// Welcome email on signup
inngest.createFunction(
  { id: "welcome-email" },
  { event: "wedding/created" },
  async ({ event }) => {
    // send welcome + getting started email
  }
);
```

### New Route

```
POST /api/inngest  — Inngest webhook endpoint (receives scheduled events)
```

---

## 9. Shared Cache — Redis

Replace the process-local `Map` in `src/lib/cache.ts` with Upstash Redis. The `getCached`/`invalidateCache` API stays identical so all callers are unchanged.

```typescript
// src/lib/cache.ts — new implementation

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TTL_SECONDS = 300; // 5 minutes

// Cache keys are now wedding-scoped to prevent cross-tenant pollution
// Key format: {weddingId}:{dataType}
// e.g. "clx123:task-categories"

export async function getCached<T>(
  key: string,       // should include weddingId prefix
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  await redis.set(key, data, { ex: Math.floor(ttlMs / 1000) });
  return data;
}

export async function invalidateCache(key: string): Promise<void> {
  await redis.del(key);
}
```

Cache keys used per-wedding:
```
{weddingId}:wedding-config
{weddingId}:meal-options
{weddingId}:supplier-categories
{weddingId}:appointment-categories
{weddingId}:task-categories
```

---

## 10. RSVP — No Changes Required

The public RSVP flow works identically in the multi-tenant design. The guest's `rsvpToken` is globally unique. The token lookup resolves both the guest and the wedding:

```
GET /rsvp/[token]
  → prisma.guest.findUnique({ where: { rsvpToken: token }, include: { wedding: true } })
  → renders RSVP form scoped to that wedding's meal options and config
  → no auth, no session, no weddingId cookie required
```

The only change: meal options and wedding config are now fetched via the `weddingId` on the guest record rather than the global singleton.

---

## 11. New Pages & Routes Summary

### New Pages

```
/register                  — Sign up + start Stripe trial
/invite/[token]            — Accept wedding invitation
/select-wedding            — Wedding picker (multi-wedding users)
/billing                   — Subscription management
/billing/suspended         — Subscription lapsed (read-only notice)
/onboarding                — Post-registration setup wizard
  /onboarding/wedding      — Set couple name, date, venue
  /onboarding/invite       — Invite partner / wedding planner
  /onboarding/done         — Ready to go
```

### New API Routes

```
POST /api/register                    — Create Stripe Checkout session
POST /api/billing/portal              — Create Stripe Customer Portal session
POST /api/webhooks/stripe             — Stripe webhook handler
POST /api/inngest                     — Inngest job handler
GET  /api/invites                     — List wedding invites
POST /api/invites                     — Create invite
POST /api/invites/[token]/accept      — Accept invite
DELETE /api/invites/[id]              — Revoke invite
GET  /api/weddings/current            — Current wedding config (replaces /api/settings)
```

### Removed Routes

```
/api/settings → replaced by /api/weddings/current
/api/users (seed-based user management) → replaced by invitation system
```

---

## 12. Data Isolation — RSVP vs Admin

Two distinct user types access the app:

| Type | Access | Auth |
|------|--------|------|
| **Couple / planner** | Full admin app at `app.yourdomain.com` | Better Auth session + weddingId cookie |
| **Wedding guests** | RSVP page only at `app.yourdomain.com/rsvp/[token]` | No auth — token only |

No login required for RSVP. No separation of domains needed. Middleware already handles this distinction.

---

## 13. Environment Variables

New variables on top of existing ones:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STANDARD=price_...        # Monthly standard plan
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Cloudflare R2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=wedding-planner-uploads
NEXT_PUBLIC_R2_PUBLIC_URL=https://files.yourdomain.com  # Optional public bucket URL

# Upstash Redis (replaces REDIS_URL)
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# App
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
TRIAL_DAYS=14
```

Variables removed:
```bash
# No longer needed
SEED_ADMIN_1_NAME / EMAIL / PASSWORD   (replaced by registration flow)
SEED_ADMIN_2_* / SEED_ADMIN_3_*
```

---

## 14. Docker / Railway Configuration

### docker-compose.yml (development only)

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://...  # Points to Supabase or local pg
      UPSTASH_REDIS_REST_URL: ...
      # ... other vars from .env
    # No db or redis services — use Supabase + Upstash

  # Local PostgreSQL for offline development only
  db:
    image: postgres:16
    profiles: ["local"]
    # ...
```

### Railway

- Two replicas of the `app` service
- No DB or Redis services in Railway (Supabase + Upstash are external)
- Rolling deploys enabled (zero downtime)
- Health check: `GET /api/health`
- `entrypoint.sh` simplified — no reminder daemon (Inngest handles this)

---

## 15. Development Phases

### Phase 1 — Foundation (start here)

1. Fork repo, strip single-tenant assumptions
2. Add `Wedding`, `WeddingMember`, `WeddingInvite` models
3. Add `weddingId` to all tenant tables
4. Update `requireRole()` to resolve wedding context
5. Update middleware for wedding context
6. Update all API routes to filter by `weddingId`
7. Replace `WeddingConfig` singleton with `Wedding` record

**Gate**: existing features work for a single wedding, seeded manually

---

### Phase 2 — Registration & Stripe

1. `/register` page + Stripe Checkout integration
2. Stripe webhook handler
3. Subscription status middleware
4. `/billing` Stripe Customer Portal
5. `/billing/suspended` read-only page
6. Onboarding wizard

**Gate**: can sign up, pay, and access the app

---

### Phase 3 — Invitation System

1. `WeddingInvite` model + invite creation API
2. `/invite/[token]` accept page
3. Invite management UI in Settings
4. Email templates for invitations

**Gate**: couple can invite their planner and partner

---

### Phase 4 — Infrastructure

1. Replace `cache.ts` Map with Upstash Redis
2. Replace `fs` file operations with Cloudflare R2
3. Replace reminder daemon with Inngest functions
4. Remove dashboard-load overdue marking → Inngest daily job
5. PostgreSQL RLS policies

**Gate**: stateless app instances — safe to run two replicas

---

### Phase 5 — Polish & Launch

1. Data export (GDPR — download all wedding data as zip)
2. Account deletion flow
3. Trial-ending email reminders (Inngest)
4. Payment failure email + grace period logic
5. `/select-wedding` for multi-wedding users
6. Rate limiting tuning for multi-tenant load

**Gate**: production-ready for paying customers

---

## 16. What Does Not Change

The following can be copied directly from the personal app with minimal modification:

- All UI components (`src/components/`) — no tenancy awareness needed
- All business logic (`src/lib/rsvpStatus.ts`, `src/lib/csv.ts`, etc.)
- Public RSVP page (`/rsvp/[token]`)
- Seating planner canvas (react-konva)
- Print designer
- 2FA / backup codes / trusted devices
- Email templates (`src/lib/email.ts`)
- All Prisma migrations up to current (new migrations add on top)
- `src/lib/rate-limit.ts` (already Redis-backed with fallback)
- `src/lib/db-error.ts`, `src/lib/validation.ts`, `src/lib/filename.ts`
- Most API route logic — only the `weddingId` filter and auth context change

---

## 17. Key Risks

| Risk | Mitigation |
|------|-----------|
| Missing `weddingId` filter leaks tenant data | PostgreSQL RLS as safety net at DB layer |
| Stripe webhook replay / duplicate processing | Idempotency keys on all webhook handlers |
| Trial abuse (sign up repeatedly for free) | Stripe fraud tooling + email verification before trial |
| File storage costs growing unexpectedly | R2 free tier is generous; add file size limits per wedding on paid plans |
| Reminder daemon running on multiple instances | Inngest handles exactly-once execution natively |
| Supabase connection pool exhaustion | PgBouncer built into Supabase Pro; Prisma `$connect` pool sizing |

# Wedding Planner SaaS — Detailed Implementation Plan

> Comprehensive migration plan from single-tenant to multi-tenant SaaS
>
> GLM-5 Architecture — March 2026

---

## Design Philosophy

- **Railway-only infrastructure** — single dashboard, auto credential injection, minimal vendor sprawl
- **Better Auth retained** — proven in production, migration cost not justified
- **PostgreSQL RLS as second security net** — application bugs cannot leak tenant data
- **PgBouncer for connection pooling** — required for multi-instance deployment with RLS
- **Inngest for background jobs** — exactly-once execution across multiple app instances
- **Full invitation system, onboarding wizard, GDPR export, and grace period logic** included from day one

---

## 1. Executive Summary

This document provides a detailed, step-by-step implementation plan for converting the existing single-wedding Next.js application into a commercially hosted, multi-tenant SaaS product.

| Decision Area | Choice | Rationale |
|---|---|---|
| Auth provider | Better Auth (retained) | Already production-tested; migration risk not justified |
| Tenancy model | Row-level, `weddingId` scoped + PostgreSQL RLS | Simple to implement; DB enforces isolation as backstop |
| Connection pooling | PgBouncer (Railway service) | Required for multi-instance; transaction mode supports RLS |
| Billing | Stripe (direct integration) | Full control — trials, grace periods, plan tiers |
| App hosting | Railway (2–3 replicas) | Stateless containers behind Cloudflare load balancer |
| Admin console | Separate Next.js app | Operator visibility into subscriptions, customer support, revenue metrics |
| Database | Railway PostgreSQL 16 | Integrated, daily backups, no extra vendor |
| Redis | Railway Redis 7 | Same project, auto-injected credentials, shared rate limiting |
| File storage | Railway Buckets (S3-compatible) | Native credential injection, zero egress fees |
| Background jobs | Inngest | Exactly-once scheduling; replaces fragile daemon subprocess |
| CDN / edge | Cloudflare (free tier) | DNS, WAF, DDoS, TLS, zero-trust tunnel |
| Membership | `WeddingMember` join table | Supports planners managing multiple weddings |
| Invitation system | Token-based `WeddingInvite` | Couple invites partner / planner without admin seeding |

---

## 2. Infrastructure Stack

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare                                                 │
│  DNS · TLS · WAF · DDoS · CDN · Zero-Trust Tunnel          │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
┌─────────────────┐                 ┌─────────────────┐
│  App Server A   │                 │  App Server B   │
│  Next.js 16     │                 │  Next.js 16     │
│  (Railway)      │                 │  (Railway)      │
└────────┬────────┘                 └────────┬────────┘
         └──────────────┬────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   PgBouncer      │
              │  (transaction    │
              │   pool mode)     │
              └────────┬────────┘
                        │
       ┌────────────────┼───────────────────┐
       ▼                ▼                   ▼
┌────────────┐  ┌────────────┐  ┌──────────────────┐
│ PostgreSQL │  │  Redis 7   │  │  Railway Buckets  │
│     16     │  │ (Railway)  │  │  (S3-compatible)  │
│ (Railway)  │  │            │  │                   │
└────────────┘  └────────────┘  └──────────────────┘

External services:
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Stripe  │  │ Inngest  │  │   SMTP   │
│(billing) │  │  (jobs)  │  │  (email) │
└──────────┘  └──────────┘  └──────────┘

Admin Console (separate app):
┌─────────────────────────────────────┐
│  admin.yourdomain.com               │
│  (Railway — single instance)        │
│  Full visibility into all tenants   │
│  Subscription management            │
│  Support tools                      │
└──────────────────┬──────────────────┘
                   │
                   ▼
         (Same database as main app)
```

---

## 3. Tenancy Model

### 3.1 Row-level tenancy with RLS backstop

All tenant data is filtered by `weddingId` in application code. PostgreSQL Row Level Security provides a second enforcement layer at the database level — even if a developer forgets to add a `weddingId` filter, the database will not return another tenant's rows.

### 3.2 Application layer — requireRole() pattern

Every API route extracts `weddingId` from the auth context. It is never trusted from request body or query params.

```typescript
// Every protected API route follows this pattern:
const auth = await requireRole(['ADMIN', 'VIEWER'], req);
if (!auth.authorized) return auth.response;

const { weddingId, role } = auth;  // weddingId always from session

const guests = await prisma.guest.findMany({
  where: { weddingId },  // Never omit this
});
```

### 3.3 Database layer — PostgreSQL RLS policies

Applied to every tenant-scoped table. A Prisma middleware sets the session variable before each query.

```sql
-- Applied to every tenant table (Guest, Supplier, Table, etc.)
ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Guest"
  USING ("weddingId" = current_setting('app.current_wedding_id'));
```

### 3.4 Connection Pooling with PgBouncer

**Critical requirement:** PgBouncer must run in `transaction` mode for RLS to work correctly.

- `SET LOCAL app.current_wedding_id` must be scoped to a single transaction
- Session mode would leak tenant context between queries on the same connection
- Transaction mode discards session state when the connection returns to the pool

```yaml
# PgBouncer configuration
POOL_MODE: transaction
MAX_CLIENT_CONN: 100
DEFAULT_POOL_SIZE: 25
RESERVE_POOL_SIZE: 5
```

---

## 4. Data Model

### 4.1 New Models

#### Wedding

```prisma
model Wedding {
  id                   String          @id @default(cuid())
  slug                 String          @unique  // e.g. 'simon-natalie-2026'
  coupleName           String          @default("Our Wedding")
  weddingDate          DateTime?
  venueName            String?
  venueAddress         String?
  reminderEmail        String?
  sessionTimeout       Int             @default(30)
  sessionWarningTime   Int             @default(5)

  // Stripe
  stripeCustomerId     String?         @unique
  stripeSubscriptionId String?         @unique
  subscriptionStatus   SubStatus       @default(TRIALING)
  subscriptionPlan     String?         // reserved for future plan tiers
  currentPeriodEnd     DateTime?
  trialEndsAt          DateTime?
  gracePeriodEndsAt    DateTime?       // set on payment failure

  // Data retention
  cancelledAt          DateTime?
  deleteScheduledAt    DateTime?       // 90 days after cancellation

  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  members              WeddingMember[]
  invites              WeddingInvite[]
  guests               Guest[]
  tables               Table[]
  rooms                Room[]
  suppliers            Supplier[]
  payments             Payment[]
  appointments         Appointment[]
  tasks                Task[]
  mealOptions          MealOption[]
  supplierCategories   SupplierCategory[]
  appointmentCategories AppointmentCategory[]
  taskCategories       TaskCategory[]
  attachments          Attachment[]
}

enum SubStatus {
  TRIALING
  ACTIVE
  PAST_DUE    // payment failed — grace period running
  CANCELLED   // subscription ended — read-only
  PAUSED
}
```

#### WeddingMember

```prisma
model WeddingMember {
  id        String    @id @default(cuid())
  userId    String
  weddingId String
  role      UserRole  @default(VIEWER)  // ADMIN | VIEWER | RSVP_MANAGER
  joinedAt  DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  wedding   Wedding   @relation(fields: [weddingId], references: [id], onDelete: Cascade)

  @@unique([userId, weddingId])
  @@index([userId])
  @@index([weddingId])
}
```

#### WeddingInvite

```prisma
model WeddingInvite {
  id        String    @id @default(cuid())
  weddingId String
  token     String    @unique @default(cuid())
  role      UserRole  @default(RSVP_MANAGER)
  email     String?   // optional — pre-fills registration form
  expiresAt DateTime  // 7-day expiry
  usedAt    DateTime?
  usedBy    String?   // userId who accepted
  createdAt DateTime  @default(now())

  wedding   Wedding   @relation(fields: [weddingId], references: [id], onDelete: Cascade)

  @@index([weddingId])
}
```

#### StripeEvent (idempotency)

```prisma
model StripeEvent {
  id          String   @id @default(cuid())
  eventId     String   @unique  // Stripe event ID
  eventType   String
  processedAt DateTime @default(now())
}
```

### 4.2 Modified Models — Add weddingId

Every tenant-scoped table gains a `weddingId` foreign key and composite indexes.

**Tables requiring weddingId:**

| Table | Notes |
|-------|-------|
| Guest | Core tenant data |
| Table | Seating planner |
| Room | Seating planner |
| RoomElement | Seating planner |
| Supplier | Vendor management |
| Payment | Supplier payments |
| Attachment | File uploads |
| Appointment | Calendar |
| Task | To-do items |
| MealOption | Per-wedding meal choices |
| SupplierCategory | Per-wedding categories |
| AppointmentCategory | Per-wedding categories |
| TaskCategory | Per-wedding categories |

**Tables WITHOUT weddingId (global):**

| Table | Notes |
|-------|-------|
| User | Global identity |
| Session | Better Auth |
| Account | Better Auth |
| Verification | Better Auth |
| BackupCode | User-scoped |
| TrustedDevice | User-scoped |
| LoginAttempt | Security audit |

### 4.3 Modified User Model

User becomes a pure identity record. Role moves to `WeddingMember.role`.

```prisma
model User {
  id               String          @id @default(cuid())
  email            String          @unique
  name             String?
  // role field REMOVED — now per-wedding on WeddingMember
  twoFactorEnabled Boolean         @default(false)
  twoFactorSecret  String?
  lockedUntil      DateTime?
  sessionVersion   Int             @default(0)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  weddings         WeddingMember[]
  backupCodes      BackupCode[]
  sessions         Session[]
  accounts         Account[]
  trustedDevices   TrustedDevice[]
}
```

### 4.4 Removed

- `WeddingConfig` model — replaced by `Wedding`
- `UserRole` on `User` — moved to `WeddingMember.role`
- Singleton pattern (`id = 1`) — replaced by `weddingId` scoping
- `SEED_ADMIN_*` environment variables — replaced by registration flow

---

## 5. Authentication & Session

### 5.1 Better Auth Retained

The existing email+password login, TOTP 2FA, backup codes, trusted devices, and session management all work correctly and are production-tested. The session is extended to carry the active `weddingId`.

### 5.2 Login Flow with Wedding Context

```
1. User submits email + password
2. Better Auth validates credentials → creates session (unchanged)
3. App fetches user's WeddingMember records
4. If one wedding  → auto-select, set weddingId cookie
5. If multiple    → redirect to /select-wedding picker
6. If zero weddings → redirect to /register (edge case: deleted membership)
7. All subsequent requests carry: session cookie + weddingId cookie
8. requireRole() validates both on every protected route
```

### 5.3 Updated requireRole()

```typescript
type AuthSuccess = {
  authorized: true;
  user: SessionUser;
  weddingId: string;
  role: UserRole;
  wedding: {
    subscriptionStatus: SubStatus;
    currentPeriodEnd: Date | null;
    gracePeriodEndsAt: Date | null;
  };
};

export async function requireRole(
  allowedRoles: UserRole[],
  req: NextRequest
): Promise<AuthSuccess | AuthFailure> {
  // 1. Validate Better Auth session (unchanged)
  // 2. Read weddingId from cookie
  // 3. Validate user is a member of that wedding with required role
  // 4. Check subscription: ACTIVE or TRIALING or within grace period
  // 5. Check sessionVersion (unchanged)
  // Returns { authorized: true, user, weddingId, role, wedding }
}
```

### 5.4 Middleware Changes

```
Request comes in:
  1. Is path public?
     (/login /register /invite/* /rsvp/* /api/auth/* /api/webhooks/* /api/health)
                                                         → pass through
  2. Is session valid?                      → no  → redirect /login
  3. Is weddingId cookie set?               → no  → redirect /select-wedding
  4. Is subscription ACTIVE or TRIALING?    → no  →
       within grace period?                 → yes → show warning banner, allow through
       past grace period?                   → redirect /billing/suspended (read-only)
  5. Pass through to route handler
```

### 5.5 Wedding Context Cookie

```typescript
// Cookie name: weddingId
// Value: wedding.cuid
// Attributes: HttpOnly, Secure, SameSite=Lax
// Max-age: 30 days (matches session length)

// Set after login/wedding selection:
res.cookies.set('weddingId', wedding.id, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30, // 30 days
});
```

---

## 6. Stripe Billing

### 6.1 Subscription Lifecycle

| Stripe Event | Action in Database | User Impact |
|---|---|---|
| `checkout.session.completed` | Create User + Wedding + WeddingMember(ADMIN), set `stripeCustomerId` | App access granted, onboarding wizard shown |
| `invoice.payment_succeeded` | `subscriptionStatus = ACTIVE`, update `currentPeriodEnd` | Continued access |
| `invoice.payment_failed` | `subscriptionStatus = PAST_DUE`, set `gracePeriodEndsAt = now + 7 days` | Warning banner shown, full access maintained for 7 days |
| Grace period expires | Inngest daily job: `subscriptionStatus = CANCELLED` if past `gracePeriodEndsAt` | Redirect to `/billing/suspended`, read-only mode |
| `customer.subscription.deleted` | `subscriptionStatus = CANCELLED`, set `deleteScheduledAt = now + 90 days` | Read-only, data export email sent |
| `customer.subscription.trial_will_end` | Trigger Inngest event: send reminder email 3 days before | Email to couple warning trial ending |

### 6.2 Grace Period Design

On payment failure the customer gets 7 days of continued full access before any lockout. This is stored as `gracePeriodEndsAt` on the `Wedding` record. A daily Inngest job checks all `PAST_DUE` weddings and moves them to `CANCELLED` after the grace period.

**Why not webhook-driven?** Stripe may retry the payment multiple times during the grace period. Using a daily job avoids race conditions between Stripe events and lockout timing.

### 6.3 Initial Pricing

| Plan | Price | Features |
|---|---|---|
| Trial | 14 days free, full access | All features, no credit card required at signup |
| Standard | £12/month | Full access to all features |

Store `subscriptionPlan` on `Wedding` now even if launching with one tier — adds plan-based feature gating later without a migration.

### 6.4 Webhook Idempotency

```typescript
// POST /api/webhooks/stripe
export async function POST(req: NextRequest) {
  const event = await stripe.webhooks.constructEvent(...);

  // Check if already processed
  const existing = await prisma.stripeEvent.findUnique({
    where: { eventId: event.id }
  });
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Process event...

  // Record as processed
  await prisma.stripeEvent.create({
    data: {
      eventId: event.id,
      eventType: event.type,
    }
  });

  return NextResponse.json({ received: true });
}
```

### 6.5 New Routes

```
POST /api/register                  — Create Stripe Checkout session (trial start)
POST /api/billing/portal            — Redirect to Stripe Customer Portal
POST /api/webhooks/stripe           — Stripe event handler (sig-validated, idempotent)
GET  /billing/suspended             — Read-only lapsed subscription page
GET  /billing                       — Billing management (portal redirect)
```

---

## 7. Invitation System

### 7.1 Flow Overview

```
Admin creates invite:
  POST /api/invites { role: 'RSVP_MANAGER', email: 'planner@example.com' }
  → Creates WeddingInvite with 7-day expiry token
  → Sends email: 'You've been invited to join [Couple Name]'s wedding'

Invitee clicks link → GET /invite/[token]
  → Token valid?
      Existing account → 'Join [Couple Name]' confirm page
      No account       → Registration form (no Stripe — joining, not creating)
  → POST /api/invites/[token]/accept
      → Create User if needed (Better Auth credentials)
      → Create WeddingMember with role from invite
      → Mark invite as usedAt, usedBy
      → Redirect to /dashboard
```

### 7.2 Routes

| Route | Method | Access |
|---|---|---|
| `/api/invites` | POST | ADMIN — create invite |
| `/api/invites` | GET | ADMIN — list active invites |
| `/api/invites/[id]` | DELETE | ADMIN — revoke invite |
| `/api/invites/[token]/accept` | POST | Public — accept invite |
| `/invite/[token]` | GET page | Public — accept UI |

### 7.3 Rate Limiting

Add rate limiting to `/invite/[token]` and `/api/invites/[token]/accept`:
- Per-IP: 10 requests per minute
- Per-token: 5 attempts per minute

---

## 8. File Storage — Railway Buckets

### 8.1 Key Structure

```
Bucket: wedding-planner-uploads

/{weddingId}/suppliers/{supplierId}/{uuid}_{originalFilename}
/{weddingId}/receipts/{paymentId}/{uuid}_{originalFilename}
```

### 8.2 S3 Client Setup

```typescript
// src/lib/s3.ts
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

export const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.RAILWAY_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.RAILWAY_BUCKET_ACCESS_KEY_ID!,
    secretAccessKey: process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY!,
  },
});

export async function uploadFile(
  weddingId: string,
  path: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const key = `${weddingId}/${path}/${filename}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.RAILWAY_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

export async function getPresignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.RAILWAY_BUCKET_NAME,
    Key: key,
  }), { expiresIn });
}
```

### 8.3 API Route Changes

```typescript
// Upload (server-side):
const key = await uploadFile(
  weddingId,
  `suppliers/${supplierId}`,
  `${uuid}_${filename}`,
  buffer,
  file.type
);

// Download — presigned URL:
const url = await getPresignedUrl(attachment.storedAs);
return NextResponse.redirect(url);
```

The session check is preserved — validate Better Auth session and that the `supplierId` belongs to the requesting wedding before generating the presigned URL.

---

## 9. Background Jobs — Inngest

### 9.1 Functions to Migrate

| Function | Trigger | Purpose |
|---|---|---|
| `appointment-reminders` | Cron: `0 * * * *` (hourly) | Check all weddings for appointments needing reminders |
| `mark-overdue-payments` | Cron: `0 6 * * *` (daily 6am) | Mark payments PENDING with dueDate < today as OVERDUE |
| `trial-ending-reminder` | Event: `stripe/trial.will_end` | Send email 3 days before trial ends |
| `payment-failure-email` | Event: `stripe/payment.failed` | Send grace period warning email |
| `grace-period-expiry` | Cron: `0 5 * * *` (daily 5am) | Move `PAST_DUE` → `CANCELLED` after grace period |
| `cancellation-data-export` | Event: `wedding/cancelled` | Send data export reminder email |
| `welcome-email` | Event: `wedding/created` | Send onboarding email after signup |
| `purge-expired-weddings` | Cron: `0 3 * * *` (daily 3am) | Delete data 90 days after cancellation |

### 9.2 Inngest Setup

```typescript
// src/lib/inngest/client.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'wedding-planner',
  eventKey: process.env.INNGEST_EVENT_KEY!,
});

// src/lib/inngest/functions/appointment-reminders.ts
import { inngest } from '../client';

export const appointmentReminders = inngest.createFunction(
  { id: 'appointment-reminders', name: 'Check Appointment Reminders' },
  { cron: '0 * * * *' },
  async ({ step }) => {
    const weddings = await step.run('fetch-active-weddings', async () => {
      return prisma.wedding.findMany({
        where: {
          subscriptionStatus: { in: ['ACTIVE', 'TRIALING'] }
        },
        include: { appointments: true }
      });
    });

    for (const wedding of weddings) {
      await step.run(`check-wedding-${wedding.id}`, async () => {
        // Check each appointment for reminder...
      });
    }
  }
);
```

### 9.3 New Route

```
POST /api/inngest  — Inngest webhook endpoint (receives scheduled events)
```

---

## 10. Shared Cache — Railway Redis

### 10.1 Cache Key Structure

```
# All keys prefixed with weddingId
{weddingId}:wedding-config
{weddingId}:meal-options
{weddingId}:supplier-categories
{weddingId}:appointment-categories
{weddingId}:task-categories

# TTL: 5 minutes (300s)
```

### 10.2 Implementation

```typescript
// src/lib/cache.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function getCached<T>(
  key: string,  // should include weddingId prefix
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  const data = await fetcher();
  await redis.set(key, JSON.stringify(data), 'EX', Math.floor(ttlMs / 1000));
  return data;
}

export async function invalidateCache(key: string): Promise<void> {
  await redis.del(key);
}
```

---

## 11. PostgreSQL Row-Level Security

### 11.1 RLS Policies

Apply to all tenant-scoped tables:

```sql
-- Enable RLS
ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Table" ENABLE ROW LEVEL SECURITY;
-- ... repeat for all tenant tables

-- Create policy for each table
CREATE POLICY tenant_isolation ON "Guest"
  USING ("weddingId" = current_setting('app.current_wedding_id')::text);

CREATE POLICY tenant_isolation ON "Supplier"
  USING ("weddingId" = current_setting('app.current_wedding_id')::text);

-- ... repeat for all tenant tables
```

### 11.2 Prisma Middleware

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Middleware to set RLS session variable
prisma.$use(async (params, next) => {
  // Get weddingId from AsyncLocalStorage or context
  const weddingId = getWeddingContext();

  if (weddingId && isTenantModel(params.model)) {
    await prisma.$executeRaw`
      SET LOCAL app.current_wedding_id = ${weddingId}
    `;
  }

  return next(params);
});

function isTenantModel(model: string): boolean {
  const tenantModels = [
    'Guest', 'Supplier', 'Table', 'Room', 'RoomElement',
    'Payment', 'Attachment', 'Appointment', 'Task',
    'MealOption', 'SupplierCategory', 'AppointmentCategory', 'TaskCategory'
  ];
  return tenantModels.includes(model);
}

export { prisma };
```

**Note:** Prisma `$use` middleware is deprecated. Consider using `$extends` with a client extension, or setting the session variable explicitly in each transaction block.

---

## 12. GDPR & Data Retention

### 12.1 Data Export

```typescript
// GET /api/export
export async function GET(req: NextRequest) {
  const auth = await requireRole(['ADMIN'], req);
  if (!auth.authorized) return auth.response;

  const { weddingId } = auth;

  // Fetch all wedding data
  const wedding = await prisma.wedding.findUnique({
    where: { id: weddingId },
    include: {
      guests: true,
      tables: { include: { guests: true } },
      rooms: { include: { tables: true, elements: true } },
      suppliers: { include: { payments: true, attachments: true } },
      appointments: true,
      tasks: true,
      mealOptions: true,
      // ... all relations
    }
  });

  // Generate zip file
  const zip = await generateExportZip(wedding);

  // Return as download
  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="wedding-${weddingId}-export.zip"`
    }
  });
}
```

### 12.2 Data Deletion Schedule

```
On subscription cancellation:
  → subscriptionStatus = CANCELLED
  → deleteScheduledAt = now() + 90 days
  → Send data export + deletion notice email to couple

Daily Inngest job: purge-expired-weddings
  → Find all weddings where deleteScheduledAt < now()
  → Delete all related rows (cascades via FK)
  → Delete all files in S3 under /{weddingId}/
  → Delete Wedding record
```

### 12.3 Retention Emails

| Trigger | Email |
|---------|-------|
| Cancellation | "Your wedding data will be deleted in 90 days. Download your data now." |
| 7 days before deletion | "Your wedding data will be permanently deleted in 7 days." |
| Deletion complete | Confirmation of deletion (if email still deliverable) |

---

## 13. Environment Variables

### 13.1 New Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STANDARD=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Railway Buckets (auto-injected by Railway)
RAILWAY_BUCKET_ENDPOINT=https://...
RAILWAY_BUCKET_ACCESS_KEY_ID=...
RAILWAY_BUCKET_SECRET_ACCESS_KEY=...
RAILWAY_BUCKET_NAME=wedding-planner-uploads

# Redis (auto-injected by Railway)
REDIS_URL=redis://...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# App
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
TRIAL_DAYS=14
GRACE_PERIOD_DAYS=7
DATA_RETENTION_DAYS=90

# Database (through PgBouncer)
DATABASE_URL=postgresql://...@pgbouncer:5432/...
DIRECT_DATABASE_URL=postgresql://...@postgres:5432/...
```

### 13.2 Removed Variables

```bash
SEED_ADMIN_1_NAME / EMAIL / PASSWORD   # replaced by registration flow
SEED_ADMIN_2_* / SEED_ADMIN_3_*        # replaced by invitation system
```

---

## 14. New Pages & API Routes

### 14.1 New Pages

| Path | Purpose |
|---|---|
| `/register` | Sign up form → Stripe Checkout → trial start |
| `/invite/[token]` | Accept wedding invitation (join existing wedding) |
| `/select-wedding` | Wedding picker for planners managing multiple weddings |
| `/billing` | Subscription status + Stripe Customer Portal link |
| `/billing/suspended` | Read-only notice when subscription lapsed past grace period |
| `/onboarding/wedding` | Post-registration: set couple name, date, venue |
| `/onboarding/invite` | Post-registration: invite partner or wedding planner |
| `/onboarding/done` | Onboarding complete — redirect to dashboard |

### 14.2 New API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/register` | POST | Create Stripe Checkout session |
| `/api/billing/portal` | POST | Create Stripe Customer Portal session |
| `/api/webhooks/stripe` | POST | Stripe event handler |
| `/api/inngest` | POST | Inngest job handler |
| `/api/invites` | GET / POST | List / create wedding invitations |
| `/api/invites/[id]` | DELETE | Revoke invitation |
| `/api/invites/[token]/accept` | POST | Accept invitation |
| `/api/weddings/current` | GET / PATCH | Active wedding config (replaces `/api/settings`) |
| `/api/export` | GET | GDPR data export (ADMIN only) |
| `/api/weddings` | POST | Create new wedding (for multi-wedding planners) |

### 14.3 Removed Routes

- `/api/settings` → replaced by `/api/weddings/current`
- `/api/users` (seed-based management) → replaced by invitation system

### 14.4 Admin Console Pages (Separate App)

**Hosted at:** `admin.yourdomain.com`

| Path | Purpose |
|---|---|
| `/login` | Admin authentication (single operator or SSO) |
| `/` | Dashboard — total weddings, MRR, active trials, conversion metrics |
| `/weddings` | List all weddings with search, filter by status |
| `/weddings/[id]` | Single wedding detail — subscription, members, usage stats |
| `/subscriptions` | All Stripe subscriptions, revenue metrics |
| `/users` | All users across all weddings |
| `/support` | Generate magic link to impersonate user for debugging |

### 14.5 Admin Console API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/weddings` | GET | List all weddings (paginated, filterable) |
| `/api/admin/weddings/[id]` | GET | Wedding detail with subscription info |
| `/api/admin/weddings/[id]/extend-trial` | POST | Extend trial period |
| `/api/admin/weddings/[id]/cancel` | POST | Cancel subscription (graceful) |
| `/api/admin/weddings/[id]/apply-discount` | POST | Apply coupon/discount |
| `/api/admin/stats` | GET | Aggregate metrics (MRR, churn, conversion) |
| `/api/admin/users` | GET | List all users |
| `/api/admin/support/magic-link` | POST | Generate impersonation link |

---

## 15. Admin Console Architecture

### 15.1 Why a Separate App?

The admin console is a separate Next.js application for several reasons:

| Reason | Explanation |
|--------|-------------|
| **Separate concerns** | Operator tools are fundamentally different from user-facing features |
| **Different auth** | Admin console has its own authentication (single operator or small team) |
| **Security isolation** | Admin tools are not exposed to end users; smaller attack surface |
| **Independent deployment** | Can update admin tools without redeploying main app |
| **Future team growth** | Can add support staff with limited permissions later |

### 15.2 Architecture

```
admin-app/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx              # Dashboard
│   │   │   ├── weddings/
│   │   │   │   ├── page.tsx          # Weddings list
│   │   │   │   └── [id]/page.tsx     # Wedding detail
│   │   │   ├── subscriptions/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   └── support/page.tsx
│   │   └── api/
│   │       └── admin/
│   │           ├── weddings/
│   │           ├── stats/
│   │           └── support/
│   ├── lib/
│   │   ├── prisma.ts                 # Same Prisma client
│   │   ├── auth.ts                   # Admin-only auth
│   │   └── stripe.ts                 # Stripe admin operations
│   └── components/
├── prisma/
│   └── schema.prisma                 # Symlinked or shared package
├── package.json
└── next.config.js
```

### 15.3 Database Sharing

The admin console shares the same PostgreSQL database as the main app:

```typescript
// admin-app/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // Same as main app
    },
  },
});
```

Options for schema sharing:

| Approach | Pros | Cons |
|----------|------|------|
| Symlink `prisma/schema.prisma` | Simple, single source of truth | Requires build step |
| Shared npm package | Clean separation | Publishing overhead |
| Duplicate schema | Independent | Drift risk |

**Recommended:** Symlink the schema file for simplicity.

### 15.4 Authentication

Admin authentication is separate from user authentication:

```typescript
// admin-app/src/lib/auth.ts
import { compare } from 'bcryptjs';

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH!;

export async function verifyAdmin(password: string): Promise<boolean> {
  return compare(password, ADMIN_PASSWORD_HASH);
}

// Or use Google OAuth for single email:
import { NextAuth } from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // Restrict to specific email
  callbacks: {
    async signIn({ user }) {
      return user.email === process.env.ADMIN_EMAIL;
    },
  },
});
```

### 15.5 Dashboard Metrics

```typescript
// GET /api/admin/stats
export async function GET() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalWeddings,
    activeSubscriptions,
    trialing,
    pastDue,
    cancelled,
    totalUsers,
    mrr,
    newThisMonth,
    churnedThisMonth,
  ] = await Promise.all([
    prisma.wedding.count(),
    prisma.wedding.count({ where: { subscriptionStatus: 'ACTIVE' } }),
    prisma.wedding.count({ where: { subscriptionStatus: 'TRIALING' } }),
    prisma.wedding.count({ where: { subscriptionStatus: 'PAST_DUE' } }),
    prisma.wedding.count({ where: { subscriptionStatus: 'CANCELLED' } }),
    prisma.user.count(),
    calculateMRR(),
    prisma.wedding.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.wedding.count({
      where: {
        subscriptionStatus: 'CANCELLED',
        cancelledAt: { gte: startOfMonth }
      }
    }),
  ]);

  return NextResponse.json({
    totalWeddings,
    activeSubscriptions,
    trialing,
    pastDue,
    cancelled,
    totalUsers,
    mrr,
    newThisMonth,
    churnedThisMonth,
    conversionRate: calculateConversionRate(),
    churnRate: calculateChurnRate(),
  });
}

async function calculateMRR(): Promise<number> {
  const active = await prisma.wedding.findMany({
    where: { subscriptionStatus: 'ACTIVE' },
    select: { subscriptionPlan: true },
  });
  // Sum up subscription values (all £12 for now)
  return active.length * 12;
}
```

### 15.6 Wedding Detail View

```typescript
// GET /api/admin/weddings/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const wedding = await prisma.wedding.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      },
      guests: { select: { id: true } },
      suppliers: { select: { id: true } },
      tasks: { select: { id: true } },
      attachments: { select: { id: true, sizeBytes: true } },
    },
  });

  if (!wedding) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Calculate storage used
  const storageBytes = wedding.attachments.reduce((sum, a) => sum + a.sizeBytes, 0);

  return NextResponse.json({
    ...wedding,
    stats: {
      guestCount: wedding.guests.length,
      supplierCount: wedding.suppliers.length,
      taskCount: wedding.tasks.length,
      storageBytes,
      storageMB: Math.round(storageBytes / 1024 / 1024 * 100) / 100,
    },
  });
}
```

### 15.7 Support Impersonation

For debugging user issues, generate a magic link:

```typescript
// POST /api/admin/support/magic-link
export async function POST(req: NextRequest) {
  const { userId, weddingId } = await req.json();

  // Create a temporary token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store in database (or use JWT)
  await prisma.supportToken.create({
    data: {
      token,
      userId,
      weddingId,
      expiresAt,
      createdBy: 'admin', // Track who created it
    }
  });

  // Return the magic link
  const magicLink = `${process.env.MAIN_APP_URL}/support/login?token=${token}`;

  return NextResponse.json({ magicLink, expiresAt });
}

// Main app: GET /support/login?token=xxx
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  const supportToken = await prisma.supportToken.findUnique({
    where: { token },
  });

  if (!supportToken || supportToken.expiresAt < new Date()) {
    return NextResponse.redirect('/login?error=invalid_token');
  }

  // Create session for user
  // Set weddingId cookie
  // Delete token

  return NextResponse.redirect('/dashboard');
}
```

### 15.8 Deployment

The admin console deploys as a separate Railway service:

```yaml
# railway.json (in repo root)
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {},
  "deploy": {
    "startCommand": "next start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Railway services:
1. `wedding-planner-app` (2-3 replicas)
2. `wedding-planner-admin` (1 replica)
3. `postgres`
4. `redis`
5. `pgbouncer`
6. `bucket`

---

## 16. What Does Not Change

The following can be copied directly from the personal app with minimal or no modification:

| Area | Files / modules |
|---|---|
| All UI components | `src/components/` — no tenancy awareness needed in the UI layer |
| Business logic | `src/lib/rsvpStatus.ts`, `src/lib/csv.ts`, `src/lib/validation.ts` |
| Public RSVP flow | `/rsvp/[token]` — `rsvpToken` is globally unique, no `weddingId` cookie needed |
| Seating canvas | react-konva `SeatingVisualView` — unchanged |
| Print views | Full guest list and RSVP summary print routes |
| 2FA / backup codes | TOTP, backup codes, trusted devices — all retained as-is |
| Email templates | `src/lib/email.ts` — nodemailer config unchanged |
| Rate limiting | `src/lib/rate-limit.ts` — already Redis-backed with fallback |
| Error handling | `src/lib/db-error.ts`, `src/lib/filename.ts` |
| Most API route logic | Only `weddingId` filter and auth context change; core business logic is identical |

---

## 17. Implementation Phases

Six phases, each independently deployable. The existing single-wedding app continues running on the Mac mini until the final cutover in Phase 6.

---

## Phase 1 — Foundation

**Duration:** 5–7 days
**Risk Level:** High — core change, breaks everything until complete

### 1.1 Prisma Schema Updates

**Tasks:**

1. Create `Wedding` model with all fields from section 4.1
2. Create `WeddingMember` model with unique constraint on `[userId, weddingId]`
3. Create `WeddingInvite` model
4. Create `StripeEvent` model for webhook idempotency
5. Remove `role` field from `User` model
6. Add `weddingId` to all tenant-scoped models:
   - Guest, Table, Room, RoomElement
   - Supplier, Payment, Attachment
   - Appointment, Task
   - MealOption, SupplierCategory, AppointmentCategory, TaskCategory
7. Add composite indexes for `weddingId` + frequently queried fields
8. Remove `WeddingConfig` model
9. Generate migration: `npx prisma migrate dev --name add_multi_tenant`

**Verification:**
- [ ] Migration runs successfully on local PostgreSQL
- [ ] All existing data still queryable (weddingId is nullable initially)
- [ ] Prisma Studio shows new models

---

### 1.2 Data Migration Script

**Tasks:**

1. Create `prisma/migrations/seed-wedding.ts`:
   ```typescript
   // One-time script to migrate existing data
   // Creates a Wedding from existing WeddingConfig
   // Assigns all existing data to that wedding
   // Creates WeddingMember for each existing User

   async function migrateExistingData() {
     // 1. Fetch existing WeddingConfig
     const config = await prisma.weddingConfig.findUnique({ where: { id: 1 } });

     // 2. Create Wedding from config
     const wedding = await prisma.wedding.create({
       data: {
         slug: 'simon-natalie-2026',
         coupleName: config.coupleName,
         weddingDate: config.weddingDate,
         venueName: config.venueName,
         venueAddress: config.venueAddress,
         reminderEmail: config.reminderEmail,
         sessionTimeout: config.sessionTimeoutMinutes,
         sessionWarningTime: config.warningMinutes,
         subscriptionStatus: 'ACTIVE', // Existing users get grandfathered
       }
     });

     // 3. Update all tenant data with weddingId
     await prisma.guest.updateMany({ data: { weddingId: wedding.id } });
     await prisma.supplier.updateMany({ data: { weddingId: wedding.id } });
     // ... repeat for all tenant tables

     // 4. Create WeddingMember for each user
     const users = await prisma.user.findMany();
     for (const user of users) {
       await prisma.weddingMember.create({
         data: {
           userId: user.id,
           weddingId: wedding.id,
           role: 'ADMIN', // All existing users are admins
         }
       });
     }

     // 5. Delete WeddingConfig
     await prisma.weddingConfig.delete({ where: { id: 1 } });
   }
   ```

2. Test migration script on a copy of production data
3. Document rollback procedure

**Verification:**
- [ ] All existing guests have weddingId set
- [ ] All existing suppliers have weddingId set
- [ ] All other tenant data has weddingId set
- [ ] All users are WeddingMembers with ADMIN role
- [ ] WeddingConfig no longer exists

---

### 1.3 Update requireRole()

**Tasks:**

1. Update `src/lib/session.ts`:
   ```typescript
   export async function requireRole(
     allowedRoles: UserRole[],
     req: NextRequest
   ): Promise<AuthSuccess | AuthFailure> {
     // 1. Get Better Auth session
     const session = await getSession(req);
     if (!session) {
       return { authorized: false, response: NextResponse.redirect('/login') };
     }

     // 2. Get weddingId from cookie
     const weddingId = req.cookies.get('weddingId')?.value;
     if (!weddingId) {
       // Check if user has any weddings
       const membership = await prisma.weddingMember.findFirst({
         where: { userId: session.user.id }
       });
       if (!membership) {
         return { authorized: false, response: NextResponse.redirect('/register') };
       }
       // Auto-select first wedding
       const response = NextResponse.redirect('/dashboard');
       response.cookies.set('weddingId', membership.weddingId, {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax',
         maxAge: 60 * 60 * 24 * 30,
       });
       return { authorized: false, response };
     }

     // 3. Validate membership and role
     const membership = await prisma.weddingMember.findUnique({
       where: { userId_weddingId: { userId: session.user.id, weddingId } },
       include: { wedding: true }
     });

     if (!membership) {
       return { authorized: false, response: NextResponse.redirect('/select-wedding') };
     }

     if (!allowedRoles.includes(membership.role)) {
       return { authorized: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
     }

     // 4. Check subscription status
     const wedding = membership.wedding;
     const now = new Date();
     const isGracePeriodActive = wedding.gracePeriodEndsAt && wedding.gracePeriodEndsAt > now;

     if (!['ACTIVE', 'TRIALING'].includes(wedding.subscriptionStatus) && !isGracePeriodActive) {
       return { authorized: false, response: NextResponse.redirect('/billing/suspended') };
     }

     // 5. Check session version
     if (session.user.sessionVersion !== session.user.sessionVersion) {
       return { authorized: false, response: NextResponse.redirect('/login') };
     }

     return {
       authorized: true,
       user: session.user,
       weddingId,
       role: membership.role,
       wedding: {
         subscriptionStatus: wedding.subscriptionStatus,
         currentPeriodEnd: wedding.currentPeriodEnd,
         gracePeriodEndsAt: wedding.gracePeriodEndsAt,
       }
     };
   }
   ```

2. Update all API route imports to use new return type
3. Add `weddingId` parameter to all Prisma queries

**Verification:**
- [ ] requireRole returns weddingId
- [ ] requireRole validates membership
- [ ] requireRole checks subscription status
- [ ] All API routes updated to use weddingId from auth context

---

### 1.4 Update All API Routes

**Pattern:**

```typescript
// Before:
export async function GET(req: NextRequest) {
  const auth = await requireRole(['ADMIN', 'VIEWER'], req);
  if (!auth.authorized) return auth.response;

  const guests = await prisma.guest.findMany();
  return NextResponse.json(guests);
}

// After:
export async function GET(req: NextRequest) {
  const auth = await requireRole(['ADMIN', 'VIEWER'], req);
  if (!auth.authorized) return auth.response;

  const { weddingId } = auth;

  const guests = await prisma.guest.findMany({
    where: { weddingId },  // Always filter by weddingId
  });
  return NextResponse.json(guests);
}
```

**Tasks:**

1. Update all GET handlers in `/api/guests/*`
2. Update all GET handlers in `/api/suppliers/*`
3. Update all GET handlers in `/api/payments/*`
4. Update all GET handlers in `/api/appointments/*`
5. Update all GET handlers in `/api/tasks/*`
6. Update all GET handlers in `/api/tables/*`
7. Update all GET handlers in `/api/rooms/*`
8. Update all GET handlers in `/api/seating/*`
9. Update all POST handlers to include `weddingId` on create
10. Update all PUT handlers to filter by `weddingId`
11. Update all DELETE handlers to filter by `weddingId`

**Files to update (approximate count):**

| Route Group | Files |
|-------------|-------|
| `/api/guests/*` | 8 files |
| `/api/suppliers/*` | 6 files |
| `/api/payments/*` | 3 files |
| `/api/appointments/*` | 3 files |
| `/api/tasks/*` | 4 files |
| `/api/tables/*` | 4 files |
| `/api/rooms/*` | 3 files |
| `/api/seating/*` | 2 files |
| `/api/meal-options/*` | 2 files |
| `/api/*-categories/*` | 6 files |

**Verification:**
- [ ] All API routes filter by weddingId
- [ ] No route trusts weddingId from request body or query params
- [ ] All POST routes set weddingId on new records

---

### 1.5 Update Middleware

**Tasks:**

1. Update `src/middleware.ts`:
   ```typescript
   export async function middleware(req: NextRequest) {
     const { pathname } = req.nextUrl;

     // Public paths
     const publicPaths = [
       '/login',
       '/register',
       '/invite/',
       '/rsvp/',
       '/api/auth/',
       '/api/webhooks/',
       '/api/health',
     ];

     if (publicPaths.some(p => pathname.startsWith(p))) {
       return NextResponse.next();
     }

     // Check session
     const session = await getSession(req);
     if (!session) {
       return NextResponse.redirect(new URL('/login', req.url));
     }

     // Check weddingId cookie
     const weddingId = req.cookies.get('weddingId')?.value;
     if (!weddingId) {
       return NextResponse.redirect(new URL('/select-wedding', req.url));
     }

     // Check subscription (optional here, requireRole does it too)
     // But we can add a grace period banner here

     return NextResponse.next();
   }
   ```

2. Add grace period warning header injection

**Verification:**
- [ ] Middleware redirects unauthenticated users to /login
- [ ] Middleware redirects users without weddingId to /select-wedding
- [ ] Public paths are accessible without auth

---

### 1.6 Replace WeddingConfig with Wedding

**Tasks:**

1. Update `/api/settings` → `/api/weddings/current`:
   ```typescript
   // GET /api/weddings/current
   export async function GET(req: NextRequest) {
     const auth = await requireRole(['ADMIN', 'VIEWER', 'RSVP_MANAGER'], req);
     if (!auth.authorized) return auth.response;

     const wedding = await prisma.wedding.findUnique({
       where: { id: auth.weddingId }
     });

     return NextResponse.json(wedding);
   }

   // PATCH /api/weddings/current
   export async function PATCH(req: NextRequest) {
     const auth = await requireRole(['ADMIN'], req);
     if (!auth.authorized) return auth.response;

     const data = await req.json();

     const wedding = await prisma.wedding.update({
       where: { id: auth.weddingId },
       data: {
         coupleName: data.coupleName,
         weddingDate: data.weddingDate ? new Date(data.weddingDate) : null,
         venueName: data.venueName,
         venueAddress: data.venueAddress,
         reminderEmail: data.reminderEmail,
         sessionTimeout: data.sessionTimeout,
         sessionWarningTime: data.sessionWarningTime,
       }
     });

     return NextResponse.json(wedding);
   }
   ```

2. Update all references to `/api/settings` to `/api/weddings/current`
3. Update Settings page to use new endpoint
4. Update Dashboard to use new endpoint
5. Update RSVP page to fetch wedding from guest's weddingId

**Verification:**
- [ ] Settings page loads wedding data
- [ ] Settings page saves wedding data
- [ ] Dashboard displays couple name and date
- [ ] RSVP page displays wedding info

---

### 1.7 PostgreSQL RLS Policies

**Tasks:**

1. Create migration for RLS:
   ```sql
   -- prisma/migrations/xxx_add_rls/migration.sql

   -- Enable RLS on all tenant tables
   ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Table" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "RoomElement" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "MealOption" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "SupplierCategory" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "AppointmentCategory" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "TaskCategory" ENABLE ROW LEVEL SECURITY;

   -- Create policies
   CREATE POLICY tenant_isolation ON "Guest"
     USING ("weddingId" = current_setting('app.current_wedding_id', true)::text);

   -- Repeat for all tables...
   ```

2. Create Prisma middleware for session variable:
   ```typescript
   // src/lib/prisma.ts
   import { AsyncLocalStorage } from 'async_hooks';

   const weddingContext = new AsyncLocalStorage<string>();

   export function setWeddingContext(weddingId: string, fn: () => Promise<any>) {
     return weddingContext.run(weddingId, fn);
   }

   export function getWeddingContext(): string | undefined {
     return weddingContext.getStore();
   }

   prisma.$use(async (params, next) => {
     const weddingId = getWeddingContext();
     if (weddingId) {
       await prisma.$executeRaw`SELECT set_config('app.current_wedding_id', ${weddingId}, true)`;
     }
     return next(params);
   });
   ```

3. Update requireRole to wrap queries in context:
   ```typescript
   export async function requireRole(...) {
     // ... existing logic ...

     return {
       ...auth,
       // Provide a wrapper for Prisma calls
       withWeddingContext: <T>(fn: () => Promise<T>) => setWeddingContext(weddingId, fn),
     };
   }
   ```

**Verification:**
- [ ] RLS policies created on all tenant tables
- [ ] Prisma middleware sets session variable
- [ ] Test: query without session variable returns no rows
- [ ] Test: query with session variable returns only matching rows

---

### 1.8 Update Permissions System

**Tasks:**

1. Update `src/lib/permissions.ts`:
   ```typescript
   // Role is now from WeddingMember, not User
   export function getPermissions(role: UserRole) {
     return {
       can: {
         editGuests: role === 'ADMIN' || role === 'RSVP_MANAGER',
         deleteGuests: role === 'ADMIN' || role === 'RSVP_MANAGER',
         manageRsvp: role === 'ADMIN' || role === 'RSVP_MANAGER',
         importExportGuests: role === 'ADMIN' || role === 'RSVP_MANAGER',
         editSeating: role === 'ADMIN',
         editSuppliers: role === 'ADMIN',
         editPayments: role === 'ADMIN',
         editAppointments: role === 'ADMIN',
         editTasks: role === 'ADMIN',
         completeTasks: role === 'ADMIN' || role === 'RSVP_MANAGER',
         viewTasks: true,
         manageUsers: role === 'ADMIN',
         manageSettings: role === 'ADMIN',
         accessSuppliers: role === 'ADMIN' || role === 'VIEWER',
         accessPayments: role === 'ADMIN' || role === 'VIEWER',
         accessSettings: role === 'ADMIN',
       },
       isAdmin: role === 'ADMIN',
       isViewer: role === 'VIEWER',
       isRsvpManager: role === 'RSVP_MANAGER',
     };
   }
   ```

2. Update `src/hooks/usePermissions.ts`:
   ```typescript
   export function usePermissions() {
     const { data: session } = useSession();
     // Role comes from the active wedding membership
     // For now, we'll need to fetch it from an API or include in session
     // Option 1: Add role to session user object
     // Option 2: Fetch from /api/weddings/current
     // Option 3: Store in a separate React context
   }
   ```

**Verification:**
- [ ] Permissions work with WeddingMember role
- [ ] UI correctly shows/hides elements based on role
- [ ] Navigation filters correctly for each role

---

### Phase 1 Gate Checklist

- [ ] Migration runs successfully with no data loss
- [ ] All API routes filter by weddingId
- [ ] requireRole returns wedding context
- [ ] WeddingConfig replaced by Wedding
- [ ] RLS policies active and tested
- [ ] Existing user can log in and see their data
- [ ] All existing features work for single wedding

---

## Phase 2 — Registration & Stripe Billing

**Duration:** 3–4 days
**Risk Level:** Medium — Stripe account setup required

### 2.1 Stripe Setup

**Tasks:**

1. Create Stripe account (if not exists)
2. Create Products and Prices:
   - Product: "Wedding Planner Standard"
   - Price: £12/month recurring
3. Configure webhook endpoint in Stripe dashboard:
   - URL: `https://app.yourdomain.com/api/webhooks/stripe`
   - Events: All subscription and invoice events
4. Note environment variables:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_ID_STANDARD`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Verification:**
- [ ] Stripe account active
- [ ] Products and prices created
- [ ] Webhook endpoint configured
- [ ] Test mode working

---

### 2.2 Create Register Page

**Tasks:**

1. Create `/app/(auth)/register/page.tsx`:
   ```tsx
   // Marketing copy + signup form
   // Email + Password + Couple Name fields
   // "Start 14-day free trial" button
   // No credit card required
   ```

2. Create `POST /api/register`:
   ```typescript
   export async function POST(req: NextRequest) {
     const { email, password, coupleName } = await req.json();

     // Check if user already exists
     const existingUser = await prisma.user.findUnique({ where: { email } });
     if (existingUser) {
       return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
     }

     // Create Stripe customer
     const customer = await stripe.customers.create({
       email,
       metadata: { coupleName }
     });

     // Create checkout session with trial
     const session = await stripe.checkout.sessions.create({
       customer: customer.id,
       mode: 'subscription',
       payment_method_types: ['card'],
       line_items: [{
         price: process.env.STRIPE_PRICE_ID_STANDARD!,
         quantity: 1,
       }],
       subscription_data: {
         trial_period_days: parseInt(process.env.TRIAL_DAYS || '14'),
       },
       success_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/wedding?session_id={CHECKOUT_SESSION_ID}`,
       cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/register?cancelled=true`,
     });

     return NextResponse.json({ checkoutUrl: session.url });
   }
   ```

**Verification:**
- [ ] Register page renders
- [ ] Form validation works
- [ ] Stripe checkout session created
- [ ] Redirect to Stripe checkout

---

### 2.3 Create Stripe Webhook Handler

**Tasks:**

1. Create `POST /api/webhooks/stripe`:
   ```typescript
   export async function POST(req: NextRequest) {
     const body = await req.text();
     const sig = req.headers.get('stripe-signature')!;

     let event: Stripe.Event;
     try {
       event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
     } catch (err) {
       return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
     }

     // Idempotency check
     const existing = await prisma.stripeEvent.findUnique({
       where: { eventId: event.id }
     });
     if (existing) {
       return NextResponse.json({ received: true, duplicate: true });
     }

     // Process event
     switch (event.type) {
       case 'checkout.session.completed':
         await handleCheckoutComplete(event.data.object);
         break;
       case 'invoice.payment_succeeded':
         await handlePaymentSucceeded(event.data.object);
         break;
       case 'invoice.payment_failed':
         await handlePaymentFailed(event.data.object);
         break;
       case 'customer.subscription.deleted':
         await handleSubscriptionDeleted(event.data.object);
         break;
       case 'customer.subscription.trial_will_end':
         await handleTrialEnding(event.data.object);
         break;
     }

     // Record event
     await prisma.stripeEvent.create({
       data: { eventId: event.id, eventType: event.type }
     });

     return NextResponse.json({ received: true });
   }
   ```

2. Implement each handler:
   ```typescript
   async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
     // Create User
     const user = await prisma.user.create({
       data: {
         email: session.customer_email!,
         name: session.metadata?.coupleName,
         accounts: {
           create: {
             providerId: 'credential',
             accountId: session.customer_email!,
             password: await hash(session.metadata?.tempPassword, 10),
           }
         }
       }
     });

     // Create Wedding
     const wedding = await prisma.wedding.create({
       data: {
         slug: generateSlug(session.metadata?.coupleName),
         coupleName: session.metadata?.coupleName || 'Our Wedding',
         stripeCustomerId: session.customer as string,
         stripeSubscriptionId: session.subscription as string,
         subscriptionStatus: 'TRIALING',
         trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
       }
     });

     // Create WeddingMember
     await prisma.weddingMember.create({
       data: {
         userId: user.id,
         weddingId: wedding.id,
         role: 'ADMIN',
       }
     });

     // Trigger welcome email
     await inngest.send({ name: 'wedding/created', data: { weddingId: wedding.id } });
   }
   ```

**Verification:**
- [ ] Webhook validates Stripe signature
- [ ] Idempotency prevents duplicate processing
- [ ] checkout.session.completed creates User + Wedding + WeddingMember
- [ ] invoice.payment_succeeded updates subscription status
- [ ] invoice.payment_failed sets grace period

---

### 2.4 Create Billing Pages

**Tasks:**

1. Create `/app/(dashboard)/billing/page.tsx`:
   - Display subscription status
   - Display current period end
   - Button to manage subscription (Stripe Portal)
   - Warning banner if in grace period

2. Create `/api/billing/portal`:
   ```typescript
   export async function POST(req: NextRequest) {
     const auth = await requireRole(['ADMIN'], req);
     if (!auth.authorized) return auth.response;

     const wedding = await prisma.wedding.findUnique({
       where: { id: auth.weddingId }
     });

     if (!wedding?.stripeCustomerId) {
       return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 });
     }

     const session = await stripe.billingPortal.sessions.create({
       customer: wedding.stripeCustomerId,
       return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
     });

     return NextResponse.json({ url: session.url });
   }
   ```

3. Create `/app/(dashboard)/billing/suspended/page.tsx`:
   - "Your subscription has ended" message
   - "Reactivate subscription" button
   - Data export link

**Verification:**
- [ ] Billing page shows subscription status
- [ ] Stripe Portal opens correctly
- [ ] Suspended page renders

---

### 2.5 Onboarding Wizard

**Tasks:**

1. Create `/app/(dashboard)/onboarding/wedding/page.tsx`:
   - Couple name input
   - Wedding date picker
   - Venue name and address inputs
   - "Save and continue" button

2. Create `/app/(dashboard)/onboarding/invite/page.tsx`:
   - "Invite your partner or planner" section
   - Email input + role dropdown
   - "Send invitation" button
   - "Skip for now" link

3. Create `/app/(dashboard)/onboarding/done/page.tsx`:
   - "You're all set!" message
   - Quick start guide
   - "Go to dashboard" button

4. Add onboarding state to wedding:
   ```prisma
   model Wedding {
     // ... existing fields
     onboardingCompleted Boolean @default(false)
   }
   ```

5. Middleware redirect for incomplete onboarding

**Verification:**
- [ ] Onboarding wizard renders after signup
- [ ] Wedding details save correctly
- [ ] Invitations can be sent
- [ ] Onboarding completion redirects to dashboard

---

### 2.6 Grace Period Logic

**Tasks:**

1. Create Inngest function for grace period expiry:
   ```typescript
   export const gracePeriodExpiry = inngest.createFunction(
     { id: 'grace-period-expiry' },
     { cron: '0 5 * * *' }, // Daily at 5am
     async ({ step }) => {
       const expired = await step.run('find-expired', async () => {
         return prisma.wedding.findMany({
           where: {
             subscriptionStatus: 'PAST_DUE',
             gracePeriodEndsAt: { lt: new Date() }
           }
         });
       });

       for (const wedding of expired) {
         await step.run(`expire-${wedding.id}`, async () => {
           await prisma.wedding.update({
             where: { id: wedding.id },
             data: {
               subscriptionStatus: 'CANCELLED',
               cancelledAt: new Date(),
               deleteScheduledAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
             }
           });
           await inngest.send({ name: 'wedding/cancelled', data: { weddingId: wedding.id } });
         });
       }
     }
   );
   ```

2. Add grace period warning banner to layout

**Verification:**
- [ ] Grace period expiry function runs daily
- [ ] Weddings move to CANCELLED after grace period
- [ ] Warning banner shows during grace period

---

### Phase 2 Gate Checklist

- [ ] User can register with email/password
- [ ] Stripe checkout session created
- [ ] Stripe webhook creates User + Wedding
- [ ] Billing page shows subscription status
- [ ] Stripe Customer Portal works
- [ ] Onboarding wizard completes
- [ ] Grace period logic works

---

## Phase 3 — Invitation System

**Duration:** 2–3 days
**Risk Level:** Low

### 3.1 Create Invitation API

**Tasks:**

1. Create `POST /api/invites`:
   ```typescript
   export async function POST(req: NextRequest) {
     const auth = await requireRole(['ADMIN'], req);
     if (!auth.authorized) return auth.response;

     const { email, role } = await req.json();

     const invite = await prisma.weddingInvite.create({
       data: {
         weddingId: auth.weddingId,
         role: role || 'RSVP_MANAGER',
         email,
         expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
       }
     });

     // Send invitation email
     const wedding = await prisma.wedding.findUnique({
       where: { id: auth.weddingId }
     });

     await sendEmail({
       to: email,
       subject: `You're invited to join ${wedding?.coupleName}'s wedding`,
       html: invitationEmailTemplate(wedding, invite)
     });

     return NextResponse.json(invite);
   }
   ```

2. Create `GET /api/invites`:
   - List active invites for current wedding
   - Include expiresAt, email, role, usedAt

3. Create `DELETE /api/invites/[id]`:
   - Revoke unused invite
   - Only ADMIN can revoke

**Verification:**
- [ ] Create invite returns invite record
- [ ] Invite email sent
- [ ] List invites shows active invites
- [ ] Revoke invite removes it

---

### 3.2 Create Invitation Acceptance Flow

**Tasks:**

1. Create `/app/(auth)/invite/[token]/page.tsx`:
   ```tsx
   // Fetch invite by token
   // If invite expired: show "Invitation expired" message
   // If invite used: show "Invitation already used" message
   // If valid:
   //   - If user logged in: show "Join [Couple]'s wedding" button
   //   - If not logged in:
   //     - If email matches existing user: redirect to login
   //     - If new user: show registration form (no Stripe)
   ```

2. Create `POST /api/invites/[token]/accept`:
   ```typescript
   export async function POST(
     req: NextRequest,
     { params }: { params: { token: string } }
   ) {
     const invite = await prisma.weddingInvite.findUnique({
       where: { token: params.token },
       include: { wedding: true }
     });

     if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
       return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
     }

     // Get or create user
     let user = await prisma.user.findUnique({
       where: { email: invite.email || req.body.email }
     });

     if (!user) {
       const { name, password } = await req.json();
       user = await prisma.user.create({
         data: {
           email: invite.email || req.body.email,
           name,
           accounts: {
             create: {
               providerId: 'credential',
               accountId: invite.email || req.body.email,
               password: await hash(password, 10),
             }
           }
         }
       });
     }

     // Create membership
     await prisma.weddingMember.create({
       data: {
         userId: user.id,
         weddingId: invite.weddingId,
         role: invite.role,
       }
     });

     // Mark invite as used
     await prisma.weddingInvite.update({
       where: { id: invite.id },
       data: { usedAt: new Date(), usedBy: user.id }
     });

     // Log user in (Better Auth)
     // Set weddingId cookie
     // Redirect to dashboard

     return NextResponse.json({ success: true });
   }
   ```

**Verification:**
- [ ] Valid invite shows accept page
- [ ] Expired invite shows error
- [ ] Existing user can accept and join
- [ ] New user can register and join
- [ ] Invite marked as used after acceptance

---

### 3.3 Wedding Picker for Multi-Wedding Users

**Tasks:**

1. Create `/app/(dashboard)/select-wedding/page.tsx`:
   ```tsx
   // Fetch user's WeddingMemberships
   // Show list of weddings with coupleName and role
   // Click to select → set weddingId cookie → redirect to dashboard
   // "Create new wedding" button for planners
   ```

2. Update login flow:
   - After successful login, check WeddingMember count
   - If 0: redirect to /register
   - If 1: auto-select, set cookie, redirect to dashboard
   - If >1: redirect to /select-wedding

**Verification:**
- [ ] Wedding picker shows all memberships
- [ ] Selecting wedding sets cookie and redirects
- [ ] Login auto-selects when single membership

---

### 3.4 Update Settings UI

**Tasks:**

1. Replace `/settings/users` with invite management:
   - Show current WeddingMembers (name, email, role)
   - Show pending invites (email, role, expiresAt)
   - "Invite new member" button
   - Revoke invite button
   - Remove member button (ADMIN only)

2. Update member removal logic:
   - Cannot remove yourself
   - Cannot remove last ADMIN
   - Optional: transfer ownership first

**Verification:**
- [ ] Settings shows members and invites
- [ ] Can invite new members
- [ ] Can revoke pending invites
- [ ] Can remove members (with checks)

---

### Phase 3 Gate Checklist

- [ ] Admin can create invitations
- [ ] Invitation emails sent
- [ ] New users can accept and register
- [ ] Existing users can accept and join
- [ ] Wedding picker works for multi-wedding users
- [ ] Settings shows team management

---

## Phase 4 — Infrastructure Migration

**Duration:** 3–4 days
**Risk Level:** High — Inngest setup, file migration, connection pooling

### 4.1 Add PgBouncer Service

**Tasks:**

1. Add PgBouncer to Railway project:
   - Deploy `edoburu/pgbouncer` image
   - Configure environment:
     ```
     DATABASE_URL: ${{Postgres.DATABASE_URL}}
     POOL_MODE: transaction
     MAX_CLIENT_CONN: 100
     DEFAULT_POOL_SIZE: 25
     RESERVE_POOL_SIZE: 5
     ADMIN_USERS: wedding
     AUTH_TYPE: md5
     ```

2. Update Prisma schema:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_DATABASE_URL")
   }
   ```

3. Update Railway environment:
   ```
   DATABASE_URL=postgresql://...@pgbouncer:5432/...
   DIRECT_DATABASE_URL=postgresql://...@postgres:5432/...
   ```

4. Test connection pooling locally with docker-compose

**Verification:**
- [ ] PgBouncer connects to PostgreSQL
- [ ] App connects through PgBouncer
- [ ] Migrations work with directUrl
- [ ] RLS session variables work in transaction mode

---

### 4.2 Replace Local Cache with Redis

**Tasks:**

1. Update `src/lib/cache.ts`:
   ```typescript
   import Redis from 'ioredis';

   const redis = new Redis(process.env.REDIS_URL!);

   export async function getCached<T>(
     key: string,
     ttlMs: number,
     fetcher: () => Promise<T>
   ): Promise<T> {
     const cached = await redis.get(key);
     if (cached !== null) {
       return JSON.parse(cached);
     }

     const data = await fetcher();
     await redis.set(key, JSON.stringify(data), 'EX', Math.floor(ttlMs / 1000));
     return data;
   }

   export async function invalidateCache(key: string): Promise<void> {
     await redis.del(key);
   }
   ```

2. Update all cache calls to use weddingId-prefixed keys:
   ```typescript
   // Before:
   await getCached('meal-options', 300000, fetcher);

   // After:
   await getCached(`${weddingId}:meal-options`, 300000, fetcher);
   ```

3. Update all invalidation calls:
   ```typescript
   // Before:
   invalidateCache('task-categories');

   // After:
   invalidateCache(`${weddingId}:task-categories`);
   ```

**Verification:**
- [ ] Redis connection works
- [ ] Cache keys are weddingId-scoped
- [ ] Invalidation works
- [ ] Cross-tenant cache isolation verified

---

### 4.3 Replace File Storage with Railway Buckets

**Tasks:**

1. Create `src/lib/s3.ts`:
   ```typescript
   import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
   import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

   export const s3 = new S3Client({
     region: 'auto',
     endpoint: process.env.RAILWAY_BUCKET_ENDPOINT,
     credentials: {
       accessKeyId: process.env.RAILWAY_BUCKET_ACCESS_KEY_ID!,
       secretAccessKey: process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY!,
     },
   });

   export async function uploadFile(
     weddingId: string,
     path: string,
     filename: string,
     buffer: Buffer,
     contentType: string
   ): Promise<string> {
     const key = `${weddingId}/${path}/${filename}`;
     await s3.send(new PutObjectCommand({
       Bucket: process.env.RAILWAY_BUCKET_NAME,
       Key: key,
       Body: buffer,
       ContentType: contentType,
     }));
     return key;
   }

   export async function getPresignedUrl(key: string): Promise<string> {
     return getSignedUrl(s3, new GetObjectCommand({
       Bucket: process.env.RAILWAY_BUCKET_NAME,
       Key: key,
     }), { expiresIn: 3600 });
   }
   ```

2. Update `POST /api/suppliers/[id]/attachments`:
   ```typescript
   // Before:
   fs.writeFileSync(`./data/uploads/${supplierId}/${storedAs}`, buffer);

   // After:
   const key = await uploadFile(weddingId, `suppliers/${supplierId}`, storedAs, buffer, file.type);
   await prisma.attachment.create({
     data: {
       supplierId,
       paymentId,
       filename: file.name,
       storedAs: key,
       mimeType: file.type,
       sizeBytes: buffer.length,
     }
   });
   ```

3. Update `GET /api/uploads/[supplierId]/[filename]`:
   ```typescript
   // Before:
   const file = fs.readFileSync(path);
   return new Response(file);

   // After:
   const url = await getPresignedUrl(attachment.storedAs);
   return NextResponse.redirect(url);
   ```

4. Migrate existing files:
   ```typescript
   // One-time migration script
   async function migrateFilesToS3() {
     const attachments = await prisma.attachment.findMany();
     for (const att of attachments) {
       const localPath = `./data/uploads/${att.supplierId}/${att.storedAs}`;
       if (fs.existsSync(localPath)) {
         const buffer = fs.readFileSync(localPath);
         const weddingId = await getWeddingIdForSupplier(att.supplierId);
         const key = await uploadFile(weddingId, `suppliers/${att.supplierId}`, att.storedAs, buffer, att.mimeType);
         await prisma.attachment.update({
           where: { id: att.id },
           data: { storedAs: key }
         });
       }
     }
   }
   ```

**Verification:**
- [ ] S3 client connects to Railway Buckets
- [ ] Uploads work with weddingId-prefixed keys
- [ ] Downloads return presigned URLs
- [ ] Existing files migrated

---

### 4.4 Replace Reminder Daemon with Inngest

**Tasks:**

1. Create Inngest client and functions:
   ```typescript
   // src/lib/inngest/client.ts
   import { Inngest } from 'inngest';
   export const inngest = new Inngest({
     id: 'wedding-planner',
     eventKey: process.env.INNGEST_EVENT_KEY!,
   });
   ```

2. Create appointment reminders function:
   ```typescript
   // src/lib/inngest/functions/appointment-reminders.ts
   export const appointmentReminders = inngest.createFunction(
     { id: 'appointment-reminders' },
     { cron: '0 * * * *' },
     async ({ step }) => {
       // Same logic as reminder-daemon.ts
       // But iterate all active weddings
     }
   );
   ```

3. Create all other functions from section 9.1

4. Create `POST /api/inngest`:
   ```typescript
   import { serve } from 'inngest/next';
   import { inngest } from '@/lib/inngest/client';
   import * as functions from '@/lib/inngest/functions';

   export const { GET, POST, PUT } = serve({
     client: inngest,
     functions: Object.values(functions),
   });
   ```

5. Remove reminder daemon from `entrypoint.sh`

6. Remove dashboard-load overdue marking

**Verification:**
- [ ] Inngest client connects
- [ ] Cron functions run on schedule
- [ ] Appointment reminders sent
- [ ] Overdue payments marked daily
- [ ] Reminder daemon removed from entrypoint

---

### 4.5 Deploy to Railway

**Tasks:**

1. Create Railway project:
   - Provision PostgreSQL 16
   - Provision Redis 7
   - Provision Bucket (S3)
   - Provision PgBouncer (from template)

2. Configure services:
   - Set all environment variables
   - Configure auto-scaling (min 2, max 3)
   - Enable health checks on `/api/health`

3. Deploy app:
   ```bash
   railway login
   railway link
   railway up
   ```

4. Configure Inngest:
   - Add Railway app URL to Inngest dashboard
   - Verify webhook endpoint works

5. Configure Cloudflare Tunnel:
   - Create tunnel to Railway app URL
   - Configure DNS: `app.yourdomain.com` → tunnel

**Verification:**
- [ ] All services provisioned
- [ ] App deploys successfully
- [ ] Health check passes
- [ ] Inngest receives events
- [ ] Cloudflare tunnel routes traffic

---

### Phase 4 Gate Checklist

- [ ] PgBouncer running in transaction mode
- [ ] Redis cache works with weddingId prefix
- [ ] Files stored in Railway Buckets
- [ ] Existing files migrated
- [ ] Inngest functions run on schedule
- [ ] App deployed to Railway with 2 replicas
- [ ] Health check endpoint working
- [ ] Cloudflare tunnel configured

---

## Phase 5 — Admin Console

**Duration:** 2–3 days
**Risk Level:** Low — separate app, doesn't affect main application

### 5.1 Create Admin App Structure

**Tasks:**

1. Create new Next.js app in `admin-app/` directory:
   ```bash
   npx create-next-app@latest admin-app
   ```

2. Set up Prisma with symlinked schema:
   ```bash
   cd admin-app
   mkdir prisma
   ln -s ../../wedding-planner/prisma/schema.prisma prisma/schema.prisma
   ```

3. Configure environment:
   ```bash
   DATABASE_URL=postgresql://...@pgbouncer:5432/wedding_planner
   DIRECT_DATABASE_URL=postgresql://...@postgres:5432/wedding_planner
   ADMIN_PASSWORD_HASH=...  # bcrypt hash
   ```

4. Create base layout with admin styling:
   ```typescript
   // admin-app/src/app/layout.tsx
   export default function AdminLayout({ children }) {
     return (
       <html>
         <body className="bg-gray-100">
           <AdminNav />
           {children}
         </body>
       </html>
     );
   }
   ```

**Verification:**
- [ ] Admin app runs locally
- [ ] Prisma connects to same database
- [ ] Basic layout renders

---

### 5.2 Admin Authentication

**Tasks:**

1. Create simple admin auth:
   ```typescript
   // admin-app/src/lib/auth.ts
   import { compare } from 'bcryptjs';
   import { cookies } from 'next/headers';

   const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH!;

   export async function verifyAdmin(password: string): Promise<boolean> {
     return compare(password, ADMIN_PASSWORD_HASH);
   }

   export async function getAdminSession() {
     const cookieStore = await cookies();
     const token = cookieStore.get('admin_token')?.value;
     if (!token) return null;
     // Verify token (JWT or database lookup)
     return { isAdmin: true };
   }
   ```

2. Create login page:
   ```typescript
   // admin-app/src/app/login/page.tsx
   // Simple password form (or Google OAuth for single email)
   ```

3. Create auth middleware:
   ```typescript
   // admin-app/src/middleware.ts
   export function middleware(req: NextRequest) {
     const { pathname } = req.nextUrl;
     if (pathname === '/login' || pathname.startsWith('/api/login')) {
       return NextResponse.next();
     }
     // Check admin session
     // Redirect to /login if not authenticated
   }
   ```

**Verification:**
- [ ] Login page renders
- [ ] Password authentication works
- [ ] Middleware protects all routes
- [ ] Session persists across requests

---

### 5.3 Dashboard Page

**Tasks:**

1. Create aggregate metrics API:
   ```typescript
   // admin-app/src/app/api/admin/stats/route.ts
   export async function GET() {
     const [
       totalWeddings,
       activeSubscriptions,
       trialing,
       pastDue,
       cancelled,
       mrr,
       newThisMonth,
       churnedThisMonth,
     ] = await Promise.all([
       prisma.wedding.count(),
       prisma.wedding.count({ where: { subscriptionStatus: 'ACTIVE' } }),
       prisma.wedding.count({ where: { subscriptionStatus: 'TRIALING' } }),
       prisma.wedding.count({ where: { subscriptionStatus: 'PAST_DUE' } }),
       prisma.wedding.count({ where: { subscriptionStatus: 'CANCELLED' } }),
       calculateMRR(),
       prisma.wedding.count({
         where: { createdAt: { gte: startOfMonth() } }
       }),
       prisma.wedding.count({
         where: { subscriptionStatus: 'CANCELLED', cancelledAt: { gte: startOfMonth() } }
       }),
     ]);

     return NextResponse.json({
       totalWeddings,
       activeSubscriptions,
       trialing,
       pastDue,
       cancelled,
       mrr,
       newThisMonth,
       churnedThisMonth,
       conversionRate: (activeSubscriptions / totalWeddings * 100).toFixed(1),
       churnRate: (churnedThisMonth / totalWeddings * 100).toFixed(1),
     });
   }
   ```

2. Create dashboard UI:
   ```typescript
   // admin-app/src/app/page.tsx
   // Grid of metric cards
   // Charts for MRR over time, conversion funnel
   // Recent signups table
   ```

**Verification:**
- [ ] Dashboard shows all metrics
- [ ] MRR calculation correct
- [ ] Charts render properly

---

### 5.4 Weddings List

**Tasks:**

1. Create weddings API:
   ```typescript
   // admin-app/src/app/api/admin/weddings/route.ts
   export async function GET(req: NextRequest) {
     const { searchParams } = new URL(req.url);
     const page = parseInt(searchParams.get('page') || '1');
     const limit = parseInt(searchParams.get('limit') || '50');
     const status = searchParams.get('status');
     const search = searchParams.get('search');

     const where = {
       ...(status && { subscriptionStatus: status }),
       ...(search && {
         OR: [
           { coupleName: { contains: search, mode: 'insensitive' } },
           { members: { some: { user: { email: { contains: search, mode: 'insensitive' } } } } },
         ]
       }),
     };

     const [weddings, total] = await Promise.all([
       prisma.wedding.findMany({
         where,
         include: {
           members: { include: { user: { select: { email: true } } } },
           _count: { select: { guests: true } },
         },
         orderBy: { createdAt: 'desc' },
         skip: (page - 1) * limit,
         take: limit,
       }),
       prisma.wedding.count({ where }),
     ]);

     return NextResponse.json({ weddings, total, page, totalPages: Math.ceil(total / limit) });
   }
   ```

2. Create weddings table UI:
   ```typescript
   // admin-app/src/app/weddings/page.tsx
   // Filterable, sortable table
   // Columns: couple name, status, created, guests, member count, actions
   // Click row → go to detail page
   ```

**Verification:**
- [ ] Weddings list renders
- [ ] Pagination works
- [ ] Status filter works
- [ ] Search works

---

### 5.5 Wedding Detail

**Tasks:**

1. Create wedding detail API:
   ```typescript
   // admin-app/src/app/api/admin/weddings/[id]/route.ts
   export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
     const wedding = await prisma.wedding.findUnique({
       where: { id: params.id },
       include: {
         members: { include: { user: { select: { id: true, name: true, email: true, createdAt: true } } } },
         guests: { select: { id: true } },
         suppliers: { select: { id: true } },
         tasks: { select: { id: true, isCompleted: true } },
         attachments: { select: { id: true, sizeBytes: true } },
         invites: { select: { id: true, email: true, role: true, expiresAt: true, usedAt: true } },
       },
     });

     if (!wedding) {
       return NextResponse.json({ error: 'Not found' }, { status: 404 });
     }

     // Get Stripe subscription details
     let stripeData = null;
     if (wedding.stripeCustomerId) {
       try {
         const [customer, subscription] = await Promise.all([
           stripe.customers.retrieve(wedding.stripeCustomerId),
           wedding.stripeSubscriptionId
             ? stripe.subscriptions.retrieve(wedding.stripeSubscriptionId)
             : null,
         ]);
         stripeData = { customer, subscription };
       } catch (e) {
         stripeData = { error: 'Failed to fetch Stripe data' };
       }
     }

     return NextResponse.json({
       ...wedding,
       stats: {
         guestCount: wedding.guests.length,
         supplierCount: wedding.suppliers.length,
         taskCount: wedding.tasks.length,
         completedTasks: wedding.tasks.filter(t => t.isCompleted).length,
         storageBytes: wedding.attachments.reduce((sum, a) => sum + a.sizeBytes, 0),
       },
       stripe: stripeData,
     });
   }
   ```

2. Create wedding detail UI:
   ```typescript
   // admin-app/src/app/weddings/[id]/page.tsx
   // Sections: wedding info, subscription status, members, pending invites, stats
   // Actions: extend trial, apply discount, cancel subscription, impersonate user
   ```

**Verification:**
- [ ] Wedding detail renders all data
- [ ] Stripe data displays correctly
- [ ] Stats calculate correctly

---

### 5.6 Admin Actions

**Tasks:**

1. Extend trial:
   ```typescript
   // admin-app/src/app/api/admin/weddings/[id]/extend-trial/route.ts
   export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
     const { days } = await req.json();

     const wedding = await prisma.wedding.findUnique({
       where: { id: params.id },
     });

     if (!wedding?.stripeSubscriptionId) {
       return NextResponse.json({ error: 'No subscription' }, { status: 400 });
     }

     // Update Stripe subscription
     await stripe.subscriptions.update(wedding.stripeSubscriptionId, {
       trial_end: Math.floor((wedding.trialEndsAt?.getTime() || Date.now()) + days * 24 * 60 * 60 * 1000),
     });

     // Update database
     await prisma.wedding.update({
       where: { id: params.id },
       data: {
         trialEndsAt: new Date((wedding.trialEndsAt?.getTime() || Date.now()) + days * 24 * 60 * 60 * 1000),
       },
     });

     return NextResponse.json({ success: true });
   }
   ```

2. Apply discount:
   ```typescript
   // admin-app/src/app/api/admin/weddings/[id]/apply-discount/route.ts
   // Create Stripe coupon and apply to subscription
   ```

3. Cancel subscription:
   ```typescript
   // admin-app/src/app/api/admin/weddings/[id]/cancel/route.ts
   // Cancel immediately or at period end
   ```

4. Generate magic link:
   ```typescript
   // admin-app/src/app/api/admin/support/magic-link/route.ts
   // Create support token for impersonation
   ```

**Verification:**
- [ ] Extend trial updates Stripe and database
- [ ] Discount applies correctly
- [ ] Cancel works gracefully
- [ ] Magic link authenticates into main app

---

### 5.7 Deploy Admin Console

**Tasks:**

1. Create Railway service for admin app:
   ```bash
   railway new --name wedding-planner-admin
   ```

2. Configure environment variables

3. Deploy:
   ```bash
   railway up
   ```

4. Configure Cloudflare tunnel for `admin.yourdomain.com`

5. Test all admin flows

**Verification:**
- [ ] Admin console deployed
- [ ] DNS configured
- [ ] All admin pages work
- [ ] Can manage subscriptions
- [ ] Can generate magic links

---

### Phase 5 Gate Checklist

- [ ] Admin app runs and connects to database
- [ ] Admin authentication works
- [ ] Dashboard shows correct metrics
- [ ] Weddings list paginates and filters
- [ ] Wedding detail shows all data
- [ ] Can extend trials
- [ ] Can apply discounts
- [ ] Can cancel subscriptions
- [ ] Magic links work for user impersonation
- [ ] Admin console deployed to Railway

---

## Phase 6 — Polish & Launch

**Duration:** 2–3 days
**Risk Level:** Medium

### 6.1 Data Export Endpoint

**Tasks:**

1. Create `GET /api/export`:
   ```typescript
   export async function GET(req: NextRequest) {
     const auth = await requireRole(['ADMIN'], req);
     if (!auth.authorized) return auth.response;

     const wedding = await prisma.wedding.findUnique({
       where: { id: auth.weddingId },
       include: {
         guests: { include: { table: true } },
         tables: true,
         rooms: { include: { tables: true, elements: true } },
         suppliers: { include: { payments: true, attachments: true } },
         appointments: true,
         tasks: true,
         mealOptions: true,
         supplierCategories: true,
         appointmentCategories: true,
         taskCategories: true,
         attachments: true,
         members: { include: { user: { select: { name: true, email: true } } } },
       }
     });

     // Generate JSON export
     const json = JSON.stringify(wedding, null, 2);

     // Generate CSVs for key tables
     const guestsCsv = generateGuestsCsv(wedding.guests);
     const suppliersCsv = generateSuppliersCsv(wedding.suppliers);

     // Create zip
     const zip = await createZip({
       'wedding.json': json,
       'guests.csv': guestsCsv,
       'suppliers.csv': suppliersCsv,
     });

     return new Response(zip, {
       headers: {
         'Content-Type': 'application/zip',
         'Content-Disposition': `attachment; filename="wedding-${auth.weddingId}-${Date.now()}.zip"`
       }
     });
   }
   ```

**Verification:**
- [ ] Export generates valid JSON
- [ ] Export includes all tenant data
- [ ] Export downloads as zip

---

### 6.2 Scheduled Deletion Job

**Tasks:**

1. Create Inngest function:
   ```typescript
   export const purgeExpiredWeddings = inngest.createFunction(
     { id: 'purge-expired-weddings' },
     { cron: '0 3 * * *' }, // Daily at 3am
     async ({ step }) => {
       const expired = await step.run('find-expired', async () => {
         return prisma.wedding.findMany({
           where: {
             deleteScheduledAt: { lt: new Date() }
           }
         });
       });

       for (const wedding of expired) {
         await step.run(`purge-${wedding.id}`, async () => {
           // Delete all files in S3
           await deleteAllFiles(wedding.id);

           // Delete wedding (cascades to all relations)
           await prisma.wedding.delete({
             where: { id: wedding.id }
           });
         });
       }
     }
   );
   ```

2. Add deletion notification emails:
   - On cancellation: "Your data will be deleted in 90 days"
   - 7 days before: "Your data will be deleted in 7 days"
   - After deletion: Confirmation (if possible)

**Verification:**
- [ ] Daily job finds expired weddings
- [ ] All S3 files deleted
- [ ] Wedding record deleted
- [ ] Notification emails sent

---

### 6.3 Account Deletion Flow

**Tasks:**

1. Create `DELETE /api/account`:
   - User-initiated account deletion
   - Require password confirmation
   - Delete all WeddingMemberships where user is sole ADMIN (cascade delete wedding)
   - Or just remove membership if other ADMINs exist

2. Add "Delete account" to Settings

**Verification:**
- [ ] User can delete their account
- [ ] Password confirmation required
- [ ] Weddings with no other admins are deleted
- [ ] Memberships are removed

---

### 6.4 Trial Ending Emails

**Tasks:**

1. Create Inngest function triggered by Stripe event:
   ```typescript
   export const trialEndingReminder = inngest.createFunction(
     { id: 'trial-ending-reminder' },
     { event: 'stripe/trial.will_end' },
     async ({ event, step }) => {
       const { customerId } = event.data;

       const wedding = await step.run('find-wedding', async () => {
         return prisma.wedding.findUnique({
           where: { stripeCustomerId: customerId }
         });
       });

       if (!wedding) return;

       await step.run('send-email', async () => {
         await sendEmail({
           to: wedding.reminderEmail || /* get from user */,
           subject: 'Your trial ends in 3 days',
           html: trialEndingEmailTemplate(wedding)
         });
       });
     }
   );
   ```

**Verification:**
- [ ] Trial ending event triggers email
- [ ] Email sent 3 days before trial ends

---

### 6.5 Payment Failure Warning

**Tasks:**

1. Add grace period banner to layout:
   ```tsx
   // In LayoutShell or dashboard layout
   {wedding.gracePeriodEndsAt && wedding.gracePeriodEndsAt > new Date() && (
     <div className="bg-amber-100 border-l-4 border-amber-500 p-4">
       <p className="font-medium">Payment Issue</p>
       <p>Your subscription payment failed. You have {daysRemaining} days to update your payment method before access is restricted.</p>
       <Link href="/billing" className="text-amber-700 underline">
         Update payment method →
       </Link>
     </div>
   )}
   ```

2. Send email on payment failure:
   ```typescript
   export const paymentFailedEmail = inngest.createFunction(
     { id: 'payment-failed-email' },
     { event: 'stripe/payment.failed' },
     async ({ event, step }) => {
       // Send grace period warning email
     }
   );
   ```

**Verification:**
- [ ] Banner shows during grace period
- [ ] Email sent on payment failure
- [ ] Banner links to billing page

---

### 6.6 Trial Abuse Prevention

**Tasks:**

1. Add email verification before trial:
   - On registration, create unverified user
   - Send verification email
   - Only create Stripe checkout after verification

2. Add unique constraint on email + tracking:
   - Track trial usage per email
   - Block repeat trials on same email

3. Optional: Stripe fraud detection:
   - Enable Radar
   - Set rules for multiple trials

**Verification:**
- [ ] Email verification required before trial
- [ ] Repeat trials blocked on same email
- [ ] Stripe fraud tools enabled

---

### 6.7 Rate Limiting Tuning

**Tasks:**

1. Review rate limits for multi-tenant load:
   - RSVP endpoints: per-IP 20/min, per-token 10/min
   - API endpoints: per-user 100/min
   - Email endpoints: per-user 50/hour

2. Test with load simulation

3. Add rate limit monitoring/alerting

**Verification:**
- [ ] Rate limits tested under load
- [ ] No legitimate users blocked
- [ ] Attack patterns blocked

---

### 6.8 DNS Cutover

**Tasks:**

1. Schedule maintenance window

2. Final data sync from Mac mini to Railway:
   - Export PostgreSQL from Mac mini
   - Import to Railway PostgreSQL
   - Migrate files to Railway Buckets

3. Update DNS:
   - Point `app.yourdomain.com` to Cloudflare tunnel
   - Tunnel routes to Railway

4. Monitor:
   - Check error rates
   - Check response times
   - Verify all features work

5. Keep Mac mini running for 48 hours as fallback

**Verification:**
- [ ] DNS points to Railway
- [ ] All users can access
- [ ] All features work
- [ ] No significant errors
- [ ] Response times acceptable

---

### 6.9 Smoke Tests

**Tasks:**

Test all critical flows end-to-end:

1. **Registration flow:**
   - [ ] Register with email
   - [ ] Verify email
   - [ ] Complete Stripe checkout
   - [ ] Webhook creates User + Wedding
   - [ ] Onboarding wizard works
   - [ ] Dashboard accessible

2. **Invitation flow:**
   - [ ] Admin creates invite
   - [ ] Invite email sent
   - [ ] New user accepts
   - [ ] New user joins wedding
   - [ ] Existing user accepts
   - [ ] Existing user joins wedding

3. **Guest management:**
   - [ ] Add guest
   - [ ] Edit guest
   - [ ] Delete guest
   - [ ] CSV import
   - [ ] CSV export
   - [ ] Send RSVP email

4. **RSVP flow:**
   - [ ] Guest opens RSVP link
   - [ ] Guest submits response
   - [ ] Confirmation shows
   - [ ] Admin sees response

5. **Seating planner:**
   - [ ] Create table
   - [ ] Assign guest to table
   - [ ] Visual view renders
   - [ ] Save seating plan

6. **Supplier management:**
   - [ ] Add supplier
   - [ ] Add payment
   - [ ] Upload attachment
   - [ ] Download attachment

7. **Billing:**
   - [ ] View subscription status
   - [ ] Open Stripe portal
   - [ ] Cancel subscription
   - [ ] Grace period warning
   - [ ] Reactivate subscription

8. **Data export:**
   - [ ] Export all data
   - [ ] Download zip
   - [ ] Verify contents

---

### Phase 6 Gate Checklist

- [ ] Data export endpoint working
- [ ] Scheduled deletion job running
- [ ] Account deletion flow working
- [ ] Trial ending emails sent
- [ ] Payment failure warnings show
- [ ] Trial abuse prevention active
- [ ] Rate limits tuned
- [ ] DNS cutover complete
- [ ] All smoke tests pass

---

## 18. Cost Estimate

| Service | At launch (0–50 weddings) | At scale (500 weddings) |
|---|---|---|
| Cloudflare | Free | Free (or ~£20/mo Pro) |
| Railway (app + DB + Redis + PgBouncer) | ~£25/mo | ~£80–120/mo |
| Railway (admin console) | ~£5/mo | ~£10/mo |
| Railway Buckets | $0.015/GB stored, zero egress | $0.015/GB |
| Stripe | 1.5% + 20p per transaction | ~£0.38/customer/mo |
| Inngest | Free (up to 50k runs/mo) | ~£15/mo |
| Email | Free up to 3k/mo | ~£15/mo |
| **Total (excl. Stripe %)** | **~£45–55/month** | **~£130–170/month** |

---

## 19. Key Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing `weddingId` filter leaks tenant data | Medium | PostgreSQL RLS as DB-level safety net; code review convention |
| Stripe webhook replay / duplicate processing | Low | Idempotency keys on all webhook handlers |
| Trial abuse — repeat sign-ups | Medium | Email verification before trial; Stripe fraud tooling |
| Inngest job processes stale data after cancellation | Low | Check `subscriptionStatus` at start of every Inngest function |
| RLS session variable not set correctly | Medium | Comprehensive testing; Prisma extension with context |
| PgBouncer transaction mode incompatible with Prisma | Low | Test locally before production |
| Redis cache cross-tenant pollution | Low | All keys prefixed `{weddingId}:` |
| Data not deleted on schedule (GDPR breach) | Low | `deleteScheduledAt` queryable; daily Inngest job with alerting |
| Connection pool exhaustion | Low | PgBouncer with appropriate pool sizing |
| Admin console credential exposure | Low | Separate auth; environment variable secrets; IP restriction optional |

---

## 20. Post-Launch Monitoring

### 20.1 Metrics to Track

- **Authentication:** Login success rate, session duration
- **Billing:** Conversion rate (trial → paid), churn rate, MRR
- **Performance:** Response time (p50, p95, p99), error rate
- **Database:** Connection pool utilization, query latency
- **Jobs:** Inngest function success rate, execution time

### 20.2 Alerting Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error rate | > 1% | Alert + investigate |
| Response time p95 | > 2s | Alert + investigate |
| Database connections | > 80% utilized | Scale PgBouncer pool |
| Inngest failures | > 5 in 1 hour | Alert + investigate |
| Stripe webhook failures | Any | Alert immediately |

### 19.3 Health Checks

- `/api/health` — Database + Redis connectivity
- Stripe webhook endpoint — Periodic test event
- Inngest — Scheduled "ping" function

---

## 21. Rollback Plan

If critical issues are discovered post-launch:

### 21.1 Quick Rollback (DNS)

1. Point DNS back to Mac mini IP
2. Users revert to old app within minutes
3. Data sync may have gaps but app is functional

### 21.2 Database Rollback

1. Railway PostgreSQL → pg_dump
2. Import to Mac mini PostgreSQL
3. Point DNS to Mac mini

### 21.3 Code Rollback

1. Railway supports instant rollback to previous deploy
2. `railway rollback` or redeploy previous commit

---

*End of document*
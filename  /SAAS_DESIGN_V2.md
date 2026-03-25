# Wedding Planner SaaS — Architecture & Implementation Plan v2

> Revised March 2026 — incorporates findings from independent technical review

---

## Design Philosophy

- **Everything on Railway + Cloudflare.** One dashboard, one bill, minimal vendor sprawl.
- **Better Auth retained** — proven in production, migration cost not justified.
- **PostgreSQL RLS as a second security net** — correctly implemented via transaction wrapping, not middleware injection.
- **PgBouncer as a first-class service** — Railway PostgreSQL has no built-in pooler; two app replicas require explicit connection pooling.
- **Signed `weddingId` cookie** — tenant context cannot be tampered with client-side.
- **Inngest for background jobs** — exactly-once execution across multiple app instances.
- **Full invitation system, onboarding wizard, GDPR export, and grace period logic** included from day one.

---

## Changelog from v1

| Section | Change | Reason |
|---------|--------|--------|
| §3.3 | RLS approach changed from Prisma middleware to explicit transaction wrapping | `SET LOCAL` only persists within a transaction — middleware approach silently fails |
| §2.1 | PgBouncer added as a Railway service | Railway PostgreSQL has no built-in connection pooler |
| §5.3 | `weddingId` cookie must be signed with `NEXTAUTH_SECRET` | Unsigned cookie allows tenant ID tampering |
| §6.2 | Trial policy made explicit — card required after 7 days | No-card trials with email-only verification are high-abuse risk |
| §5.4 | RSVP access during `CANCELLED` status made explicit in middleware spec | Guests must not be affected by a couple's payment lapse |
| §4.1 | `slug` field removed from `Wedding` model | Unused — adds uniqueness constraint complexity for no current benefit |
| Phase 1 | Time estimate revised from 5–7 days to 8–10 days | ~60 API routes each need `weddingId` filter; estimate was optimistic |
| Phase 1 | Dev seed script added | Removing `SEED_ADMIN_*` vars breaks local development bootstrapping |
| §2.1 | Railway Buckets maturity note added | Service only launched September 2025 |

---

## 1. Executive Summary

| Decision area | Choice | Rationale |
|---|---|---|
| Auth provider | Better Auth (retained) | Already production-tested; migration risk not justified |
| Tenancy model | Row-level, `weddingId` scoped + PostgreSQL RLS | Simple to implement; DB enforces isolation as backstop |
| RLS implementation | Explicit `$transaction` wrapper per route | `SET LOCAL` requires a transaction — Prisma middleware alone is insufficient |
| Billing | Stripe (direct integration) | Full control — trials, grace periods, plan tiers |
| App hosting | Railway (2–3 replicas) | Stateless containers behind Cloudflare load balancer |
| Database | Railway PostgreSQL 16 + PgBouncer | Integrated; PgBouncer required for multi-instance connection pooling |
| Redis | Railway Redis 7 | Same project, auto-injected credentials, shared rate limiting and cache |
| File storage | Railway Buckets (S3-compatible) | Native credential injection, zero egress fees; note: launched Sept 2025 |
| Background jobs | Inngest | Exactly-once scheduling; replaces fragile daemon subprocess |
| CDN / edge | Cloudflare (free tier) | DNS, WAF, DDoS, TLS, zero-trust tunnel |
| Membership | `WeddingMember` join table | Supports planners managing multiple weddings from day one |
| Invitation system | Token-based `WeddingInvite` | Couple invites partner / planner without admin seeding |
| Trial policy | 14 days free, card required after day 7 | Balances low signup friction with abuse prevention |
| Tenant cookie | Signed `weddingId` cookie | Unsigned cookies allow client-side tenant ID forgery |

---

## 2. Infrastructure Stack

All compute and data services run on Railway inside a single project. Cloudflare sits in front as the global edge, providing DNS, CDN, TLS termination, WAF, and the zero-trust tunnel that connects Cloudflare to Railway without exposing any ports.

```
┌───────────────────────────────────────────────────────────────┐
│  Cloudflare                                                   │
│  DNS · TLS · WAF · DDoS · CDN · Zero-Trust Tunnel            │
└─────────────────────────┬─────────────────────────────────────┘
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
       ┌────────────────┼──────────────────────┐
       ▼                ▼                      ▼
┌───────────┐   ┌────────────┐   ┌──────────────────┐
│ PgBouncer │   │  Redis 7   │   │ Railway Buckets  │
│ (Railway) │   │ (Railway)  │   │ (S3-compatible)  │
└─────┬─────┘   └────────────┘   └──────────────────┘
      │
┌─────▼──────┐
│ PostgreSQL │
│     16     │
│ (Railway)  │
└────────────┘

External services:
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Stripe  │  │ Inngest  │  │   SMTP   │
│(billing) │  │  (jobs)  │  │  (email) │
└──────────┘  └──────────┘  └──────────┘
```

### 2.1 Service Rationale

| Service | Plan / cost | Notes |
|---------|-------------|-------|
| Railway (app × 2 replicas) | Pro ~£16/mo base + usage | Rolling deploys, health checks, auto-restart |
| Railway PostgreSQL 16 | Included in usage | Daily backups, point-in-time recovery on Pro |
| Railway PgBouncer | Minimal usage cost | Required — Railway PostgreSQL has no built-in pooler |
| Railway Redis 7 | Included in usage | Rate limiting + shared cache across instances |
| Railway Buckets | $0.015/GB stored, zero egress | S3-compatible; launched Sept 2025 — relatively new |
| Cloudflare | Free (WAF/CDN/tunnel) | Already in use; zero-trust tunnel, no open ports |
| Stripe | 1.5% + 20p per transaction | Trials, grace periods, Customer Portal |
| Inngest | Free up to 50k runs/month | Exactly-once background jobs |
| SMTP / Resend | Free up to 3k emails/month | Transactional email; nodemailer config unchanged |

> **Railway Buckets note:** Launched September 2025 — approximately 6 months old at time of writing. No object versioning, no lifecycle rules, no private network access yet. Suitable for this use case (attachment and receipt storage) but newer than alternatives such as Cloudflare R2. Monitor Railway's release notes; if stability issues arise, migration to Cloudflare R2 uses the same S3-compatible SDK with a credential swap only.

### 2.2 Request Flow — Admin / Couple

1. Browser sends HTTPS request to `app.yourdomain.com`
2. Cloudflare: WAF rules checked, DDoS mitigated, TLS terminated, forwarded via tunnel
3. Railway load balancer: picks an available Next.js container (round-robin)
4. Better Auth middleware: validates session token; reads and verifies signed `weddingId` cookie; redirects to `/login` if invalid
5. Subscription gate: checks `subscriptionStatus` on `Wedding` record
6. API route or React Server Component: Prisma `$transaction` sets RLS session variable; query executes with `WHERE weddingId = ?`
7. Response returned — HTML/JSON for data, presigned S3 URL for file downloads

### 2.3 Request Flow — RSVP Guest

1. Browser navigates to `app.yourdomain.com/rsvp/<token>`
2. Cloudflare forwards the request (no auth check at edge)
3. Middleware: detects `/rsvp/*` public route pattern, **skips session check and subscription gate entirely**
   > This is intentional and must be preserved in code — guests must never be affected by a couple's payment status. If a wedding's subscription lapses, RSVP links continue to work as long as the `Wedding` record exists in the database.
4. Redis rate-limit check: per-IP and per-token limits enforced
5. RSVP API route: token validated, guest record fetched and response saved
6. No `weddingId` cookie required — the guest's `rsvpToken` is globally unique and resolves the tenant implicitly

---

## 3. Tenancy Model

### 3.1 Row-Level Tenancy with RLS Backstop

All tenant data is filtered by `weddingId` in application code. PostgreSQL Row Level Security provides a second enforcement layer at the database level.

> **Why two layers?** In row-level tenancy, a single missing `WHERE weddingId = ?` is a data leak. Application-level filtering is the primary defence. RLS is the safety net that ensures buggy code cannot cross tenant boundaries. For a commercial SaaS handling personal wedding data this is non-negotiable.

### 3.2 Application Layer — requireRole() Pattern

Every API route extracts `weddingId` from the auth context returned by `requireRole()`. It is never trusted from the request body or query params.

```typescript
// Every protected API route follows this pattern:
const auth = await requireRole(['ADMIN', 'VIEWER'], req);
if (!auth.authorized) return auth.response;

const { weddingId, role } = auth;  // weddingId always from signed cookie, never from req

const guests = await withTenantContext(weddingId, (tx) =>
  tx.guest.findMany({ where: { weddingId } })
);
```

### 3.3 Database Layer — PostgreSQL RLS (Correct Implementation)

> **Critical implementation note:** `SET LOCAL` in PostgreSQL only persists for the duration of the current transaction. Outside a transaction it has no effect. A Prisma middleware that calls `SET LOCAL` before `next(params)` does not work — the variable is unset by the time the query executes. All RLS-protected queries must be wrapped in an explicit `$transaction`.

#### RLS policies (applied once via migration)

```sql
-- Applied to every tenant-scoped table
ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Guest"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

-- The `true` flag makes current_setting() return NULL instead of
-- throwing an error when the variable is not set (e.g. migrations).
-- NULL short-circuits to no RLS restriction — migrations run as superuser
-- which bypasses RLS entirely regardless.
```

Apply the same policy to: `Supplier`, `Table`, `Room`, `RoomElement`, `Payment`, `Attachment`, `Appointment`, `Task`, `MealOption`, `SupplierCategory`, `AppointmentCategory`, `TaskCategory`.

#### Application helper — `withTenantContext()`

```typescript
// src/lib/tenant.ts
import { prisma } from './prisma';
import { PrismaClient } from '@prisma/client';

/**
 * Wraps a Prisma operation in a transaction that sets the RLS
 * session variable for the duration of the transaction.
 *
 * MUST be used for all queries on tenant-scoped tables.
 *
 * Usage:
 *   const guests = await withTenantContext(weddingId, tx =>
 *     tx.guest.findMany({ where: { weddingId } })
 *   );
 */
export async function withTenantContext<T>(
  weddingId: string,
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SET LOCAL "app.current_wedding_id" = ${weddingId}
    `;
    return fn(tx);
  });
}
```

> **Performance note:** Wrapping every query in a transaction adds a small overhead (~1ms for the `SET LOCAL` statement). For the majority of routes this is negligible. Bulk operations (guest import, bulk status update) are already transactional for data integrity reasons and benefit for free.

### 3.4 weddingId Propagation Rule

> `requireRole()` returns `{ user, weddingId, role, wedding }`. Every route must use `weddingId` from this return value and pass it to `withTenantContext()`. Code review enforces this convention. The RLS policy enforces it at the database level as a backstop.

---

## 4. Data Model

### 4.1 New Models

#### Wedding

```prisma
// Replaces the WeddingConfig singleton (id = 1)
model Wedding {
  id                   String          @id @default(cuid())
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
  gracePeriodEndsAt    DateTime?       // set on payment failure; full access until this date

  // Data retention
  cancelledAt          DateTime?
  deleteScheduledAt    DateTime?       // 90 days after cancellation; Inngest purges on this date

  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  // Relations
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
  TRIALING   // within trial period
  ACTIVE     // paid and current
  PAST_DUE   // payment failed — grace period running
  CANCELLED  // subscription ended — read-only until deleteScheduledAt
  PAUSED     // reserved for future use
}
```

> **`slug` field removed:** The v1 design included a `slug` field (e.g. `simon-natalie-2026`) on `Wedding`. It is not used in any route or URL in the current design. Removed to avoid a uniqueness constraint and generation logic for no current benefit. Can be added when there is a concrete use case.

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
  expiresAt DateTime  // 7-day expiry from creation
  usedAt    DateTime?
  usedBy    String?   // userId who accepted
  createdAt DateTime  @default(now())

  wedding   Wedding   @relation(fields: [weddingId], references: [id], onDelete: Cascade)

  @@index([weddingId])
}
```

### 4.2 Modified Models — Add weddingId

Every tenant-scoped table gains a `weddingId` FK and composite indexes:

```prisma
model Guest {
  id        String  @id @default(cuid())
  weddingId String                          // NEW
  wedding   Wedding @relation(fields: [weddingId], references: [id], onDelete: Cascade)
  // ... all existing fields unchanged ...

  @@index([weddingId])
  @@index([weddingId, groupName])
  @@index([weddingId, rsvpStatus])
}

// Same pattern for: Supplier, Table, Room, RoomElement, Payment,
// Attachment, Appointment, Task, MealOption, SupplierCategory,
// AppointmentCategory, TaskCategory
```

### 4.3 Modified User Model

User becomes a pure identity record. Role moves to `WeddingMember.role` so a user can be ADMIN on one wedding and VIEWER on another.

```prisma
model User {
  id               String          @id @default(cuid())
  email            String          @unique
  name             String?
  // role REMOVED — now per-wedding on WeddingMember
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
- `UserRole` field on `User` — moved to `WeddingMember.role`
- Singleton pattern (`id = 1`) — replaced by `weddingId` scoping
- `SEED_ADMIN_*` environment variables — replaced by registration flow (dev seed script added separately)
- `slug` field on `Wedding` — removed, not currently used

---

## 5. Authentication & Session

### 5.1 Better Auth Retained

Better Auth is retained. Email+password login, TOTP 2FA, backup codes, trusted devices, and session management are all production-tested and continue unchanged. The session is extended to carry the active `weddingId` via a **signed** supplementary cookie.

### 5.2 Signed weddingId Cookie

> **Security requirement:** The `weddingId` cookie must be cryptographically signed. An unsigned cookie allows any client to set an arbitrary `weddingId` and attempt cross-tenant access. RLS provides the safety net at the DB layer, but signed cookies prevent the application from ever executing a query with a tampered tenant ID.

```typescript
// src/lib/wedding-cookie.ts
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

export async function signWeddingId(weddingId: string): Promise<string> {
  return new SignJWT({ weddingId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret);
}

export async function verifyWeddingCookie(
  token: string
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload as { weddingId: string }).weddingId;
  } catch {
    return null; // expired or tampered
  }
}
```

The cookie is set as `HttpOnly; Secure; SameSite=Lax` with a 30-day expiry matching the Better Auth session.

### 5.3 Login Flow with Wedding Context

```
1. User submits email + password
2. Better Auth validates credentials → creates session (unchanged)
3. App fetches user's WeddingMember records
4. If one wedding  → auto-select, set signed weddingId cookie, redirect /dashboard
5. If multiple     → redirect /select-wedding picker
6. All subsequent requests carry: Better Auth session cookie + signed weddingId cookie
7. requireRole() validates and verifies both on every protected route
```

### 5.4 Updated requireRole()

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
  // 2. Read and cryptographically verify signed weddingId cookie
  //    → if missing or tampered: return 401
  // 3. Validate user is a WeddingMember of that wedding with required role
  // 4. Check subscription: ACTIVE, TRIALING, or within gracePeriodEndsAt
  //    → if CANCELLED and past grace period: return 403 with billing redirect
  // 5. Check sessionVersion (unchanged)
  // Returns { authorized: true, user, weddingId, role, wedding }
}
```

### 5.5 Middleware

```
Request comes in:
  1. Is path public?
     (/login /register /invite/* /rsvp/* /api/auth/* /api/webhooks/* /api/health)
                                                     → pass through unconditionally
     NOTE: /rsvp/* must always pass through regardless of subscription status.
     Guests must never be affected by a couple's payment lapse.

  2. Is Better Auth session valid?              → no → redirect /login
  3. Is signed weddingId cookie valid?          → no → redirect /select-wedding
  4. Subscription status:
       ACTIVE or TRIALING                       → pass through
       PAST_DUE within gracePeriodEndsAt        → pass through + inject warning banner prop
       PAST_DUE past gracePeriodEndsAt          → redirect /billing/suspended
       CANCELLED                                → redirect /billing/suspended
  5. Pass through to route handler
```

---

## 6. Stripe Billing

### 6.1 Trial Policy

> **Decision:** Trial requires a valid payment method after day 7.
>
> **Rationale:** No-card trials combined with email-only verification create a high-abuse surface — any email alias (`user+1@gmail.com`) yields another free trial indefinitely. Requiring a card after 7 days (not upfront) keeps signup friction low for genuine customers while eliminating abuse. Stripe supports this natively: `trial_period_days: 14, payment_settings: { save_default_payment_method: 'on_subscription' }` with a card-collection step on day 7.

```
Day 0:  Sign up — no card required. Trial starts. Full access.
Day 7:  Email reminder: "Add a payment method to continue after your trial"
        Stripe prompts for card via Customer Portal link.
        No card added → trial continues but will not auto-convert to paid.
Day 14: Trial ends.
        Card on file → subscription activates automatically (ACTIVE)
        No card       → subscription lapses (PAST_DUE → grace period starts)
```

### 6.2 Subscription Lifecycle

| Stripe event | Action | User impact |
|---|---|---|
| `checkout.session.completed` | Create `User` + `Wedding` + `WeddingMember(ADMIN)`, set `stripeCustomerId`, `trialEndsAt` | App access granted; onboarding wizard shown |
| `invoice.payment_succeeded` | `subscriptionStatus = ACTIVE`, update `currentPeriodEnd` | Continued full access |
| `invoice.payment_failed` | `subscriptionStatus = PAST_DUE`, set `gracePeriodEndsAt = now + 7 days` | Warning banner; full access for 7 days |
| Grace period expires (Inngest daily job) | `subscriptionStatus = CANCELLED` if `now > gracePeriodEndsAt` | Redirect to `/billing/suspended`; read-only |
| `customer.subscription.deleted` | `subscriptionStatus = CANCELLED`, set `deleteScheduledAt = now + 90 days` | Read-only; data export email sent |
| `customer.subscription.trial_will_end` | Trigger Inngest: send reminder email | Email to couple 3 days before trial ends |

> **Grace period design:** On payment failure the customer gets 7 days of continued full access. `gracePeriodEndsAt` is stored on the `Wedding` record. A daily Inngest job (not the webhook) moves `PAST_DUE` → `CANCELLED` after this date. Using a job rather than the webhook avoids race conditions between Stripe's automatic payment retries and the lockout timer — if Stripe retries and succeeds during the grace period, the webhook updates `subscriptionStatus = ACTIVE` before the Inngest job runs.

### 6.3 New Routes

```
POST /api/register              — Create Stripe Checkout session (trial start)
POST /api/billing/portal        — Redirect to Stripe Customer Portal
POST /api/webhooks/stripe       — Stripe event handler (sig-validated, idempotent)
GET  /billing                   — Billing management page
GET  /billing/suspended         — Read-only lapsed subscription page with reactivate CTA
```

---

## 7. Invitation System

The seed-based user management (`SEED_ADMIN_*` env vars) is replaced by a token-based invitation flow.

```
ADMIN creates invite:
  POST /api/invites { role: 'RSVP_MANAGER', email: 'planner@example.com' }
  → Creates WeddingInvite record (7-day expiry)
  → Sends email: "You've been invited to join [Couple Name]'s wedding planning"

Invitee clicks link → GET /invite/[token]
  → Token valid and not expired?
      Existing account → "Join [Couple Name]" confirm screen
      No account       → Registration form (no Stripe step — joining, not creating)
  → POST /api/invites/[token]/accept
      → Create User + Account if new (Better Auth credentials)
      → Create WeddingMember with role from invite
      → Sign weddingId cookie for the accepted wedding
      → Mark invite as usedAt / usedBy
      → Redirect to /dashboard
```

| Route | Method | Access |
|---|---|---|
| `/api/invites` | GET | ADMIN — list active invites |
| `/api/invites` | POST | ADMIN — create invite |
| `/api/invites/[id]` | DELETE | ADMIN — revoke invite |
| `/api/invites/[token]/accept` | POST | Public — accept invite |
| `/invite/[token]` | GET page | Public — accept UI |

---

## 8. File Storage — Railway Buckets

The `./data/uploads` bind mount is replaced by Railway Buckets (S3-compatible, auto-credential injection, zero egress fees).

> **Maturity note:** Railway Buckets launched September 2025. Current limitations include no object versioning, no lifecycle rules, and no private network access (uploads traverse the public internet). These are not blockers for the current use case. Migration to Cloudflare R2 if needed requires only a credential swap — both use the same S3-compatible SDK.

### 8.1 Key Structure

```
Bucket: wedding-planner-uploads

/{weddingId}/suppliers/{supplierId}/{uuid}_{originalFilename}
/{weddingId}/receipts/{paymentId}/{uuid}_{originalFilename}
```

### 8.2 S3 Client Helper

```typescript
// src/lib/s3.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.RAILWAY_BUCKET_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.RAILWAY_BUCKET_ACCESS_KEY_ID!,
    secretAccessKey: process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET = process.env.RAILWAY_BUCKET_NAME!;

// Upload
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: body, ContentType: contentType,
  }));
}

// Presigned download URL (file served direct from bucket, not through app)
export async function getDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn }
  );
}

// Delete
export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
```

The existing `/api/uploads/[supplierId]/[filename]` session check is preserved — the route still validates the Better Auth session and that the `supplierId` belongs to the requesting wedding before generating the presigned URL. The file is served directly from the bucket; the app server is not in the download path.

---

## 9. Connection Pooling — PgBouncer

> **Required:** Railway's managed PostgreSQL has no built-in connection pooler. Two app replicas each running Prisma's default connection pool will create multiple pools of connections hitting PostgreSQL simultaneously. Under sustained load this exhausts PostgreSQL's `max_connections` limit and causes connection errors.

### 9.1 PgBouncer as a Railway Service

Railway provides a ready-to-deploy PgBouncer template. Add it to the Railway project as a separate service. The app connects to PgBouncer; PgBouncer manages the pool to PostgreSQL.

```
App Server A ─┐
              ├──▶ PgBouncer (Railway) ──▶ PostgreSQL (Railway)
App Server B ─┘
```

### 9.2 Configuration

```bash
# App connects to PgBouncer, not PostgreSQL directly
DATABASE_URL=postgresql://user:pass@pgbouncer.railway.internal:5432/railway

# PgBouncer connects to PostgreSQL
PGBOUNCER_DATABASE_URL=postgresql://user:pass@postgres.railway.internal:5432/railway

# Pool mode — transaction mode required for RLS SET LOCAL to work correctly
POOL_MODE=transaction

# Pool size per app instance
MAX_CLIENT_CONN=100
DEFAULT_POOL_SIZE=25
```

> **Pool mode and RLS:** PgBouncer must run in **transaction mode** for the `SET LOCAL` RLS approach. In session mode, PgBouncer assigns a backend connection for the duration of a client session — session-level variables could persist across requests from different tenants. Transaction mode assigns a backend connection only for the duration of a transaction, then returns it to the pool, ensuring `SET LOCAL` variables are always scoped correctly.

### 9.3 Prisma Configuration

```typescript
// prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // PgBouncer URL
  directUrl = env("DIRECT_DATABASE_URL") // Direct PostgreSQL URL for migrations
}
```

`directUrl` is used by `prisma migrate` only. Migrations bypass PgBouncer and connect directly to PostgreSQL (PgBouncer's transaction mode blocks DDL statements).

---

## 10. Background Jobs — Inngest

The `reminder-daemon.ts` subprocess running in `entrypoint.sh` is replaced by Inngest functions.

### 10.1 Functions

| Function | Trigger | Replaces / New |
|---|---|---|
| `appointment-reminders` | Cron: every hour | Replaces `reminder-daemon.ts` subprocess |
| `mark-overdue-payments` | Cron: daily 6am | Removes dashboard page-load write |
| `grace-period-expiry` | Cron: daily | New — moves `PAST_DUE` → `CANCELLED` after 7 days |
| `purge-expired-weddings` | Cron: daily | New — deletes data 90 days after cancellation |
| `trial-ending-reminder` | Event: `stripe/trial.will_end` | New — email 3 days before trial ends |
| `payment-failure-email` | Event: `stripe/payment.failed` | New — grace period warning email |
| `cancellation-data-export` | Event: `wedding/cancelled` | New — triggers data export + deletion notice |
| `welcome-email` | Event: `wedding/created` | New — onboarding email after registration |

### 10.2 Inngest functions check subscription status

Every Inngest function operating on a specific wedding verifies the subscription is still in the expected state at the start of execution. This prevents a job queued before cancellation from running against a deleted or lapsed wedding.

```typescript
inngest.createFunction(
  { id: 'appointment-reminders' },
  { cron: '0 * * * *' },
  async () => {
    // Fetch only active/trialing/past_due weddings
    const weddings = await prisma.wedding.findMany({
      where: {
        subscriptionStatus: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
      select: { id: true, reminderEmail: true },
    });
    // Process each wedding independently
    for (const wedding of weddings) {
      await checkAppointmentReminders(wedding.id, wedding.reminderEmail);
    }
  }
);
```

### 10.3 New Route

```
POST /api/inngest  — Inngest webhook endpoint
```

---

## 11. Shared Cache — Railway Redis

The process-local `Map` in `src/lib/cache.ts` is replaced with Railway Redis. Cache keys are `weddingId`-prefixed to prevent cross-tenant pollution. The `getCached`/`invalidateCache` API is unchanged so all callers require only a one-line import change.

```
Cache key format: {weddingId}:{dataType}

{weddingId}:wedding-config
{weddingId}:meal-options
{weddingId}:supplier-categories
{weddingId}:appointment-categories
{weddingId}:task-categories

TTL: 5 minutes (300s)
Invalidation: called after every write to the relevant model (unchanged)
```

---

## 12. New Pages & API Routes

### 12.1 New Pages

| Path | Purpose |
|---|---|
| `/register` | Sign up → Stripe Checkout → trial start |
| `/invite/[token]` | Accept wedding invitation |
| `/select-wedding` | Wedding picker for planners managing multiple weddings |
| `/billing` | Subscription status + Stripe Customer Portal link |
| `/billing/suspended` | Read-only notice when subscription lapsed |
| `/onboarding/wedding` | Set couple name, date, venue |
| `/onboarding/invite` | Invite partner or wedding planner |
| `/onboarding/done` | Onboarding complete → redirect to dashboard |

### 12.2 New API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/register` | POST | Create Stripe Checkout session |
| `/api/billing/portal` | POST | Create Stripe Customer Portal session |
| `/api/webhooks/stripe` | POST | Stripe event handler (idempotent) |
| `/api/inngest` | POST | Inngest job handler |
| `/api/invites` | GET / POST | List / create invitations |
| `/api/invites/[id]` | DELETE | Revoke invitation |
| `/api/invites/[token]/accept` | POST | Accept invitation |
| `/api/weddings/current` | GET / PATCH | Active wedding config (replaces `/api/settings`) |
| `/api/export` | GET | GDPR data export — zip of all wedding data |
| `/api/health` | GET | Railway health check (unchanged) |

### 12.3 Removed Routes

- `/api/settings` → replaced by `/api/weddings/current`
- `/api/users` (seed-based management) → replaced by invitation system

---

## 13. GDPR & Data Retention

### 13.1 Data Export

- `GET /api/export` — ADMIN only — generates a zip of all wedding data (guests CSV, suppliers JSON, payments JSON, attachments index, config)
- Returned as a direct download or emailed as a presigned S3 link for large datasets
- Triggered automatically by the `cancellation-data-export` Inngest function on cancellation

### 13.2 Deletion Schedule

```
On subscription cancellation:
  → subscriptionStatus = CANCELLED
  → deleteScheduledAt = now() + 90 days
  → cancelledAt = now()
  → Inngest event: 'wedding/cancelled'
      → Send data export + deletion date email to couple

Daily Inngest job: purge-expired-weddings
  → Find all weddings where deleteScheduledAt ≤ now()
  → Delete all S3 files under /{weddingId}/
  → Delete Wedding record (cascades to all related rows via FK)

7 days before deleteScheduledAt:
  → Inngest scheduled function sends final deletion warning email
```

---

## 14. Environment Variables

### 14.1 New Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STANDARD=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Railway Buckets (auto-injected by Railway — confirm names in dashboard)
RAILWAY_BUCKET_ENDPOINT=https://...
RAILWAY_BUCKET_ACCESS_KEY_ID=...
RAILWAY_BUCKET_SECRET_ACCESS_KEY=...
RAILWAY_BUCKET_NAME=wedding-planner-uploads

# PgBouncer
DATABASE_URL=postgresql://...@pgbouncer.railway.internal:5432/railway
DIRECT_DATABASE_URL=postgresql://...@postgres.railway.internal:5432/railway

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# App
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
TRIAL_DAYS=14
GRACE_PERIOD_DAYS=7
DATA_RETENTION_DAYS=90
```

### 14.2 Removed Variables

```bash
SEED_ADMIN_1_NAME / EMAIL / PASSWORD   # replaced by registration flow
SEED_ADMIN_2_* / SEED_ADMIN_3_*        # replaced by invitation system
REDIS_URL                              # replaced by Railway Redis auto-injection
```

### 14.3 Unchanged Variables

```bash
NEXTAUTH_SECRET       # now also used to sign weddingId cookie
NEXTAUTH_URL
SMTP_HOST / PORT / USER / PASS / FROM
EMAIL_RATE_LIMIT_*
RSVP_RATE_LIMIT_*
BULK_GUEST_LIMIT
BULK_EMAIL_LIMIT
GRACEFUL_TIMEOUT
```

---

## 15. Development Environment

### 15.1 Local Setup

```yaml
# docker-compose.yml (development only)
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@pgbouncer:5432/wedding
      DIRECT_DATABASE_URL: postgresql://postgres:postgres@db:5432/wedding
      # All other vars from .env

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: wedding
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./data/postgres:/var/lib/postgresql/data

  pgbouncer:
    image: edoburu/pgbouncer
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/wedding
      POOL_MODE: transaction
    depends_on: [db]

  redis:
    image: redis:7-alpine
    volumes:
      - ./data/redis:/data
```

### 15.2 Dev Seed Script

The `SEED_ADMIN_*` env vars are removed in production. A development-only seed script bootstraps local data without going through Stripe Checkout.

```typescript
// prisma/seed.ts — dev only (guarded by NODE_ENV check)
if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed script must not run in production');
}

// Create a dev wedding
const wedding = await prisma.wedding.create({
  data: {
    coupleName: 'Dev Couple',
    subscriptionStatus: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  },
});

// Create admin user with Account record (Better Auth pattern)
const user = await prisma.user.create({ data: { email: 'admin@dev.local', name: 'Dev Admin' } });
await prisma.account.create({
  data: {
    userId: user.id,
    providerId: 'credential',
    accountId: 'admin@dev.local',
    password: await bcrypt.hash('password', 10),
  },
});
await prisma.weddingMember.create({
  data: { userId: user.id, weddingId: wedding.id, role: 'ADMIN' },
});
```

---

## 16. Implementation Phases

Five phases, each independently deployable. The personal wedding app continues running on the Mac mini throughout.

---

### Phase 1 — Foundation (8–10 days)

1. Fork repo into new repository
2. Remove single-tenant assumptions (WeddingConfig singleton, SEED_ADMIN vars, global UserRole)
3. Add `Wedding`, `WeddingMember`, `WeddingInvite` Prisma models
4. Add `weddingId` to all tenant tables — generate migration
5. Update `requireRole()` to resolve, verify signed cookie, and return `weddingId` + `role`
6. Implement `signWeddingId()` / `verifyWeddingCookie()` helpers
7. Implement `withTenantContext()` helper
8. Update middleware for signed `weddingId` cookie and subscription gate
9. Update all ~60 API routes to use `withTenantContext(weddingId, ...)`
10. Apply PostgreSQL RLS policies via a new migration
11. Update `/api/settings` → `/api/weddings/current`
12. Add dev seed script (`prisma/seed.ts`)
13. Verify all existing features work for a single seeded wedding

**Gate:** All existing features work for one wedding, seeded locally via dev script

---

### Phase 2 — Stripe Billing (3–4 days)

1. `/register` page + Stripe Checkout session (14-day trial, card required day 7)
2. Stripe webhook handler — full lifecycle (all events in §6.2)
3. Subscription status gate in middleware (grace period logic)
4. `/billing` page — Stripe Customer Portal redirect
5. `/billing/suspended` read-only page with reactivate CTA
6. Onboarding wizard — `/onboarding/wedding` → `/onboarding/invite` → `/onboarding/done`
7. `select-wedding` page for planners with multiple weddings

**Gate:** New customer can sign up, start trial, and access the app

---

### Phase 3 — Invitation System (2–3 days)

1. Invite creation API + `WeddingInvite` model (already in schema from Phase 1)
2. `/invite/[token]` accept page — existing account and new account flows
3. Invite management UI in Settings → Users (replaces current seed-based user management)
4. Email templates for invitations

**Gate:** Couple can invite their partner and wedding planner

---

### Phase 4 — Infrastructure (3–4 days)

1. Add PgBouncer as Railway service; update `DATABASE_URL` + `DIRECT_DATABASE_URL`
2. Replace `cache.ts` Map with Railway Redis (`weddingId`-prefixed keys)
3. Replace `fs` file operations with Railway Buckets S3 client
4. Update upload routes to write to S3; download routes to return presigned URLs
5. Replace `reminder-daemon.ts` with Inngest functions (full list in §10.1)
6. Remove dashboard-load overdue payment write → daily Inngest cron
7. Simplify `entrypoint.sh` (remove daemon subprocess)
8. Deploy to Railway — provision PostgreSQL, PgBouncer, Redis, Buckets, 2 app replicas
9. Configure Cloudflare Tunnel to Railway containers
10. Smoke test two-replica setup: confirm cache invalidation propagates, uploads accessible from both instances

**Gate:** Stateless app — safe to run multiple replicas; infrastructure fully migrated

---

### Phase 5 — Polish & Launch (2–3 days)

1. `GET /api/export` — GDPR data export zip
2. Scheduled deletion Inngest job (`purge-expired-weddings`)
3. 7-day pre-deletion warning email
4. Account deletion flow (user-initiated)
5. Trial-ending email (3 days before trial ends via `customer.subscription.trial_will_end`)
6. Payment failure warning banner (injected by middleware for `PAST_DUE` status)
7. Rate limiting tuning for multi-tenant load
8. DNS cutover from Mac mini to Railway
9. End-to-end smoke test: register → onboard → invite → RSVP → subscribe → cancel → export

**Gate:** Production-ready for paying customers

---

## 17. What Does Not Change

| Area | Files / modules |
|---|---|
| All UI components | `src/components/` — no tenancy awareness needed in the UI layer |
| Business logic | `src/lib/rsvpStatus.ts`, `src/lib/csv.ts`, `src/lib/validation.ts` |
| Public RSVP flow | `/rsvp/[token]` — `rsvpToken` is globally unique; no `weddingId` cookie required |
| Seating canvas | react-konva `SeatingVisualView` — unchanged |
| Print views | All print routes — unchanged |
| 2FA / backup codes / trusted devices | All retained as-is |
| Email templates | `src/lib/email.ts` — nodemailer config unchanged |
| Rate limiting | `src/lib/rate-limit.ts` — already Redis-backed with fallback |
| Error handling | `src/lib/db-error.ts`, `src/lib/validation.ts`, `src/lib/filename.ts` |
| Most API route logic | Core business logic unchanged; only `weddingId` filter and `withTenantContext()` wrapper added |

---

## 18. Key Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing `weddingId` filter leaks tenant data | Medium | PostgreSQL RLS via `withTenantContext()` as DB-level safety net |
| `weddingId` cookie tampered by client | Low | Signed JWT cookie verified in `requireRole()`; RLS is second net |
| PgBouncer transaction mode breaks non-transactional Prisma features | Low | Test session-level features (`LISTEN`/`NOTIFY` not used); `directUrl` for migrations |
| Stripe webhook replay / duplicate processing | Low | Idempotency: check `stripeSubscriptionId` already processed before acting |
| Trial abuse — repeat sign-ups | Medium | Card required day 7; email verification; disposable domain blocklist |
| Inngest job processes cancelled wedding | Low | Check `subscriptionStatus` at start of every Inngest function |
| Railway Buckets stability (new service) | Low | S3-compatible SDK — swap to Cloudflare R2 requires credential change only |
| Connection pool exhaustion before PgBouncer added | Medium | Add PgBouncer in Phase 4 before deploying two replicas |
| Data not purged on schedule (GDPR exposure) | Low | `deleteScheduledAt` is queryable; daily Inngest job with failure alerting |
| Multi-replica deploy before Phase 4 complete | Medium | Run single replica until Phase 4 gate is passed |

---

## 19. Cost Estimate

| Service | Launch (0–50 weddings) | Growth (500 weddings) |
|---|---|---|
| Cloudflare | Free | Free |
| Railway (app × 2 + PgBouncer + Redis + DB) | ~£20–30/mo | ~£70–110/mo |
| Railway Buckets | < £1/mo (negligible storage) | ~£2–5/mo |
| Stripe | £0 at £0 revenue; 1.5% + 20p/tx | ~£200/mo on 500 × £12 subs |
| Inngest | Free (< 50k runs/mo) | ~£15/mo |
| SMTP / Resend | Free (< 3k emails/mo) | ~£15/mo |
| **Total (excl. Stripe %)** | **~£25–35/month** | **~£110–145/month** |

> **Break-even:** At £12/month per wedding, infrastructure at launch (~£30/mo) breaks even at 3 paying customers. At 500 weddings generating £6,000/mo gross, infrastructure is approximately 2% of revenue.

---

*End of document — v2*

# Architecture Decisions

Coding rules, patterns, and constraints that apply to all new code in this project.

---

## Data persistence — bind mounts, not named volumes

```
./data/postgres   →  /var/lib/postgresql/data
./data/minio      →  /data  (MinIO object storage — local dev only)
./data/redis      →  /data  (Redis persistence)
```
This makes the data trivially portable — copy the `data/` folder to move servers. The `postgres` service runs as UID 999 to match the default postgres user inside the container.

In production (Railway) file attachments live in Railway Buckets (Tigris S3), not in `data/`. The `data/minio/` folder is local dev only.

## File storage — S3 (MinIO locally, Railway Buckets in production)

Uploaded supplier attachments and payment receipts are stored in S3-compatible object storage. The same `@aws-sdk/client-s3` code runs in both environments — only the credentials and endpoint differ.

**Key structure:**
- Supplier attachments: `{weddingId}/suppliers/{supplierId}/{uuid}.ext`
- Payment receipts: `{weddingId}/receipts/{paymentId}/{uuid}.ext`

**Two-client pattern** (`src/lib/s3.ts`):
- `s3` — server-side ops (upload, delete, list) — uses `AWS_ENDPOINT_URL` (Docker-internal `minio:9000` in dev, Tigris in prod)
- `s3Public` — presigned URL generation — uses `S3_PUBLIC_ENDPOINT_URL` if set, otherwise falls back to `AWS_ENDPOINT_URL`. This is critical: presigned URLs embed the endpoint host in the HMAC signature. Signing with the Docker-internal hostname then rewriting the URL breaks the signature (SignatureDoesNotMatch error). In prod `S3_PUBLIC_ENDPOINT_URL` is unset so both clients use the same Tigris endpoint.

**Serving files:** `/api/uploads/[supplierId]/[...filename]` and `/api/payments/[id]/receipt` both look up the `Attachment` record, generate a presigned URL via `getDownloadUrl()`, and redirect 302. Auth is checked before the redirect — unauthenticated users cannot access files.

**`forcePathStyle`:** `true` for MinIO (path-style: `http://host/bucket/key`), `false` for Railway/Tigris (virtual-hosted: `http://bucket.host/key`). Controlled by `S3_FORCE_PATH_STYLE` env var (defaults `true` in docker-compose, unset in Railway).

## List page component pattern

All list pages (Guests, Suppliers, Payments, Appointments, Tasks) follow the same pattern:
- `page.tsx` is a minimal server component that fetches data and passes it to a client component
- The client component (`GuestList`, `SupplierList`, `PaymentsList`, `AppointmentsList`, `TasksPageClient`) handles all UI including the header row
- Header row: `<h1>` title + "Add X" button (visible only to users with edit permission)
- Add button styling: `flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90`
- This pattern keeps the page component simple (server-side data fetching only) and moves all interactive state to the client component

## Reminder daemon — tsx subprocess

`entrypoint.sh` starts `src/scripts/reminder-daemon.ts` via `tsx` as a background process alongside `next start`. It runs `checkAppointmentReminders()` immediately on startup, then every 60 minutes. Sends reminders to `SMTP_FROM`. The daemon is intentionally not a Next.js API cron to avoid cold-start gaps.

## Inngest — scheduled jobs and event-driven workflows

Inngest handles scheduled tasks (cron) and event-triggered functions. When `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set, the app registers functions with Inngest Cloud which calls `/api/inngest` to execute them.

**Environment variables:**
- `INNGEST_EVENT_KEY` — Event key from Inngest dashboard
- `INNGEST_SIGNING_KEY` — Signing key from Inngest dashboard
- Leave empty to disable Inngest (functions won't run)

**Cron functions (scheduled):**
| Function | Schedule | Purpose |
|----------|----------|---------|
| `appointment-reminders` | Hourly (`0 * * * *`) | Send appointment reminder emails |
| `stripe-reconcile` | Daily 2 AM UTC | Sync all Stripe subscriptions with DB |
| `paypal-reconcile` | Daily 2:30 AM UTC | Sync all PayPal subscriptions with DB |
| `grace-period-expiry` | Daily 5 AM UTC | Move expired grace periods to CANCELLED |
| `mark-overdue-payments` | Daily 6 AM UTC | Mark overdue payments on dashboard |
| `pre-deletion-warning` | Daily 2 AM UTC | Send warning before account deletion |
| `purge-expired-weddings` | Daily 4 AM UTC | Delete expired cancelled accounts |

**Event-triggered functions:**
| Event | Trigger | Function |
|-------|---------|----------|
| `wedding/created` | New signup | Send welcome email |
| `stripe/trial.will_end` | Stripe webhook | Send trial ending reminder |
| `stripe/payment.failed` | Stripe webhook | Send payment failure email |
| `stripe/sync.delayed` | Null subscription | Recover subscription ID after 30s |
| `paypal/payment.failed` | PayPal webhook | Send payment failure email |
| `wedding/cancelled` | Cancellation | Schedule data export |

**Redundancy with reminder daemon:**
Appointment reminders have two mechanisms: the tsx daemon (always runs locally) and Inngest (runs when configured). If Inngest is not configured, the daemon ensures reminders still work. If both run, the daemon and Inngest may both send reminders — this is acceptable (idempotent, duplicates are harmless).

## Cloudflare Tunnel / non-standard host

When accessed via a Cloudflare Tunnel the `Host` header differs from `NEXTAUTH_URL`. Set `NEXTAUTH_URL` in `.env` to the **public** Cloudflare Tunnel domain (e.g. `https://wedding.yourdomain.com`) — this is what Better Auth uses to validate redirect URLs and build RSVP email links. Without this, auth redirects break.

## react-konva SSR workaround

Konva requires `window` and `document` — it crashes on Next.js server-side rendering. `SeatingVisualView` is dynamically imported in `SeatingClient` with `{ ssr: false }`. Do not remove this or move `SeatingVisualView` to a server component.

Konva's Node.js build also references the `canvas` npm package (for server-side rendering support it doesn't use here). This causes a webpack build error. Fixed in `next.config.js` by marking `canvas` as a webpack external:
```js
config.externals = [...config.externals, { canvas: "canvas" }]
```

**Note:** Because of the custom webpack config, the build script uses `--webpack` flag (`next build --webpack`). Dev uses `--turbopack` flag for faster local development. Do not remove the `--webpack` flag from the build script.

## middleware.ts — do not rename to proxy.ts

Better Auth requires Edge runtime, which is not supported by Next.js 16's `proxy.ts` file. Keep `middleware.ts` as-is.

## `randomId()` helper instead of `crypto.randomUUID()`

`crypto.randomUUID()` is only available in secure contexts (HTTPS / localhost). The seating visual view generates client-side temporary element IDs before they get real DB IDs. A custom `randomId()` using `Math.random()` is used instead so the app works over plain HTTP (e.g. local IP access).

## PARTIAL rsvpStatus

Guests can be invited to multiple events and decline some while accepting others. The `RsvpStatus` enum has five values: `PENDING`, `ACCEPTED`, `PARTIAL`, `DECLINED`, `MAYBE`. `PARTIAL` is auto-calculated by `src/lib/rsvpStatus.ts` whenever per-event attending answers are saved — both via the public RSVP form and the admin PUT endpoint.

## Seating planner reception filter

The seating unassigned list only shows guests who should have a seat: `invitedToReception=true AND attendingReception≠false`. Guests who decline reception after being assigned to a table are kept on their table (don't auto-remove) but shown with an amber warning badge.

## rsvpStatus ownership — auto-calc vs override

The `PUT /api/guests/[id]` endpoint auto-calculates `rsvpStatus` from per-event attending fields when any answer has been given. If no answers have been given, it falls back to the manually-passed `rsvpStatus` (allows admin to set MAYBE/PENDING manually). The `PATCH /api/guests/[id]` endpoint handles two override cases:
- `rsvpStatus` — writes status directly, bypassing auto-calc (used by the override dropdown)
- `seatNumber` — writes seat number directly; validates range (1..capacity) and uniqueness within the table

The admin detail form uses PATCH for both so that neither change triggers a full form save. The `POST /api/guests/bulk-status` endpoint uses `prisma.guest.updateMany()` to write `rsvpStatus` directly across multiple guests — same field, same bypass of auto-calc.

## Router cache (Next.js App Router)

`router.refresh()` must be called **before** `router.push()` to bust the Next.js client-side RSC router cache. Getting the order wrong causes navigation to show stale data.

`router.refresh()` should also be called after mutations that affect other pages (e.g. payment changes on `/suppliers/[id]` affect the totals visible on `/suppliers`). Call it after the mutation completes without a `router.push()` — it marks all RSC cache entries as stale so the user sees fresh data when they next navigate.

## `useState(initialProp)` sync pattern

`useState(initialProp)` only initialises state once at component mount — it does not update if the server re-renders with new props (e.g. after `router.refresh()`). To keep client state in sync with server-refreshed props, add:
```typescript
useEffect(() => { setState(initialProp); }, [initialProp]);
```
Applied in `SupplierList` so the supplier list reflects the latest server data after `router.refresh()` completes.

## RefreshContext — cross-component refresh signalling

`src/context/RefreshContext.tsx` provides a lightweight pub/sub for triggering client-side refetches without a full page navigation.

- `RefreshProvider` wraps the entire dashboard layout (`src/app/(dashboard)/layout.tsx`), above `LayoutShell`
- Exposes `refreshToken: number` (starts at 0) and `triggerRefresh()` (increments with functional update)
- **`TasksPageClient`**: `load()` has `refreshToken` in its `useCallback` deps — when the token increments, `load` is recreated and the `useEffect([load])` re-fetches. `triggerRefresh()` is called after every mutation (save, toggle complete, bulk complete, bulk delete).
- **`LayoutShell` task badge**: `refreshToken` is added to the badge `useEffect` deps alongside `pathname`, so the count updates immediately after any task mutation rather than only on navigation.
- **`GuestModal` / `SupplierModal`**: both call `triggerRefresh()` after a successful POST so the badge and any other token-watching effects stay current.
- Consume with `const { refreshToken, triggerRefresh } = useRefresh()` in any client component inside the dashboard layout.

## Three-layer caching strategy (stale data prevention)

All three Next.js/browser caching layers are suppressed throughout the app:

1. **Next.js Full Route Cache** (server-rendered HTML) — every dashboard page, layout, and API route with a GET handler has `export const dynamic = "force-dynamic"` at the top.

2. **Browser fetch cache** (client-side `fetch()` calls) — all GET fetches in client components use `fetchApi()` from `src/lib/fetch.ts`, which always adds `cache: "no-store"`. POST/PUT/PATCH/DELETE calls use `fetch()` directly (mutations are never cached by the browser).

3. **CDN / proxy cache** (Cloudflare or any reverse proxy) — all API GET handlers return responses built with `apiJson()` from `src/lib/api-response.ts` instead of `NextResponse.json()`. `apiJson()` automatically adds `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`, `Pragma: no-cache`, and `Expires: 0`.

**Rule**: whenever you add a new GET API route, import and use `apiJson()` instead of `NextResponse.json()` for the success response, and add `export const dynamic = "force-dynamic"` at the top of the file. Whenever you add a GET `fetch()` call in a client component, use `fetchApi()` instead of `fetch()`.

## Reference data caching (in-memory)

`src/lib/cache.ts` provides a reusable in-memory cache with TTL for reference data that changes infrequently:

```typescript
const cache = new Map<string, { data: unknown; expires: number }>();

export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T>;

export function invalidateCache(key: string): void;
```

**Pattern**: Wrap database queries with `getCached()` in GET handlers. Call `invalidateCache()` after any mutation that changes the cached data.

**Cached endpoints** (5-minute TTL):
- `/api/settings` — wedding config (`wedding-config`)
- `/api/meal-options` — meal options list (`meal-options`)
- `/api/planning-categories` — shared planning categories for suppliers, appointments, tasks (`${weddingId}:planning-categories`)

**Invalidation**: Each category's mutation routes (POST, PUT, DELETE) call `invalidateCache()` with the appropriate key.

**When to use**: Reference data that is read frequently but changes rarely (category lists, settings, meal options). Do NOT use for user data, guest data, or anything that needs real-time consistency.

## Graceful shutdown

`entrypoint.sh` handles SIGTERM/SIGINT for clean container stops:
- Sends SIGTERM to Next.js server and reminder daemon
- Waits up to `GRACEFUL_TIMEOUT` seconds (default 30) for processes to finish
- Stops accepting new connections during shutdown
- Force-kills processes only after timeout expires

## Health check endpoint

`GET /api/health` provides monitoring endpoint:
- Checks database connectivity (SELECT 1)
- Checks Redis connectivity if `REDIS_URL` is configured
- Returns status: `healthy` (all checks pass), `degraded` (Redis unavailable), or `unhealthy` (database unavailable)
- Used by Docker healthcheck: `wget -q --spider http://localhost:3000/api/health`
- No authentication required (public endpoint)

## Environment validation on startup

`src/lib/env.ts` validates all required environment variables when the app starts:
- Called from `src/instrumentation.ts` during Next.js initialization
- Validates: `DB_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SEED_ADMIN_1_*`
- Validates SMTP completeness if any SMTP var is set
- Throws clear error messages for missing/invalid config
- App fails fast with helpful error instead of cryptic runtime failure

## API response types

`src/types/api.ts` defines TypeScript interfaces for all API responses:
- Entity types: `UserResponse`, `GuestResponse`, `SupplierResponse`, `PaymentResponse`, etc.
- Pagination types: `PaginationMeta` (total, hasMore) extended by list responses
- Request body types: `SupplierCreateBody`, `TableUpdateBody`, `RoomUpdateBody`, etc.
- Used in API routes for type-safe request parsing
- Ensures consistent response shapes across all endpoints

## PostgreSQL quirks

**`ALTER TYPE ADD VALUE` cannot run inside a transaction** (Prisma limitation with PostgreSQL enums). Migration 4 (`add_partial_rsvp_status`) was applied directly via `docker compose exec db psql` and manually inserted into `_prisma_migrations`. If restoring to a fresh DB from the schema, all migrations will run in order automatically — no special handling needed. If the DB already exists from before migration 4, run:
```sql
ALTER TYPE "RsvpStatus" ADD VALUE 'PARTIAL';
```

**`Array.from(new Set(...))` instead of `[...new Set(...)]`** — The project's TypeScript target does not support iterating `Set` with spread syntax. Always use `Array.from(new Set(...))`.

**Prisma CLI is broken on Node 23** — Use manual SQL migrations. Docker uses Node 20 so builds work fine.

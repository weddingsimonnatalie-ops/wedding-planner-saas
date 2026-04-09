# API Routes & Patterns

---

## API Routes

```
GET/PUT/PATCH/DELETE /api/guests/[id]    — Guest detail (PATCH = status override only)
GET        /api/guests/export            — CSV export
POST       /api/guests/import            — CSV import
POST       /api/guests/send-rsvp-emails  — Bulk RSVP email send ({ guestIds }) → { sent, failed, skipped }
POST       /api/guests/bulk-status       — Bulk RSVP status override ({ guestIds, rsvpStatus }) → { updated }
POST       /api/guests/bulk-meal         — Bulk meal choice update ({ guestIds, mealChoice }) → { updated }
GET/POST   /api/rsvp/[token]             — Public RSVP: GET returns guest + meal options, POST submits response
GET        /api/unsubscribe/[token]      — Public unsubscribe: sets `unsubscribedAt` on guest, returns HTML confirmation page
POST       /api/email/rsvp              — Resend RSVP email (admin-triggered); rate limited: 50/hour per user; returns 400 if guest unsubscribed
GET        /api/payments                 — All payments across all suppliers with supplier info + receipt data + auto-detected OVERDUE status; optional pagination: ?skip=0&take=50
GET        /api/payments/count           — Overdue + due-this-month payment count for sidebar badge (ADMIN + VIEWER); returns `{ count: number }`
GET/POST/DELETE /api/payments/[id]/receipt — Get/upload/delete receipt for a payment (PDF/JPG/PNG, max 20 MB)
GET/POST   /api/suppliers               — Supplier list + create; optional pagination: ?skip=0&take=50
GET/PUT/DELETE /api/suppliers/[id]      — Supplier detail
GET/POST   /api/suppliers/[id]/payments — Payments
PUT/DELETE /api/suppliers/[id]/payments/[paymentId]
POST       /api/suppliers/[id]/attachments
DELETE     /api/suppliers/[id]/attachments/[attachmentId]
GET        /api/uploads/[supplierId]/[filename] — Protected file serving
GET/POST   /api/appointments            — Appointments (ADMIN + VIEWER only)
GET/PUT/DELETE /api/appointments/[id]   — (ADMIN + VIEWER only)
PATCH      /api/appointments/[id]/complete — Toggle complete (ADMIN + RSVP_MANAGER); body: `{ completed: boolean }`
GET        /api/appointments/count      — Upcoming appointments in next 7 days for sidebar badge (ADMIN + VIEWER)
GET        /api/appointments/check-reminders — Manual trigger (used by daemon)
GET/POST   /api/planning-categories     — Shared category list for suppliers, appointments and tasks; GET returns all, POST creates; cache key: `${weddingId}:planning-categories`
PUT/DELETE /api/planning-categories/[id] — Update/delete; DELETE returns 409 with count if items use it (force=true to nullify and delete)
PUT        /api/planning-categories/reorder — Reorder (ADMIN)
GET/POST   /api/meal-options            — Meal options
GET/PUT/DELETE /api/meal-options/[id]
GET        /api/dashboard/stats         — All dashboard data in one call
GET        /api/dashboard/counts        — Combined badge counts for sidebar: `{ tasks, appointments, payments }` (ADMIN + VIEWER)
GET/POST   /api/rooms                   — Room management
GET/PUT    /api/rooms/[id]
GET/POST   /api/tables
PUT/DELETE /api/tables/[id]
POST       /api/tables/[id]/assign      — Assign guest to table
DELETE     /api/tables/[id]/assign/[guestId] — Remove guest from table
GET        /api/seating/print-data      — Tables + guests + meal options for print functions
GET/PUT    /api/settings                — WeddingConfig
GET/PUT    /api/profile                 — Own profile update
GET/POST   /api/users                   — User management
PUT/DELETE /api/users/[id]
PUT        /api/users/[id]/password
GET        /api/2fa/status
POST       /api/2fa/setup
POST       /api/2fa/verify
POST       /api/2fa/disable
POST       /api/2fa/backup-codes/regenerate
POST       /api/email/payment-reminder  — Send payment reminder email; rate limited: 50/hour per user
GET/POST   /api/tasks                   — Task list (filters: completed, priority, assignedToId, categoryId, supplierId, overdue) + create (ADMIN); optional pagination: ?skip=0&take=100 (max 500)
GET        /api/tasks/count             — Lightweight task count for sidebar badge (overdue + due this week); returns `{ count: number }`; ADMIN + VIEWER only
GET/PUT/DELETE /api/tasks/[id]          — Task detail; PUT requires ADMIN
PATCH      /api/tasks/[id]/complete     — Toggle complete (ADMIN + RSVP_MANAGER); creates next recurrence for recurring tasks
GET/POST   /api/timeline                — Timeline events list (sorted by startTime) + create (ADMIN)
GET/PUT/DELETE /api/timeline/[id]       — Timeline event detail; PUT/DELETE requires ADMIN
GET/POST   /api/timeline-categories     — Timeline category list + create (ADMIN)
GET/PUT/DELETE /api/timeline-categories/[id] — Update/delete category; DELETE returns 409 if events use it (force=true to nullify and delete)
PUT        /api/timeline-categories/reorder — Reorder categories (ADMIN)
GET        /api/health                  — Health check endpoint: database connectivity, Redis connectivity (if configured), returns status JSON
POST       /api/billing/sync            — Manually sync Stripe subscription data; ADMIN only; returns { changed, before, after }
POST       /api/billing/checkout        — Create Stripe checkout session for users without subscription; ADMIN only; returns { checkoutUrl }
GET        /api/billing/portal          — Stripe billing portal redirect; ADMIN only
GET/POST   /api/guests                  — Guest list + create; optional pagination: ?skip=0&take=100 (max 500)
POST       /api/register               — Public registration endpoint; checks AppConfig.registrationsEnabled before creating account; returns 403 if disabled
```

### Internal API (admin console only)

These routes are protected by a Bearer token (`ADMIN_INTERNAL_SECRET`) and bypass the user auth middleware. They are **not** accessible to normal users.

```
POST /api/internal/cancel-subscription — Cancel a Stripe subscription by ID; called by admin console (no Stripe SDK in admin); body: { stripeSubscriptionId }; returns { ok: true }
GET  /api/internal/health              — Connectivity + secret check for admin console; rate limited 10 req/min per IP; returns { ok: true } or 401
```

---

## API Error Handling

All API routes use a consistent error handling pattern via `handleDbError()` from `@/lib/db-error`.

**`src/lib/db-error.ts`** provides centralized error handling:
- Wraps all Prisma operations in try/catch
- Logs full error details server-side (`console.error`)
- Returns safe, generic messages to clients

**Error responses:**
| Prisma Code | HTTP Status | Message |
|-------------|-------------|---------|
| P2002 (unique constraint) | 409 Conflict | "A record with that value already exists" |
| P2025 (record not found) | 404 Not Found | "Record not found" |
| Other Prisma | 500 | "Database error" |
| Unknown error | 500 | "An unexpected error occurred" |

**Pattern used in all routes:**
```typescript
import { handleDbError } from "@/lib/db-error";

export async function GET() {
  try {
    const data = await prisma.model.findMany();
    return NextResponse.json(data);
  } catch (error) {
    return handleDbError(error);
  }
}
```

**Exclusions:**
- `/api/auth/preflight` — has its own try/catch for rate limiting logic
- `/api/auth/[...nextauth]` — NextAuth internal route

---

## Security Headers and XSS Prevention

**Content Security Policy (CSP)** — `next.config.js`:
- Applied globally to all routes via `headers()` function
- Directives:
  - `default-src 'self'` — all resources from same origin by default
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — required by Next.js App Router for hydration
  - `style-src 'self' 'unsafe-inline'` — required by Tailwind CSS
  - `img-src 'self' data: blob: https:` — images from any HTTPS source
  - `font-src 'self' https://fonts.gstatic.com` — Google Fonts CDN
  - `connect-src 'self' ws: wss: https:` — API calls and WebSocket (dev mode)
  - `object-src 'none'` — no plugins
  - `base-uri 'self'` — prevents base tag injection
  - `frame-ancestors 'none'` — prevents clickjacking
- Additional headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`

**Email XSS Prevention** — `src/lib/email.ts`:
- All user-editable values interpolated into HTML emails are escaped using `he.escape()`
- URL fields validated with `safeUrl()` to prevent `javascript:` protocol injection
- `esc(value)` — escapes `&`, `<`, `>`, `"`, `'`, `` ` `` in HTML content
- `safeUrl(value)` — validates URLs, only allows `http:` and `https:` protocols, returns `#` for invalid URLs

```typescript
// Example usage in email templates
const html = `<h1>${esc(coupleName)}</h1><a href="${safeUrl(rsvpUrl)}">${esc(rsvpUrl)}</a>`;
```

**Plain text emails**: `sendAppointmentReminderEmail` and `sendPaymentReminderEmail` only send plain text (no HTML), so escaping is not required.

# Wedding Planner — Claude Code Context

This file provides full project context for Claude Code sessions. Read this before making any changes.

---

## 1. Project Overview

A **self-hosted wedding planning web app** built for Simon and Natalie's personal use. The app is deployed on a Mac mini at home behind a Cloudflare Tunnel so it is accessible from anywhere without port-forwarding.

### What it does
- Guest management with per-event invitations (ceremony, reception, afterparty) — Free Tier cap: 30 guests
- Public RSVP page per guest (no login required) with per-event responses and meal choice
- Seating planner with drag-and-drop list view and react-konva visual view
- Supplier/vendor management with status tracking, payments, and file attachments — Free Tier cap: 30 suppliers
- Budget tracking (contracted vs paid)
- Appointment scheduler with email reminders
- Task management with priorities, due dates, categories, recurring tasks, and role-based permissions
- Dashboard with live stats (RSVP breakdown, upcoming payments, appointments, seating progress, upcoming tasks)
- Multi-user authentication with role-based access control (ADMIN / VIEWER / RSVP_MANAGER) and optional TOTP 2FA
- Email via Resend SDK (RSVP invitations, payment reminders, appointment reminders)
- CSV import/export for guests
- Wedding day timeline with configurable categories
- Wedding colour theme (HSL hue picker in Settings)

### Tech stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma 6 |
| Auth | Better Auth (credentials provider, database sessions) |
| UI | Tailwind CSS + lucide-react icons |
| Drag-and-drop | @dnd-kit/core (seating list view) |
| Seating canvas | react-konva + konva (visual view) |
| 2FA | otplib (TOTP) + bcryptjs (backup code hashing) |
| Email | Resend SDK + he (HTML entity escaping) |
| Cache | Redis 7 (rate limiting for multi-instance) |
| Container | Docker Compose (three services: `app` + `db` + `redis`) |

### How to run
```bash
# First run / after code changes:
docker compose up --build

# Subsequent runs (no code changes):
docker compose up -d

# View logs:
docker compose logs -f app

# Stop:
docker compose down
```

The app runs on port **3001**. Access at `http://<host-ip>:3001` locally or via Cloudflare Tunnel publicly.

---

## 2. Key Files

```
wedding-planner-saas/
├── docker-compose.yml         — Three services: app + db (postgres:16) + redis (redis:7-alpine)
├── Dockerfile                 — Multi-stage build: deps → builder → runner
├── entrypoint.sh              — Runs migrations, seed, reminder daemon, then next start
├── .env                       — All secrets and config (never commit this)
├── prisma/
│   ├── schema.prisma          — Full data model (authoritative source)
│   ├── seed.ts                — Creates admin users from SEED_ADMIN_* env vars
│   └── migrations/            — Numbered migrations (0–25)
├── src/
│   ├── instrumentation.ts     — Next.js startup hook; validates environment variables
│   ├── middleware.ts          — Auth guard for all routes except login/rsvp/api-auth
│   ├── context/
│   │   ├── RefreshContext.tsx — RefreshProvider + useRefresh() hook; cross-component refresh token
│   │   └── WeddingContext.tsx — WeddingProvider + useWedding() hook; subscription status, event names; getGuestCapBlockReason/getSupplierCapBlockReason helpers
│   ├── hooks/
│   │   ├── usePermissions.ts   — Role-based permission checks (can.editGuests, etc.)
│   │   ├── usePullToRefresh.ts — Pull-to-refresh gesture hook for mobile list refresh
│   │   └── useFormDirtyRegistration.ts — Inactivity warning for unsaved forms
│   ├── types/
│   │   └── api.ts             — Typed API response interfaces for all endpoints
│   ├── lib/
│   │   ├── auth-better.ts    — Better Auth config (credentials provider, bcryptjs password hashing)
│   │   ├── auth-client.ts    — Better Auth React client (useSession, signIn, signOut)
│   │   ├── session.ts        — getSession(), requireAuth(), invalidateUserSessions()
│   │   ├── prisma.ts          — Singleton Prisma client
│   │   ├── email.ts           — Resend SDK: sendRsvpEmail, sendAppointmentReminderEmail, sendPaymentReminderEmail; esc() and safeUrl() for XSS prevention
│   │   ├── env.ts             — validateEnv(): startup validation of required environment variables
│   │   ├── rsvpStatus.ts      — calculateRsvpStatus() — ACCEPTED/PARTIAL/DECLINED/PENDING logic
│   │   ├── stripe-sync.ts     — syncWeddingFromStripe() — recover from missed webhooks
│   │   ├── seating-types.ts   — GuestSummary, TableWithGuests, Room, isReceptionEligible()
│   │   ├── totp.ts            — TOTP generate/verify + backup code helpers
│   │   ├── csv.ts             — Guest CSV import/export
│   │   ├── fetch.ts           — fetchApi(): GET fetches with cache: 'no-store' (use in all client components)
│   │   ├── api-response.ts    — apiJson(): no-cache response headers (use in all GET handlers)
│   │   ├── db-error.ts        — handleDbError(): centralized Prisma error handling
│   │   ├── filename.ts        — sanitizeFilename(), buildContentDisposition(): safe filename handling
│   │   ├── rate-limit.ts      — checkRateLimit(), extractIp(), getBulkLimits(): Redis-backed rate limiting
│   │   ├── cache.ts           — getCached(), invalidateCache(): in-memory TTL cache for reference data
│   │   ├── permissions.ts     — can.* permission helpers; tier.canAddGuest/canAddSupplier + getGuestCapBlockReason/getSupplierCapBlockReason
│   │   └── appointmentReminders.ts — checkAppointmentReminders() called by daemon
│   ├── scripts/
│   │   └── reminder-daemon.ts — Long-running process; calls startReminderJob()
│   ├── lib/inngest/           — Scheduled and event-triggered Inngest functions
│   ├── app/
│   │   ├── (dashboard)/       — All authenticated pages (layout wraps with sidebar nav)
│   │   │   ├── page.tsx       — Dashboard
│   │   │   ├── guests/        — Guest list + [id]
│   │   │   ├── seating/       — Seating planner + print-designer/
│   │   │   ├── suppliers/     — Supplier list + [id]
│   │   │   ├── payments/      — Cross-supplier payments page
│   │   │   ├── appointments/  — Appointment list
│   │   │   ├── timeline/      — Wedding day timeline
│   │   │   └── settings/      — Settings pages
│   │   ├── rsvp/[token]/      — Public RSVP page (no auth)
│   │   ├── login/             — Login page
│   │   └── api/               — All API routes
│   └── components/
│       ├── LayoutShell.tsx              — Main layout: sidebar nav + mobile bottom nav
│       ├── dashboard/DashboardClient.tsx  — Main dashboard; preset-driven section rendering
│       ├── dashboard/DashboardPresets.tsx  — 4 preset configs (Classic, Actions First, Budget Focus, Organized)
│       ├── dashboard/LayoutPicker.tsx    — Popover to select dashboard layout; persists via PATCH /api/profile
│       ├── dashboard/sections/           — 9 extracted dashboard section components (QuickStats, GuestSummary, BudgetOverview, etc.)
│       ├── guests/
│       │   ├── GuestList.tsx            — Guest list table + filters
│       │   ├── GuestModal.tsx           — Add guest modal
│       │   ├── GuestForm.tsx            — Edit form on /guests/[id]
│       │   ├── RsvpStatusBadge.tsx
│       │   ├── CsvImportModal.tsx
│       │   └── PrintGuestListButton.tsx
│       ├── payments/
│       │   ├── PaymentsList.tsx
│       │   ├── PaymentModal.tsx
│       │   ├── ReceiptUploadModal.tsx
│       │   └── ReceiptViewModal.tsx
│       ├── rsvp/RsvpForm.tsx
│       ├── suppliers/
│       │   ├── SupplierList.tsx
│       │   ├── SupplierModal.tsx
│       │   └── SupplierDetail.tsx
│       ├── seating/
│       │   ├── SeatingClient.tsx        — State manager + assign/remove/delete logic
│       │   ├── SeatingListView.tsx
│       │   ├── SeatingVisualView.tsx    — react-konva canvas (dynamically imported, ssr:false)
│       │   ├── PrintDesigner.tsx
│       │   └── PrintTableBlock.tsx
│       ├── timeline/
│       │   ├── TimelineList.tsx
│       │   ├── TimelineEventModal.tsx
│       │   └── TimelinePrintView.tsx
│       ├── billing/
│       │   ├── ActivateTrialButton.tsx
│       │   └── SyncFromStripeButton.tsx
│       └── ui/
│           ├── BottomNav.tsx            — Mobile bottom navigation bar
│           ├── SwipeableRow.tsx         — Swipe-to-reveal action buttons
│           ├── ReadOnlyBanner.tsx       — Blue info banner for read-only sections
│           ├── UpgradePrompt.tsx        — Gate wrapper for subscription-required features
│           └── ConfirmModal.tsx
```

---

## 3. Admin Console

A separate Next.js 16 operator console for managing SaaS accounts. It is a **different repository and app** — never modify this SaaS app as part of admin console work.

| | Path |
|--|------|
| **Admin console app** | `/Users/simonblythe/wedding-root/wedding-planner-admin/` |
| **Admin console plan** | `/Users/simonblythe/wedding-root/ADMIN-CONSOLE-PLAN.md` |
| **Admin console repo** | `github.com/weddingsimonnatalie-ops/wedding-planner-admin` (private) |

### Shared infrastructure
The admin console shares this app's PostgreSQL database and S3 bucket, but connects with a different DB role (`admin_console_user`) that has `BYPASSRLS` privilege.

### Migration ownership
**All migrations run from this repo only.** The admin console copies `prisma/schema.prisma` after migrations are applied here — it never runs `prisma migrate` itself. When adding a new model or field that the admin console needs, create the migration here first, then copy the updated schema across.

---

## 4. Reference Docs

@import docs/claude/architecture.md
@import docs/claude/data-model.md
@import docs/claude/api-routes.md

<!-- Load when working on a specific feature's UI or behaviour: -->
@import docs/claude/features.md

<!-- Load when debugging config or adding environment variables: -->
<!-- @import docs/claude/environment.md -->
@import docs/claude/environment.md

<!-- Load when doing ops/infra/deployment work: -->
@import docs/claude/deployment.md

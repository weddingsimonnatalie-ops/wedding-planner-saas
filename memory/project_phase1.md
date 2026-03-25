---
name: wedding-planner-phase1-2
description: Phase 1 & 2 scaffold status and key implementation decisions
type: project
---

Phase 1 is complete and running. `docker compose up` works end-to-end.

**Why:** Self-hosted wedding planning app for Simon & Natalie's wedding.

**How to apply:** Start from Phase 2 (guest management) next.

Key decisions made:
- Next.js 14 App Router, Prisma 5, next-auth v4, nodemailer v7 (v7 required by next-auth 4.24+)
- Dockerfile: multi-stage with `node:20-alpine`; all stages need `apk add --no-cache openssl` for Prisma engine
- Prisma binaryTargets includes `linux-musl-openssl-3.0.x` for Alpine compatibility
- Not using Next.js standalone output mode — full node_modules copied to runner for simplicity
- Seed command uses `node node_modules/.bin/tsx prisma/seed.ts` (tsx not on PATH in Alpine)
- All DB-querying pages have `export const dynamic = "force-dynamic"` to prevent static rendering at build time
- Login page uses Suspense wrapper around the component that calls `useSearchParams()`
- Initial migration at `prisma/migrations/20240101000000_init/migration.sql` (hand-written SQL to match schema)
- `.env` already has real credentials (Simon's Gmail app password, secure DB password, NEXTAUTH_SECRET)
- SEED_ADMIN_2 is commented out in .env — only Simon is seeded

Phase 2 is also complete. Phase 3 (Seating Planner) is next.

Phase 2 additions:
- Full Guest CRUD: /guests, /guests/new, /guests/[id]
- API routes: GET/POST /api/guests, GET/PUT/DELETE /api/guests/[id], /api/guests/export, /api/guests/import
- Public RSVP: /rsvp/[token] page (no auth) + /api/rsvp/[token] GET/POST
- Email: /api/email/rsvp (POST) using nodemailer, falls back to console log if SMTP not configured
- Meal Options CRUD: /api/meal-options + /api/meal-options/[id]
- User Management: /api/users + /api/users/[id] + /api/users/[id]/password, full UsersManager component
- CSV import: /api/guests/import with two-step preview+confirm
- CSV export: /api/guests/export
- Components: GuestList.tsx, GuestForm.tsx, RsvpStatusBadge.tsx, CsvImportModal.tsx, MealOptionsList.tsx, UsersManager.tsx, RsvpForm.tsx
- src/lib/email.ts (nodemailer helper), src/lib/csv.ts (parser + exporter)

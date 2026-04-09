# Production Deployment

---

## Cloudflare Tunnel

The app is exposed publicly via a Cloudflare Tunnel running on the Mac mini. This means:
- No open ports on the router
- HTTPS is handled by Cloudflare — the app itself runs over HTTP inside Docker
- `NEXTAUTH_URL` **must be set to the public Cloudflare domain** (e.g. `https://wedding.yourdomain.com`), not the local IP, otherwise:
  - Auth redirects after login fail
  - RSVP email links point to the internal IP

## Moving to a new server

1. Copy the entire project directory including `data/` folder
2. `data/postgres/` contains the full database
3. `data/minio/` contains all supplier file attachments (local dev only — in production these live in Railway Buckets)
4. Copy `.env` with the same secrets
5. Run `docker compose up --build` on the new server

## Static IP

Assign a static local IP to the Mac mini (via router DHCP reservation) so that `NEXTAUTH_URL` with a local IP doesn't change. Currently `192.168.6.249`.

## Rebuilding vs restarting

- **Code change** → `docker compose up --build` (rebuilds the image)
- **`.env` change only** → `docker compose up -d` (restarts with new env, no rebuild needed)
- **Database migration** → migrations run automatically on every container start via `entrypoint.sh`

## Dockerfile structure

The Dockerfile uses a multi-stage build:

1. **deps** — Install `node_modules`
2. **builder** — Copy source, generate Prisma client, run `next build`
3. **runner** — Production image with only what's needed at runtime

The runner stage copies:
- `node_modules/` — Dependencies (including `prisma` CLI and `tsx`)
- `.next/` — Built Next.js app
- `public/` — Static assets
- `prisma/` — Schema and migrations
- `package.json` — Package metadata
- `tsconfig.json` — TypeScript config (needed by `tsx` for path aliases)
- `src/` — Source files (needed by `tsx` for reminder daemon script)
- `entrypoint.sh` — Startup script

**Important:** If adding new scripts that run via `tsx` at runtime, ensure both `src/` and `tsconfig.json` are copied to the runner stage. The `@/` path alias requires `tsconfig.json` to resolve correctly.

## Background jobs

Background jobs are handled by either:
- **Inngest** (when `INNGEST_EVENT_KEY` is set) — Cloud-based job processing
- **Reminder daemon** (when `INNGEST_EVENT_KEY` is not set) — Local subprocess for appointment/payment reminders

The daemon runs as a child process in single-replica deployments without Inngest.

## Better Auth — password and user management

The app uses Better Auth (migrated from next-auth v4 for Next.js 16/React 19 compatibility).

Key facts:
- Passwords are stored in the `Account` table only (`User` table has no password field)
- When changing a password, update `Account.password` only (where `providerId = 'credential'`)
- New user creation: `User` record + `accounts: { create: { providerId: "credential", accountId: email, password: hashed } }`
- bcrypt cost: 10 (consistent with Better Auth defaults)
- Session storage: database sessions (`Session` table), not JWT-only

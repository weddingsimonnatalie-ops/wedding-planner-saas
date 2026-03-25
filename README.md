# 💍 Wedding Planner

A self-hosted wedding planning web application built with Next.js 14, PostgreSQL, and Docker. Built for personal use to manage every aspect of wedding planning in one place.

---

## Features

- **Guest Management** — full guest list, RSVP tracking, meal choices, dietary requirements, CSV import/export
- **Seating Planner** — drag-and-drop table assignment with a visual SVG floor plan and list view
- **Supplier Management** — contracts, deposit and instalment tracking, payment due dates, file attachments
- **Dashboard** — wedding countdown, guest summary, upcoming payments, budget overview

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 14 (App Router) |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Auth | NextAuth.js |
| UI | shadcn/ui + Tailwind CSS |
| Drag & Drop | dnd-kit |
| Container | Docker Compose |

---

## Running Locally

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/yourname/wedding-planner.git
cd wedding-planner
```

**2. Create your `.env` file**
```bash
cp .env.example .env
```

Open `.env` and fill in your values — at minimum you need:
- `DB_PASSWORD` — any strong random string
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` for local dev
- `SEED_ADMIN_1_NAME`, `SEED_ADMIN_1_EMAIL`, `SEED_ADMIN_1_PASSWORD` — your login credentials

**3. Start the app**
```bash
docker compose up
```

On first run Docker will automatically:
- Build the Next.js image
- Create the PostgreSQL database
- Run all Prisma migrations to create tables
- Run the seed script to create your admin user(s)

> ⚠️ Do not manually create the `./data/` folder — let Docker create it on first run.

**4. Open the app**

Visit [http://localhost:3000](http://localhost:3000) and log in with your `SEED_ADMIN_1` credentials.

---

## Verifying a Fresh Install

After first run, confirm everything is working:

```bash
# Check both containers are running and healthy
docker compose ps

# Check all database tables were created
docker compose exec db psql -U wedding -c "\dt"

# Check your admin user was created
docker compose exec db psql -U wedding -c "SELECT email FROM \"User\";"
```

If the seed failed for any reason, re-run it manually:
```bash
docker compose exec app npx prisma db seed
```

---

## Data Storage

All persistent data lives inside the project folder under `./data/` — created automatically on first run.

```
wedding-planner/
├── data/
│   ├── postgres/    ← all database files
│   └── uploads/     ← uploaded contracts, invoices, attachments
```

> ⚠️ The `./data/` folder is gitignored — it will never be committed to GitHub. Back it up separately.

### Backing up your data

```bash
# Option 1 — full backup (stop containers first for a clean copy)
docker compose stop
tar -czf wedding-backup-$(date +%Y%m%d).tar.gz data/
docker compose start

# Option 2 — database only (live, no downtime)
docker compose exec db pg_dump -U wedding wedding > backup-$(date +%Y%m%d).sql

# Restore from SQL backup
docker compose exec -T db psql -U wedding wedding < backup-20240101.sql
```

---

## Moving to Production

**1. Copy the project folder to your server**

Include the `./data/` folder to carry your existing data across:
```bash
# On your local machine
tar -czf wedding-planner.tar.gz wedding-planner/
scp wedding-planner.tar.gz user@yourserver:~/

# On the server
tar -xzf wedding-planner.tar.gz
cd wedding-planner
```

**2. Update your `.env` for production**

```bash
# Minimum changes for production
NEXTAUTH_URL=https://yourdomain.com    # your public domain
```

**3. Start the app**
```bash
docker compose --profile prod up -d
```

### Cloudflare Tunnel

If using a Cloudflare Tunnel to expose the app:
- Set `NEXTAUTH_URL` to your public domain (e.g. `https://planner.yourdomain.com`)
- The tunnel connects internally to `http://app:3000`
- The app container does not need to know about the tunnel — only the public URL matters

---

## Adding Admin Users

Admin users are created in two ways:

**On first run** — via `SEED_ADMIN_*` environment variables in `.env`:
```
SEED_ADMIN_1_NAME=Your Name
SEED_ADMIN_1_EMAIL=you@example.com
SEED_ADMIN_1_PASSWORD=strongpassword

# Second admin is optional — remove these lines if not needed
SEED_ADMIN_2_NAME=Partner Name
SEED_ADMIN_2_EMAIL=partner@example.com
SEED_ADMIN_2_PASSWORD=strongpassword
```

**After first run** — via the app UI at `/settings/users`. Add, remove and change passwords without touching the `.env`.

---

## Useful Commands

```bash
# Start in background
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs app --tail=50
docker compose logs db --tail=50

# Restart after .env change
docker compose down && docker compose up -d

# Open a database shell
docker compose exec db psql -U wedding

# Re-run seed script manually
docker compose exec app npx prisma db seed

# Run a database migration after schema changes
docker compose exec app npx prisma migrate deploy
```

---

## Environment Variables

See `.env.example` for a full list with descriptions and examples for common SMTP providers (Gmail, Outlook, Mailgun).

---

## Spec

The full build specification is in [`WEDDING_PLANNER_SPEC.md`](./WEDDING_PLANNER_SPEC.md).

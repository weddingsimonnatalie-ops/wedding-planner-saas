# Wedding Planner App — Build Specification

> Hand this document to Claude Code as the project brief.
> Work through phases in order. Each phase should be a working, deployable state before proceeding.

---

## Overview

A self-hosted wedding planning web application running in Docker. Covers three core domains:

1. **Guest Management** — guest list, RSVPs, meal choices, dietary requirements
2. **Seating & Table Planner** — drag-and-drop visual floor plan + list assignment view
3. **Supplier Management** — contracts, deposit/instalment tracking, payment due dates, file attachments

Single couple use. Password-protected admin interface. No public-facing guest portal required (though guests can be emailed a unique RSVP link).

---

## Recommended Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend + API | **Next.js 14** (App Router) | Full-stack in one repo, great DX, easy to containerise |
| Database | **PostgreSQL 16** | Robust relational DB, ideal for this data model |
| ORM | **Prisma** | Type-safe, readable schema, easy migrations |
| Auth | **NextAuth.js** | Simple credentials provider for single-user admin |
| UI | **shadcn/ui + Tailwind CSS** | High-quality components, easy to customise |
| Drag & Drop | **dnd-kit** | Modern, accessible, works well with React |
| File Storage | **Local filesystem** (volume-mounted) | No S3 needed; Docker volume for contract uploads |
| Email | **Nodemailer** + SMTP env vars | For RSVP links and payment reminders |
| Container | **Docker Compose** | PostgreSQL + Next.js app as two services |

---

## Docker Compose Setup

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    user: "999:999"   # Postgres in Docker runs as UID 999 — prevents permission issues on Linux hosts
                      # IMPORTANT: do NOT manually pre-create ./data/postgres — let Docker create it on first run
    environment:
      POSTGRES_DB: wedding
      POSTGRES_USER: wedding
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data   # bind mount — stored inside project folder

  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql://wedding:${DB_PASSWORD}@db:5432/wedding
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: ${SMTP_FROM}
    volumes:
      - ./data/uploads:/app/uploads                # bind mount — stored inside project folder
```

### .gitignore
```
# Environment — contains secrets
.env

# Persistent data — database files and uploads
# Copy the ./data/ folder manually when moving to production
data/

# Next.js
.next/
node_modules/
```

---
```
DB_PASSWORD=changeme
NEXTAUTH_SECRET=generate-a-random-string-here
NEXTAUTH_URL=http://localhost:3000
# Seed credentials — used only on first run to create initial admin accounts
# Edit these before first launch, then they can be removed
SEED_ADMIN_1_EMAIL=you@example.com
SEED_ADMIN_1_NAME=Your Name
SEED_ADMIN_1_PASSWORD=changeme
SEED_ADMIN_2_EMAIL=partner@example.com
SEED_ADMIN_2_NAME=Partner Name
SEED_ADMIN_2_PASSWORD=changeme
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=wedding@example.com
```

---

## Database Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// --- USERS ---

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String   // bcrypt hashed — never store plaintext
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// --- WEDDING DETAILS ---

model WeddingConfig {
  id           Int      @id @default(1)
  coupleName   String   @default("Our Wedding")
  weddingDate  DateTime?
  venueName    String?
  venueAddress String?
  updatedAt    DateTime @updatedAt
}

// --- GUESTS ---

model Guest {
  id             String        @id @default(cuid())
  firstName      String
  lastName       String
  email          String?
  phone          String?
  groupName      String?       // e.g. "Bride's Family", "Work Friends"
  isChild        Boolean       @default(false)

  // RSVP
  rsvpToken      String        @unique @default(cuid())
  rsvpStatus     RsvpStatus    @default(PENDING)
  rsvpRespondedAt DateTime?

  // Events - which parts of the day they're invited to
  invitedToCeremony   Boolean  @default(true)
  invitedToReception  Boolean  @default(true)
  invitedToAfterparty Boolean  @default(false)
  attendingCeremony   Boolean?
  attendingReception  Boolean?
  attendingAfterparty Boolean?

  // Meal
  mealChoice     String?       // references MealOption.id
  dietaryNotes   String?       // free text for allergies/requirements

  // Seating
  tableId        String?
  table          Table?        @relation(fields: [tableId], references: [id])
  seatNumber     Int?

  // Metadata
  notes          String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}

enum RsvpStatus {
  PENDING
  ACCEPTED
  DECLINED
  MAYBE
}

model MealOption {
  id          String   @id @default(cuid())
  name        String   // e.g. "Chicken", "Vegetarian", "Kids Menu"
  description String?
  course      String?  // e.g. "Main", "Starter"
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
}

// --- SEATING ---

model Room {
  id          String   @id @default(cuid())
  name        String   @default("Main Reception")
  widthMetres Float    @default(20)
  heightMetres Float   @default(15)
  tables      Table[]
  elements    RoomElement[]  // decorative elements: stage, dancefloor, etc.
  createdAt   DateTime @default(now())
}

model Table {
  id          String      @id @default(cuid())
  roomId      String
  room        Room        @relation(fields: [roomId], references: [id])
  name        String      // e.g. "Table 1", "Top Table", "Kids Table"
  shape       TableShape  @default(ROUND)
  capacity    Int         @default(8)
  positionX   Float       @default(0)   // percentage of room width
  positionY   Float       @default(0)   // percentage of room height
  rotation    Float       @default(0)   // degrees
  guests      Guest[]
  notes       String?
  createdAt   DateTime    @default(now())
}

enum TableShape {
  ROUND
  RECTANGULAR
  OVAL
}

model RoomElement {
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id])
  type        String   // "stage", "dancefloor", "bar", "entrance", "dj_booth", "custom"
  label       String?
  positionX   Float
  positionY   Float
  width       Float    @default(10)  // percentage of room width
  height      Float    @default(10)
  rotation    Float    @default(0)
  color       String   @default("#e2e8f0")
}

// --- SUPPLIERS ---

model Supplier {
  id              String    @id @default(cuid())
  category        String    // e.g. "Catering", "Photography", "Florist", "Venue", "DJ", "Cake"
  name            String
  contactName     String?
  email           String?
  phone           String?
  website         String?
  notes           String?

  // Contract
  contractValue   Float?
  contractSigned  Boolean   @default(false)
  contractSignedAt DateTime?

  // Status
  status          SupplierStatus @default(ENQUIRY)
  bookedAt        DateTime?

  payments        Payment[]
  attachments     Attachment[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum SupplierStatus {
  ENQUIRY       // researching / making contact
  QUOTED        // have received a quote
  BOOKED        // confirmed and booked
  CANCELLED     // cancelled
  COMPLETE      // wedding done, fully paid
}

model Payment {
  id            String        @id @default(cuid())
  supplierId    String
  supplier      Supplier      @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  label         String        // e.g. "Deposit", "Final Balance", "Instalment 2"
  amount        Float
  dueDate       DateTime?
  paidDate      DateTime?
  status        PaymentStatus @default(PENDING)
  notes         String?
  createdAt     DateTime      @default(now())
}

enum PaymentStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
}

model Attachment {
  id          String   @id @default(cuid())
  supplierId  String
  supplier    Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  filename    String   // original filename shown to user
  storedAs    String   // uuid filename on disk
  mimeType    String
  sizeBytes   Int
  uploadedAt  DateTime @default(now())
}
```

---

## Feature Specification by Phase

### Phase 1 — Foundation & Auth

**Goal:** Docker Compose running, database migrated, login working.

- [ ] `docker-compose.yml` with PostgreSQL + Next.js services
- [ ] Prisma schema applied via `prisma migrate deploy` on container start
- [ ] **Seed script** (`prisma/seed.ts`) — runs automatically after migration on first launch. Reads `SEED_ADMIN_*` env vars and creates initial `User` records with bcrypt-hashed passwords. The script must follow these rules:
  - Iterate over `SEED_ADMIN_1_*`, `SEED_ADMIN_2_*`, `SEED_ADMIN_3_*` etc. up to a reasonable limit (e.g. 10)
  - For each numbered block, only attempt to create the user if **all three vars** (`_NAME`, `_EMAIL`, `_PASSWORD`) are present and non-empty — skip silently if any are missing or the block is incomplete
  - Skip any user whose email already exists in the database (idempotent — safe to re-run on container restart)
  - **Throw a hard error and refuse to start** if the seed completes and the `User` table is still empty — prevents a running app with no way to log in
  - Log each action: `Created user alex@example.com`, `Skipped SEED_ADMIN_2 (incomplete or missing)`, `User jordan@example.com already exists — skipping`
- [ ] NextAuth.js credentials provider — looks up user by email in the `User` table, verifies password with `bcrypt.compare`. Returns user object on success, `null` on failure.
- [ ] Login page at `/login`
- [ ] Middleware protecting all routes except `/login` and `/rsvp/[token]`
- [ ] Basic shell layout: sidebar nav, header showing logged-in user's name + logout
- [ ] Dashboard home page (empty state is fine at this stage)
- [ ] Wedding config page: set couple name, date, venue

**Nav structure:**
```
/                     → Dashboard
/guests               → Guest list
/guests/new           → Add guest
/guests/[id]          → Edit guest
/seating              → Seating planner (visual + list tabs)
/suppliers            → Supplier list
/suppliers/new        → Add supplier
/suppliers/[id]       → Supplier detail / payments
/settings             → Wedding config, meal options
/settings/users       → User management (add/remove admins, change passwords)
/rsvp/[token]         → Public RSVP page (no auth required)
```

---

### Phase 2 — Guest Management

**Goal:** Full guest CRUD with RSVP tracking.

#### Guest List (`/guests`)
- Table view of all guests with columns: Name, Group, Events Invited To, RSVP Status, Meal Choice, Table Assigned
- Filter by: RSVP status, group, table assigned / unassigned, event
- Sort by any column
- Search by name
- Summary stats bar: Total guests | Accepted | Declined | Pending | Unassigned to table
- Bulk actions: Delete selected, Export CSV, Send RSVP reminders (email)
- Import guests from CSV button

#### Add / Edit Guest form
Fields:
- First name, Last name (required)
- Email, Phone
- Group name (free text with autocomplete from existing groups)
- Is child toggle
- Invited to: Ceremony / Reception / Afterparty (checkboxes)
- Notes (internal, not shown to guest)

#### RSVP Management
- Each guest gets a unique `/rsvp/[token]` URL
- "Copy RSVP link" button on each guest row
- "Send RSVP email" button (sends email with link via SMTP)
- RSVP page shows: guest name, which events they're invited to, RSVP yes/no per event, meal choice dropdown (only shown if invited to reception), dietary notes text field
- On submit: updates guest record, shows confirmation message
- Admin can manually override RSVP status

#### User Management (`/settings/users`)
- List of admin users: name, email, date created
- Add new user form: name, email, password (min 8 chars)
- Change password form per user (requires entering current password if changing own)
- Delete user button (disabled/hidden for own account)
- Passwords always stored bcrypt-hashed (cost factor 12), never plaintext
- At least one user must always exist (enforce in API)
- CRUD for meal options (name, description, course, active/inactive)
- Meal counts summary: how many of each choice confirmed

#### CSV Import
- Download template CSV
- Upload CSV to bulk-create guests
- Preview import before confirming (show rows, flag errors)
- Duplicate detection by name

---

### Phase 3 — Seating Planner

**Goal:** Assign all guests to tables, with both visual and list views.

#### List View (default tab)
- Left panel: Unassigned guests (grouped, searchable, filterable by event/group)
- Right panel: Tables listed vertically, each showing assigned guests and remaining capacity
- Click a guest → assign to table (dropdown or click-to-assign)
- Drag guest from unassigned list to a table row
- Remove guest from table (returns to unassigned)
- Capacity warning when table is full (highlight in red)
- Meal summary per table (e.g. "3× Chicken, 2× Veg, 1× Kids")

#### Visual View (second tab)
- Canvas showing the room floor plan
- Tables rendered as shapes (round/rectangular) at their saved positions
- Tables show: table name, X/Y guests assigned / capacity, colour-coded by fullness
- Drag tables to reposition them on the canvas
- Click a table → side panel shows guest list for that table, with remove buttons
- Room elements (stage, dancefloor, bar, entrance) can be added and repositioned
- "Add Table" button: choose shape, capacity, name → places it on canvas
- Zoom in/out controls
- Print/export floor plan as PDF

#### Room Setup
- Room dimensions (width × height in metres)
- These drive the canvas scale

#### Seat numbering
- Optional: enable seat numbers per table
- If enabled, guests can be assigned a specific seat number within the table

---

### Phase 4 — Supplier Management

**Goal:** Full supplier and payment tracking with file attachments.

#### Supplier List (`/suppliers`)
- Cards or table view grouped by category
- Each supplier card shows: name, status badge, contract value, total paid / total remaining
- Filter by category, status
- Summary totals: Total contracted | Total paid | Total remaining | Overdue payments

#### Supplier Detail (`/suppliers/[id]`)
Layout: two-column — supplier info left, payments + attachments right.

**Supplier info section:**
- Category (select from predefined list + "Other")
- Name, Contact name, Email, Phone, Website
- Status (Enquiry → Quoted → Booked → Complete)
- Contract value (£)
- Contract signed toggle + date
- Notes (rich text / textarea)
- Edit inline

**Payments section:**
- List of payment milestones: Label | Amount | Due Date | Status | Paid Date | Actions
- Add payment button: label (e.g. "Deposit", "Final Balance"), amount, due date
- Mark as paid: sets paid date to today, status → PAID
- Overdue detection: if due date has passed and status is PENDING → show as OVERDUE with red badge
- Payment progress bar: (total paid / contract value)
- Remaining balance auto-calculated

**Payment due date reminders:**
- Dashboard widget showing all upcoming payments in next 30 days
- "Send reminder email to self" button per payment (emails admin with supplier name, amount, due date)
- Optional: automated daily check could be noted as future enhancement

**Attachments section:**
- Upload files (PDF, DOC, DOCX, JPG, PNG — max 20MB each)
- Files stored to `/app/uploads/[supplierId]/[uuid].[ext]` (volume-mounted, outside Next.js public/ directory)
- List shows: filename, size, upload date, download link, delete button
- Typical use: contracts, invoices, quotes, mood board images

---

### Phase 5 — Dashboard & Polish

**Goal:** Useful at-a-glance overview and final refinements.

#### Dashboard (`/`)
Widgets:
- **Wedding countdown** — days until the wedding date
- **Guest summary** — doughnut chart: Accepted / Declined / Pending / total
- **Seating progress** — X of Y guests assigned to tables
- **Meal choices** — bar chart of confirmed meal selections
- **Upcoming payments** — list of payments due in next 60 days, sorted by date, with overdue highlighted
- **Supplier status** — how many suppliers per status (Booked / Quoted / Enquiry)
- **Budget overview** — total contracted vs total paid vs total remaining

#### Polish items
- Responsive layout (usable on tablet)
- Toast notifications for save/delete actions
- Confirmation dialogs for destructive actions (delete guest, delete supplier, delete user)
- Cannot delete your own user account (enforced in API + UI)
- Empty states with helpful CTAs on all list pages
- Loading skeletons on data-heavy pages
- Error boundary handling

---

## Key UI/UX Notes

### Colour coding conventions
- RSVP: green = Accepted, red = Declined, amber = Pending, grey = Maybe
- Table capacity: green = space available, amber = nearly full (≥75%), red = full
- Payment status: green = Paid, red = Overdue, amber = Due soon (within 7 days), grey = Pending
- Supplier status: blue = Booked, purple = Quoted, grey = Enquiry, red = Cancelled, green = Complete

### Seating planner canvas notes
- Use `dnd-kit` for drag-and-drop in list view
- Use HTML5 canvas or SVG for visual floor plan — SVG is recommended for easier event handling
- Tables should snap to a grid on the canvas (optional toggle)
- Canvas should be exportable: use `html2canvas` or render SVG to PNG for print/PDF

### File uploads
- Use Next.js API route `/api/uploads` with `formidable` or `multer`
- Store files at `/app/uploads/[supplierId]/[uuid].[ext]` — this path is volume-mounted in Docker so files persist across container rebuilds
- **Never store uploads inside `public/`** — that directory is baked into the image at build time and is not suitable for runtime file persistence
- Serve files via the protected API route `/api/uploads/[supplierId]/[filename]` so unauthenticated users cannot access contracts directly by URL

---

## API Routes Reference

All routes under `/api/` are protected by NextAuth session middleware.

```
GET    /api/guests              list guests (with filters)
POST   /api/guests              create guest
GET    /api/guests/[id]         get guest
PUT    /api/guests/[id]         update guest
DELETE /api/guests/[id]         delete guest
POST   /api/guests/import       CSV import
GET    /api/guests/export       CSV export

GET    /api/rsvp/[token]        get guest for RSVP page (PUBLIC - no auth)
POST   /api/rsvp/[token]        submit RSVP (PUBLIC - no auth)

GET    /api/tables              list tables with guests
POST   /api/tables              create table
PUT    /api/tables/[id]         update table (position, name, capacity)
DELETE /api/tables/[id]         delete table
POST   /api/tables/[id]/assign  assign guest to table { guestId }
DELETE /api/tables/[id]/assign/[guestId]  remove guest from table

GET    /api/rooms               list rooms
PUT    /api/rooms/[id]          update room dimensions / elements

GET    /api/suppliers           list suppliers
POST   /api/suppliers           create supplier
GET    /api/suppliers/[id]      get supplier with payments + attachments
PUT    /api/suppliers/[id]      update supplier
DELETE /api/suppliers/[id]      delete supplier

POST   /api/suppliers/[id]/payments         create payment
PUT    /api/suppliers/[id]/payments/[pid]   update payment
DELETE /api/suppliers/[id]/payments/[pid]   delete payment
POST   /api/suppliers/[id]/payments/[pid]/paid  mark as paid

POST   /api/suppliers/[id]/attachments      upload file
DELETE /api/suppliers/[id]/attachments/[aid] delete file
GET    /api/uploads/[supplierId]/[filename] serve protected file

GET    /api/meal-options        list meal options
POST   /api/meal-options        create
PUT    /api/meal-options/[id]   update
DELETE /api/meal-options/[id]   delete

GET    /api/dashboard/stats     aggregate stats for dashboard widgets

GET    /api/settings            get wedding config
PUT    /api/settings            update wedding config

GET    /api/users               list admin users
POST   /api/users               create new admin user (name, email, password)
PUT    /api/users/[id]          update user (name, email)
PUT    /api/users/[id]/password change password (requires current password)
DELETE /api/users/[id]          delete user (cannot delete own account)

POST   /api/email/rsvp          send RSVP link email to guest
POST   /api/email/payment-reminder  send payment reminder to admin
```

---

## Project File Structure

```
wedding-planner/
├── docker-compose.yml
├── Dockerfile
├── .env                   ← copy from .env.example and fill in — never commit this
├── .env.example
├── .gitignore
├── data/                  ← created automatically on first `docker compose up`
│   │                         THIS FOLDER CONTAINS ALL PERSISTENT DATA
│   │                         Copy this folder when moving to production
│   │                         It is gitignored — never commit it
│   ├── postgres/           ← all database files (owned by Docker/UID 999)
│   └── uploads/            ← all uploaded contracts, invoices, attachments
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          ← sidebar + header shell
│   │   │   ├── page.tsx            ← dashboard
│   │   │   ├── guests/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── seating/page.tsx
│   │   │   ├── suppliers/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx        ← wedding config + meal options
│   │   │       └── users/page.tsx  ← user management
│   │   ├── rsvp/
│   │   │   └── [token]/page.tsx    ← public, no auth
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── guests/
│   │       ├── tables/
│   │       ├── rooms/
│   │       ├── suppliers/
│   │       ├── meal-options/
│   │       ├── dashboard/
│   │       ├── settings/
│   │       ├── email/
│   │       └── uploads/
│   ├── components/
│   │   ├── ui/                     ← shadcn components
│   │   ├── guests/
│   │   │   ├── GuestTable.tsx
│   │   │   ├── GuestForm.tsx
│   │   │   ├── RsvpStatusBadge.tsx
│   │   │   └── MealChoiceSummary.tsx
│   │   ├── seating/
│   │   │   ├── SeatingListView.tsx
│   │   │   ├── SeatingVisualView.tsx
│   │   │   ├── TableCard.tsx
│   │   │   └── FloorPlanCanvas.tsx
│   │   ├── suppliers/
│   │   │   ├── SupplierCard.tsx
│   │   │   ├── SupplierForm.tsx
│   │   │   ├── PaymentList.tsx
│   │   │   ├── PaymentForm.tsx
│   │   │   └── AttachmentList.tsx
│   │   └── dashboard/
│   │       ├── GuestSummaryWidget.tsx
│   │       ├── UpcomingPaymentsWidget.tsx
│   │       └── BudgetOverviewWidget.tsx
│   ├── lib/
│   │   ├── prisma.ts               ← prisma client singleton
│   │   ├── auth.ts                 ← nextauth config (credentials provider → DB lookup + bcrypt)
│   │   ├── email.ts                ← nodemailer helpers
│   │   └── utils.ts
│   ├── middleware.ts               ← route protection
│   └── prisma/
│       ├── schema.prisma
│       └── seed.ts                 ← creates initial users from SEED_ADMIN_* env vars
```

---

## Build Order Instructions for Claude Code

Work through phases strictly in order. Do not proceed to the next phase until the current one is deployable and tested.

**Phase 1:** Scaffold the project. Set up Docker Compose, Prisma schema, NextAuth, middleware, shell layout, and wedding config page. Run `docker compose up` — app should be accessible and login should work.

**Phase 2:** Build guest management. Complete all CRUD, RSVP token system, public RSVP page, email sending, and CSV import/export. All guest operations should work end-to-end.

**Phase 3:** Build seating planner. Start with the list view (simpler), then add the visual SVG floor plan. Drag-and-drop guest assignment should work in both views.

**Phase 4:** Build supplier management. Complete supplier CRUD, payment milestones, mark-as-paid, file upload/download, and the dashboard payment widget.

**Phase 5:** Build the dashboard with all widgets. Then polish: responsive layout, toasts, empty states, loading states, error handling.

---

## Notes on Running with OpenWebUI / Docker MCP

### Project folder layout
All persistent data lives inside the project folder under `./data/` — this is created automatically on first `docker compose up`. Do not create it manually.

```
wedding-planner/
├── docker-compose.yml    ← version control this
├── .env                  ← do NOT version control (contains secrets)
├── src/                  ← version control this
├── prisma/               ← version control this
└── data/                 ← do NOT version control (contains your data)
    ├── postgres/
    └── uploads/
```

### Moving to production
To move from local dev to a production server:
1. Copy the entire `wedding-planner/` folder to the server (including `data/`)
2. Update `.env` — at minimum change `NEXTAUTH_URL` to your production URL
3. Run `docker compose up -d`
4. All data — database, uploaded files — will be exactly as it was locally

### Backups
Because all data is in `./data/`, backing up is simple:
```bash
# Stop containers first for a clean backup
docker compose stop
tar -czf wedding-backup-$(date +%Y%m%d).tar.gz data/
docker compose start
```

Or for a live database dump without stopping:
```bash
docker compose exec db pg_dump -U wedding wedding > backup-$(date +%Y%m%d).sql
```

### Other notes
- The app runs on port 3000 by default — change `ports` in `docker-compose.yml` if needed
- For HTTPS/reverse proxy: put Nginx or Caddy in front and update `NEXTAUTH_URL` accordingly
- SMTP: any SMTP provider works (Gmail app password, Mailgun, Postmark, your own server)

---

*Spec version 1.0 — Generated for Claude Code*

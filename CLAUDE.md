# Wedding Planner — Claude Code Context

This file provides full project context for Claude Code sessions. Read this before making any changes.

---

## 1. Project Overview

A **self-hosted wedding planning web app** built for Simon and Natalie's personal use. The app is deployed on a Mac mini at home behind a Cloudflare Tunnel so it is accessible from anywhere without port-forwarding.

### What it does
- Guest management with per-event invitations (ceremony, reception, afterparty)
- Public RSVP page per guest (no login required) with per-event responses and meal choice
- Seating planner with drag-and-drop list view and react-konva visual view
- Supplier/vendor management with status tracking, payments, and file attachments
- Budget tracking (contracted vs paid)
- Appointment scheduler with email reminders
- Task management with priorities, due dates, categories, recurring tasks, and role-based permissions
- Dashboard with live stats (RSVP breakdown, upcoming payments, appointments, seating progress, upcoming tasks)
- Multi-user authentication with role-based access control (ADMIN / VIEWER / RSVP_MANAGER) and optional TOTP 2FA
- Email via SMTP (RSVP invitations, payment reminders, appointment reminders)
- CSV import/export for guests

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
| Email | nodemailer (SMTP) + he (HTML entity escaping) |
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

The app runs on port **3000**. Access at `http://<host-ip>:3000` locally or via Cloudflare Tunnel publicly.

---

## 2. Current State — What Is Built and Working

### Authentication
- Email + password login (`/login`)
- Database sessions via Better Auth (Session table)
- Optional TOTP 2FA (Google Authenticator compatible) — setup/disable in Settings → Security
- 8 single-use backup codes (hashed with bcrypt), regeneratable
- Multi-user support with role-based access control (RBAC) — roles: `ADMIN`, `VIEWER`, `RSVP_MANAGER`
- Up to 3 users seeded from `.env`; more addable via Settings → Users (ADMIN only)
- Middleware protects all routes except `/login`, `/rsvp/*`, `/api/auth/*`, `/api/rsvp/*`
- **Trusted devices**: "Remember this device" checkbox on login creates a 30-day trusted device cookie
  - Trusted devices bypass inactivity timeout entirely (stay logged in for 30 days)
  - Also skips 2FA on subsequent logins
  - Managed in Settings → Security → Trusted Devices

### Role-based access control (RBAC)

Three roles defined in the `UserRole` Prisma enum:

| Role | Access |
|------|--------|
| `ADMIN` | Full access to everything |
| `VIEWER` | Read-only access; can see Guests, Seating, Suppliers, Payments, Appointments, Dashboard; cannot edit anything |
| `RSVP_MANAGER` | Can edit guests and RSVP data; cannot see Suppliers, Payments, or Settings |

**Permission definitions** — `src/lib/permissions.ts` (`can.*` helpers):
- `editGuests` / `deleteGuests` / `manageRsvp` / `importExportGuests` — ADMIN + RSVP_MANAGER
- `editSeating` — ADMIN only
- `editSuppliers` / `editPayments` — ADMIN only
- `editAppointments` — ADMIN only
- `manageUsers` / `manageSettings` — ADMIN only
- `accessSuppliers` / `accessPayments` — ADMIN + VIEWER (page-level access; RSVP_MANAGER redirected away)
- `editTasks` — ADMIN only (add / edit / delete tasks)
- `completeTasks` — ADMIN + RSVP_MANAGER (check off tasks)
- `viewTasks` — all roles
- `accessSettings` — ADMIN only

**Client-side hook** — `src/hooks/usePermissions.ts`:
- Reads role from `useSession()`; defaults to `"VIEWER"` when session is undefined/loading (safe default)
- Returns `{ role, can: { ... }, isAdmin, isViewer, isRsvpManager }`

**Read-only UI** — `src/components/ui/ReadOnlyBanner.tsx`:
- Blue info banner shown at the top of restricted pages/sections
- Used in: GuestList, GuestForm (guest detail), AppointmentsList, SupplierList, SupplierDetail, PaymentsList, SeatingListView

**Navigation filtering** — `src/components/LayoutShell.tsx`:
- Suppliers/Payments hidden from RSVP_MANAGER nav
- Settings hidden from VIEWER and RSVP_MANAGER nav

**Page-level redirects** — server components check `getServerSession` and `redirect("/")` for unauthorised roles:
- `/settings`, `/settings/users`, `/settings/security` — ADMIN only
- `/suppliers`, `/suppliers/[id]` — `can.accessSuppliers`
- `/payments` — `can.accessPayments`

**Dashboard widgets**:
- Budget, Payments, Supplier Status widgets hidden for RSVP_MANAGER (only ADMIN + VIEWER see finance)
- Visual seating tab hidden for non-ADMIN roles

**Role change note**: Role changes take effect on the user's next login (session token is not reissued on role change).

### Dashboard (`/`)
- Countdown to wedding day
- Quick stats:
  - **Guests accepted**: shows `accepted / total`; "% responded" = `(total - pending) / total` (guests who have any non-PENDING status, not just those who accepted)
  - **Seated**: shows `assigned / receptionEligible`; uses the same filter as the seating planner — `invitedToReception: true AND NOT (attendingReception: false AND rsvpStatus NOT IN ['DECLINED'])` — so admin-overridden guests are counted correctly; `assigned` applies the same filter with `tableId != null`
  - Budget % and supplier count
- RSVP donut chart (Accepted/Partial/Declined/Pending/Maybe segments)
- Meal choice bar chart
- Budget overview (contracted/paid/remaining with progress bar)
- Supplier status breakdown
- Upcoming and overdue payments list (with inline "Mark as Paid" and email reminder button) — "View all payments →" links to `/payments`
- Upcoming appointments list (next 60 days)
- Overdue payments auto-marked on page load

### Guests (`/guests`)
- **Header row**: title + "Add guest" button (editors only); rendered in `GuestList.tsx`
- **Stats bar**: displayed below the header, shows total/accepted/partial/declined/pending/maybe/unassigned; uses filtered counts when filters are active
- Full list with filter by RSVP status, group name (including "— No group —" for guests with no group, sent as `?group=none`), table-assigned status
- Per-guest coloured event indicator squares (C/R/A, green=attending, red=declined, grey=no answer) — all 3 positions always rendered; non-invited events use `opacity-0 pointer-events-none` to preserve column alignment
- Pencil icon next to RSVP status badge when status has been manually overridden by admin (detected via `calculateRsvpStatus()` comparison)
- RSVP link with clipboard copy (HTTP fallback for non-secure contexts)
- CSV import with duplicate detection (see below) and export
- **Add guest modal**: "Add guest" button in the header row opens `GuestModal` — a modal overlay (no page navigation). On save, calls `router.refresh()` and `triggerRefresh()`, then closes. The `/guests/new` full-page route no longer exists.
- **Toolbar layout** (desktop): `[Import CSV] [Export CSV] [Template CSV] [Quick select ▾] [Print ▾]` — all owned by `GuestList.tsx` (not `page.tsx`); Quick select only renders when `guests.length > 0 && perms.can.editGuests`
- **Toolbar layout** (mobile): `[More ▾]` dropdown (containing Print options, Import CSV, Export CSV, Template CSV)
- **Search bar** is full-width on its own row below the toolbar (debounced 300ms, immediate on Enter); below that is a `[Filters (N) ▾]` button and `[Clear]` button
- **Collapsible filter panel**: toggled by the Filters button; state persisted to `localStorage`; shows Status, Group, Table (specific table names with Top Table/Head Table pinned first), Event, Meal, and Dietary dropdowns
- **Active filter badges**: appear below the filter panel for each active filter; each has an × to remove that individual filter
- **Event filter** (9 options): Invited to Ceremony/Reception/Afterparty; Attending Ceremony/Reception/Afterparty (includes admin-overridden guests via `OR [{ attendingX: true }, { attendingX: null, rsvpStatus: IN [ACCEPTED, PARTIAL] }]`); Not attending Ceremony/Reception/Afterparty
- **Meal filter**: specific meal choice (by mealOption ID) or "No choice"
- **Dietary filter**: "Has dietary notes" or "No dietary notes"
- **Table filter**: "Any" / "Assigned" / "Unassigned" / specific table name (sent as `?tableId=<id>`)
- **Stats bar** updates to show filtered counts when any filter is active; "Total" label becomes "Filtered"
- **"Showing X of Y guests"** line shown below badges when filters are active
- **Loading state**: guest list fades to 50% opacity during URL navigation (via `useTransition` + `isPending`)
- **Filtered empty state**: shows magnifying glass + "No guests match your filters" + "Clear all filters" link when filters active but no results
- **Print** dropdown in the toolbar: Full Guest List and RSVP Summary (see below); `PrintGuestListButton` accepts optional `inDropdown` + `onClose` props to render as flat menu items inside the mobile More dropdown
- **Bulk selection**: checkboxes on each row (desktop) and card (mobile); select-all header checkbox (indeterminate state); clicking any row body toggles selection
- **Quick select** dropdown: in the desktop toolbar (between Template CSV and Print); options: "Select all pending with email", "Select all pending", "Select all with email", "Clear selection"
- **Bulk actions toolbar** (sticky, appears when ≥1 selected): Send RSVP emails (X), Set Status ▾, Set Meal ▾, Delete (X), Clear selection
- **Bulk send RSVP emails** — 3-phase dialog:
  1. Confirm: will-send list (per-guest untick checkbox) + cannot-send list (no email)
  2. Sending: real-time progress bar + sent/error lists (300 ms delay between sends)
  3. Done: summary with sent/failed counts; closes and clears selection
- **Bulk set status** — "Set Status ▾" dropdown in bulk toolbar; shows all 5 statuses with coloured dots; clicking a status opens a confirmation dialog listing selected guest names; calls `POST /api/guests/bulk-status` with `{ guestIds, rsvpStatus }`; uses `prisma.guest.updateMany()` — same field as single-guest PATCH override; pencil icon appears automatically on bulk-overridden guests
- **Bulk set meal** — "Set Meal ▾" dropdown in bulk toolbar; shows all active meal options + "— No choice —" to clear; confirmation dialog lists affected guests; note shown if any selected guests are not invited to reception (they are excluded from the update); calls `POST /api/guests/bulk-meal` with `{ guestIds, mealChoice }`; only sends reception-eligible guest IDs; toast confirms count updated

### Print Guest List (`/guests` → Print dropdown)
- **Full Guest List** — opens a new tab and triggers `window.print()`
  - A4 landscape, two-column CSS layout
  - Alphabetical grouping by last name with letter headings
  - Per-guest: Last, First (child), group, RSVP status (coloured), event ✓/✗/? indicators (invited events only), meal choice (if reception + chosen), table + seat number (if assigned), dietary notes (if set)
  - Page number footer
- **RSVP Summary** — opens a new tab and triggers `window.print()`
  - Overall counts: total/accepted/partial/declined/pending/maybe
  - Per-event breakdown: attending/declined/pending for ceremony, reception, afterparty
  - Alphabetical list of all PENDING guests with group and email
- Both views fetch data client-side from `/api/guests`, `/api/settings`, `/api/meal-options`
- Component: `src/components/guests/PrintGuestListButton.tsx`

### CSV Import (`/guests` → Import CSV)
- Upload flow: parse → preview → confirm
- Preview shows three categories:
  - **New guests** (green) — will be created
  - **Duplicates** (amber) — matched by firstName + lastName (case-insensitive); shows incoming CSV data vs existing DB record side-by-side
  - **Errors** (red) — missing required fields; always skipped
- Per-duplicate action (default: Skip):
  - **Skip** — do nothing
  - **Update existing** — overwrite existing record with non-empty CSV fields only (email, phone, groupName, notes); always updates event invitation flags and isChild
  - **Import as new** — create a second guest with the same name
- Global **Skip all** / **Update all** buttons above the duplicate list
- Import button count reflects new rows + non-skipped duplicates
- Result summary shows: created / updated / skipped / errors
- API: `POST /api/guests/import` — preview mode returns `existingGuest` for each duplicate; confirm mode accepts `duplicateActions: Record<string, 'skip'|'update'|'create'>` keyed by CSV line number

### Guest detail/edit (`/guests/[id]`)
- Full edit form (name, email, phone, group, child flag, event invitations, notes)
- **Save behaviour**: "Save changes" stays on the page — it does not navigate away. After a successful PUT, the form immediately refetches fresh data from `GET /api/guests/:id` (with `cache: "no-store"`) and updates all form state via `syncFromFresh()`. A "Changes saved" banner appears briefly. `router.refresh()` is also called to keep the RSC cache consistent.
- RSVP & Meal section:
  - Read-only event responses (Ceremony / Reception / Afterparty) — reads from `localGuest` state (updated after each save), not from the initial server-rendered prop
  - Auto-calculated overall RSVP status badge (green/amber/orange/red/grey)
  - "Override ▾" dropdown — saves immediately via PATCH, then refetches and syncs all state; no form submit required
  - **Admin override indicator**: if stored `rsvpStatus` differs from what `calculateRsvpStatus()` would compute, an amber "Manually set" warning with triangle icon appears next to the badge — derived from `localGuest` state so updates immediately after override or save
  - "Resend RSVP email" ghost button (with confirm dialog)
- Meal & Dietary section (two-column: meal choice dropdown + dietary notes textarea)
- Seating section (shown when guest is assigned to a table):
  - Shows table name
  - Seat number dropdown (1..capacity); taken seats disabled with occupant name shown
  - Saves immediately via PATCH on change (no form submit required)
- RSVP link section at bottom (copy button with HTTP fallback)
- rsvpStatus is auto-calculated from per-event answers on PUT; override-only via PATCH
- `GuestForm` maintains `localGuest` state (initialised from server prop, updated by `syncFromFresh()` after every save/override) so all reactive reads stay fresh without page navigation

### Public RSVP (`/rsvp/[token]`)
- No login required, accessed via unique token
- Shows couple name, date, venue at top
- Per-event **Yes / Maybe / No** three-button toggle (only for events guest is invited to)
  - Yes → `attendingX=true, attendingXMaybe=false`
  - Maybe → `attendingX=null, attendingXMaybe=true`
  - No → `attendingX=false, attendingXMaybe=false`
- Meal choice dropdown (only if invited to reception, only if meal options configured)
- Dietary notes textarea
- Five-state confirmation screen after submit:
  - **ACCEPTED** — green checkmark, "See you there, [Name]!"
  - **MAYBE** — amber HelpCircle icon, "Thanks for letting us know, [Name]! We'll keep you posted…"
  - **PARTIAL** — pink heart, per-event breakdown table (shows Yes/Maybe/No per event), meal choice shown
  - **DECLINED** — grey X-circle, "Sorry you can't make it, [Name]"
  - Single-event accepted — same as ACCEPTED
- Meal choice shown in confirmation if attending reception
- "Change response" link always visible (returns to form)
- If guest re-visits link after responding, shows confirmation (pre-populated with saved answers, maybe state preserved)
- All events default to "Yes" (not "No") when guest first visits

### Seating Planner (`/seating`)
- Two tabs: **List view** and **Visual view**
- Shared **Print** dropdown in the page header (accessible from both tabs): Chart Designer, Floor Plan, Place Cards, Seating List
  - **Chart Designer** opens `/seating/print-designer` — a dedicated page for designing printable seating charts
  - Floor Plan from list view auto-switches to visual tab, waits for canvas render via `requestAnimationFrame`, exports, then switches back
  - Place Cards and Seating List fetch from `/api/seating/print-data` and open `window.open()` with generated HTML

**List view**
- Drag-and-drop unassigned guests → table cards; click-to-select + click-table fallback
- After assigning a guest, a seat prompt modal appears to optionally assign a seat number (or skip)
- Table cards show: table name + edit button, guest rows with seat number badges, empty seats footer; guests sorted by seat number ascending (nulls last), then lastName, firstName
- Table notes shown in italic grey text below the table name in the card header (when set)
- Table edit: inline form with name, shape, capacity, colour swatches, and notes textarea
- Seat badges: click to open inline seat selector; taken seats show occupant name and are disabled
- Empty seats footer: lists specific unoccupied seat numbers when any seats are numbered, otherwise shows count

**Visual view**
- react-konva `Stage` with draggable/resizable/rotatable tables and room elements
- `SeatingVisualView` is dynamically imported with `ssr: false` (Konva requires `window`/`document`)
- Konva `Transformer` handles resize (8 handles) and rotation natively
- Scale normalisation: `transformEnd` resets `scaleX/Y` to 1 and writes new `width`/`height` to DB via PATCH
- Tables rendered as `Circle` / `Rect` / `Ellipse` matching shape; round and oval tables keep aspect ratio
- Seat positions drawn around table perimeter (algorithmically distributed per shape)
  - Click empty seat → opens seat assignment popup (HTML overlay, positioned via world→screen transform accounting for rotation)
  - Click occupied seat → move or remove seat assignment
- Guest names shown on seat circles at 150%+ zoom
- Snap-to-grid (toggle, 10/20/40 px dot grid), undo/redo (Ctrl+Z, 50-step history)
- Multi-select: drag rectangle or Shift+click; move multiple objects together
- Align and distribute tools
- Table colour coding with 12 presets
- Properties panel syncs with canvas selection; includes shape dropdown, capacity warning, and notes textarea (saves on blur via PATCH); guest list in properties panel sorted by seat number ascending (nulls last), then lastName, firstName
- Right-click context menu: lock/unlock/delete
- Table `colour`, `width`, `height`, `locked`, `notes` stored in DB; RoomElement `locked` stored in DB
- Tables with notes show a ℹ icon in the top-right corner on the canvas

**Plan Designer view** (third tab)
- Excel-style grid tables for designing printed seating plans
- Tables rendered as blocks with header row (table name + guest count) and seat rows (seat number + guest name)
- Horizontal orientation: seats as columns, guests in single row below
- Vertical orientation: seats as rows, guest names in second column
- **Canvas controls**:
  - Zoom: mouse wheel or +/- buttons (0.25x to 3x)
  - Pan: Space + drag canvas, or arrow navigation buttons
  - Fit All button: auto-zoom to fit all tables in view
  - Grid snap: toggle with 10/20/50px options
- **Drag & drop**:
  - Drag tables to reposition (debounced API update)
  - Collision detection: red border on overlapping tables
  - Multi-select: Shift+click to select multiple tables, drag all together
- **Table management**:
  - Add table: modal with name, capacity, orientation (H/V)
  - Delete table: button with confirmation (unassigns all guests)
  - Inline rename: double-click table name header
  - Toggle orientation: H/V badge button
  - Duplicate table: creates copy with "- Copy" suffix
  - Undo/redo: Ctrl+Z / Ctrl+Shift+Z (50-step history)
- **Seat assignment**:
  - Click seat → modal with unassigned guests list
  - Search unassigned guests by name
  - Tabs: Unassigned / All Guests / On Other Tables
  - Drag guest from unassigned list directly to seat
  - Conflict handling: swap/replace options when dropping on occupied seat
- **Print** button opens modal with:
  - Portrait/Landscape orientation selection
  - Font size slider (6-16px)
  - Spacing slider (Compact to Extra Spacious — spreads tables from center)
  - Show last names toggle (checked by default)
  - Show meals toggle (unchecked by default) — displays meal choice in a separate row below guest names (horizontal orientation) or inline to the right (vertical orientation); horizontal tables automatically increase in height to accommodate the meal row
  - Output: styled HTML matching visual layout, scaled to fit one page
- **Dark mode**: toggle button, persisted to localStorage
- `Table.orientation` field (HORIZONTAL/VERTICAL) stored in DB
- Components: `src/components/seating/PlanDesignerView.tsx`, `src/components/seating/PlanTableBlock.tsx`

**Seating filter rules**
- Unassigned panel only shows guests with `invitedToReception=true AND attendingReception≠false`
- Guests already on a table who later decline reception: kept on table but shown with amber "Declined reception" badge
- When removing a declined-reception guest from a table, they are NOT added back to the unassigned list
- When deleting a table, only reception-eligible guests go back to unassigned

**Seat reassignment on capacity reduction**
- When a table's capacity is reduced, guests in seats beyond the new capacity are automatically reassigned
- Finds available seats (gaps) within the new capacity and moves displaced guests there in seat number order
- If no seats are available, displaced guests are unassigned (moved back to the unassigned list)
- Example: Table with capacity 12, guests in seats 11 and 12, seats 9 and 10 empty → reducing to capacity 10 moves guests to seats 9 and 10

**Other**
- Add/delete tables, edit table name/shape/capacity/colour/notes
- **Seat reassignment on capacity reduction**: When a table's capacity is reduced, guests in seats beyond the new capacity are automatically reassigned to available seats within the new capacity (in seat number order). If no seats are available, guests are unassigned (moved back to the unassigned list).
- Room elements (Stage, Dance Floor, Bar, Entrance, Other) — draggable, deletable
- Room dimensions configurable
- Meal summary per table
- "Seated" dashboard widget shows `assigned / receptionEligible` (not `assigned / total`)

### Print Designer (`/seating/print-designer`)
- Dedicated page for designing printable seating chart posters
- Accessible from Seating → Print ▾ → Chart Designer
- **Settings panel** (left side):
  - Orientation: Horizontal (landscape) or Vertical (portrait)
  - Paper size: A4 or Letter
  - Columns per page: 2 / 3 / 4 (horizontal layout only)
  - Font size: Small / Medium / Large
  - Display options: Show seat numbers, Show last names, Show meal choices
- **Preview area** (right side): Live preview of the layout before printing
- **Print button**: Opens styled HTML in new window for printing
- Table blocks show: table name, guest count/capacity, guest names with optional seat numbers and meal choices
- Page breaks handled with `break-inside: avoid` CSS
- Components: `src/components/seating/PrintDesigner.tsx`, `src/components/seating/PrintTableBlock.tsx`

### Suppliers (`/suppliers`, `/suppliers/[id]`)
- Supplier list with status filter (Enquiry/Quoted/Booked/Complete/Cancelled) and category filter
- **Add supplier modal**: "Add Supplier" button opens `SupplierModal` — a modal overlay with fields:
  - Category (dropdown), Status (dropdown), Supplier name* (required), Contact name, Phone, Email, Website, Contract value
  - On save, calls `router.refresh()` and `triggerRefresh()`, then navigates to the new supplier's detail page ("Create & open" behaviour)
- Supplier detail: contact info, contract value, status, notes
- Payment schedule: add/edit/delete payments, mark as paid, overdue auto-detection
  - **Edit payment**: pencil button on each row expands an inline edit form (expand-in-place, not a modal); all fields editable (label, amount, due date, status, paid date, notes); paid date shown/hidden based on status; validation on save; `router.refresh()` called after save to keep `/suppliers` list and dashboard totals fresh
  - `router.refresh()` is called after all 5 payment mutations: add, edit, mark paid, mark unpaid, delete
  - Payment notes displayed as a third line beneath the payment row when set
- File attachments: upload/download/delete (stored in S3 at key `{weddingId}/suppliers/{supplierId}/{uuid}.ext`); served via presigned URL redirect from `/api/uploads/[supplierId]/[...filename]`; receipts linked to payments show "Receipt" badge with payment label
- Supplier categories: configurable with colour, sort order (Settings → Supplier Categories)

### Payments (`/payments`)
- **Header row**: title + "Add payment" button (ADMIN only); rendered in `PaymentsList.tsx`
- Cross-supplier view of all payments — the single place to manage the full payment schedule
- **Summary bar** (always unfiltered, full dataset): Total remaining (grey) · Due this month (amber) · Overdue (red) · Paid this year (green)
- **Add payment button**: Opens `PaymentModal` to create a payment — supplier dropdown (required), label, amount, due date, notes, optional receipt upload; uses responsive grid layout
- **Filters**: Status (All/Pending/Overdue/Paid/Cancelled) · Supplier dropdown · Date range (All time / Overdue / Due this week / Due this month / Due in 3 months / Due in 6 months / Custom from–to)
- **Grouped by time period** (only non-empty groups shown):
  - **Overdue** — status OVERDUE, red accent
  - **Due this month** — PENDING with dueDate ≤ end of current calendar month, amber accent
  - **Due in 3 months** — PENDING with dueDate between next month and 3 months out
  - **Future** — PENDING with no dueDate or dueDate > 3 months from now
  - **Paid** — collapsible, collapsed by default, includes CANCELLED
- **Payment card**: status badge · supplier name (link to `/suppliers/[id]`) · label · amount/due date/paid date · supplier progress bar (totalPaid / contractValue) · notes
- **Receipt section** (per card): Shows existing receipt with view/delete buttons, or "Upload receipt" button if none; receipt thumbnail for images, PDF icon for PDFs
- **Actions per card**: Mark as paid · Mark as unpaid · Send reminder email · Edit (inline expand-in-place form) · Delete (ConfirmModal)
- **Inline edit form**: same fields as SupplierDetail edit — label, amount, due date, status, paid date (shown when PAID), notes; validation matches SupplierDetail
- **Receipt upload**: During payment creation (PaymentModal) or after creation (PaymentCard); supports PDF, JPG, PNG; max 20 MB; camera capture on mobile
- **Receipts in supplier attachments**: Receipts linked to payments appear in the supplier's attachments list with "Receipt" badge and payment label
- After every mutation: silent reload of `/api/payments` + `router.refresh()` to keep supplier detail pages and dashboard in sync
- `GET /api/payments` returns all payments with supplier info + receipt attachment data; auto-detects OVERDUE (PENDING + dueDate < today) in response without writing to DB; uses `Array.from(new Set(...))` for deduplication (TypeScript target constraint — do not use `[...new Set(...)]`)
- Components: `src/components/payments/PaymentsList.tsx`, `src/components/payments/PaymentModal.tsx`, `src/components/payments/ReceiptUploadModal.tsx`, `src/components/payments/ReceiptViewModal.tsx`

### Appointments (`/appointments`)
- **Header row**: title + "Add appointment" button (ADMIN only); rendered in `AppointmentsList.tsx`
- List of upcoming and past appointments
- Link to supplier
- Optional email reminder (N days before appointment)
- Categories configurable with colour (Settings → Appointment Categories)
- Reminder daemon checks hourly and sends reminder email to `SMTP_FROM`

### Tasks (`/tasks`)
- **Header row**: title + "Add task" button (ADMIN only); rendered in `TasksPageClient.tsx`
- Full task list grouped by time period: **Overdue** (red) · **Due this week** (amber) · **Upcoming** (blue) · **No due date** (grey) · **Completed** (collapsible, most recent 20 shown by default)
- Each task shows: priority dot (red=HIGH, amber=MEDIUM, grey=LOW), title, recurring icon, due date label, category dot + name, assignee, supplier link, notes preview
- **Due date labels**: "X days overdue" (red) · "Due today" / "Due tomorrow" (amber) · "Due 15 May" (grey) — calculated fresh each render
- **Add / edit modal**: title, category, priority, due date, assignee, linked supplier, notes, recurring section
- **Recurring tasks**: interval (Daily / Weekly / Fortnightly / Monthly) + optional end date; completing a recurring task auto-creates the next occurrence if within end date
- **Filters**: priority, assignee, category, supplier; filters stack vertically on mobile
- **Bulk selection**: checkboxes on each task; group-level select-all; bulk complete and bulk delete
- **Empty states**: "No tasks yet" (with description and "Add your first task" for ADMIN); "No tasks match your filters" (with "Clear filters" link)
- **Supplier tasks section**: embedded in `/suppliers/[id]`; shows tasks linked to that supplier; sorted incomplete first by due date then completed
- **Dashboard widget**: upcoming and overdue tasks (full width, visible to all roles)
- **Sidebar badge**: red count badge on Tasks nav item showing overdue + due-this-week count; hidden when 0
- **Task categories**: configurable (Settings → Task Categories) with name, colour, sort order, active flag

**Role permissions for tasks:**
| Role | View | Complete | Add/Edit/Delete |
|------|------|----------|-----------------|
| ADMIN | ✅ | ✅ | ✅ |
| RSVP_MANAGER | ✅ | ✅ | ❌ |
| VIEWER | ✅ | ❌ | ❌ |

- RSVP_MANAGER sees ReadOnlyBanner: "You can view and complete tasks but cannot add or edit them."
- VIEWER sees ReadOnlyBanner: "You have view-only access to tasks." and complete checkbox is disabled
- VIEWER cannot see suppliers at all so never sees the supplier tasks section

### Settings
Organized into 4 tabs accessible to ADMIN only:
- **General tab**: Wedding Details (couple name, date, venue), Notifications (reminder email), Session Timeout (inactivity timeout + warning time)
- **Meals tab**: Meal Options — add/edit/deactivate meal choices
- **Categories tab**: Supplier Categories, Appointment Categories, Task Categories — each with add/edit/delete/reorder
- **Users tab**: User Management (inline) + link to Security page

Other settings pages:
- **Profile** (`/settings/profile`): change own display name and email
- **Security** (`/settings/security`): change password, TOTP 2FA setup/disable, backup codes, trusted devices management
- `/settings/users` redirects to `/settings?tab=users` for deep linking

---

## 3. Architecture Decisions

### Data persistence — bind mounts, not named volumes
```
./data/postgres   →  /var/lib/postgresql/data
./data/minio      →  /data  (MinIO object storage — local dev only)
./data/redis      →  /data  (Redis persistence)
```
This makes the data trivially portable — copy the `data/` folder to move servers. The `postgres` service runs as UID 999 to match the default postgres user inside the container.

In production (Railway) file attachments live in Railway Buckets (Tigris S3), not in `data/`. The `data/minio/` folder is local dev only.

### File storage — S3 (MinIO locally, Railway Buckets in production)
Uploaded supplier attachments and payment receipts are stored in S3-compatible object storage. The same `@aws-sdk/client-s3` code runs in both environments — only the credentials and endpoint differ.

**Key structure:**
- Supplier attachments: `{weddingId}/suppliers/{supplierId}/{uuid}.ext`
- Payment receipts: `{weddingId}/receipts/{paymentId}/{uuid}.ext`

**Two-client pattern** (`src/lib/s3.ts`):
- `s3` — server-side ops (upload, delete, list) — uses `AWS_ENDPOINT_URL` (Docker-internal `minio:9000` in dev, Tigris in prod)
- `s3Public` — presigned URL generation — uses `S3_PUBLIC_ENDPOINT_URL` if set, otherwise falls back to `AWS_ENDPOINT_URL`. This is critical: presigned URLs embed the endpoint host in the HMAC signature. Signing with the Docker-internal hostname then rewriting the URL breaks the signature (SignatureDoesNotMatch error). In prod `S3_PUBLIC_ENDPOINT_URL` is unset so both clients use the same Tigris endpoint.

**Serving files:** `/api/uploads/[supplierId]/[...filename]` and `/api/payments/[id]/receipt` both look up the `Attachment` record, generate a presigned URL via `getDownloadUrl()`, and redirect 302. Auth is checked before the redirect — unauthenticated users cannot access files.

**`forcePathStyle`:** `true` for MinIO (path-style: `http://host/bucket/key`), `false` for Railway/Tigris (virtual-hosted: `http://bucket.host/key`). Controlled by `S3_FORCE_PATH_STYLE` env var (defaults `true` in docker-compose, unset in Railway).

### List page component pattern
All list pages (Guests, Suppliers, Payments, Appointments, Tasks) follow the same pattern:
- `page.tsx` is a minimal server component that fetches data and passes it to a client component
- The client component (`GuestList`, `SupplierList`, `PaymentsList`, `AppointmentsList`, `TasksPageClient`) handles all UI including the header row
- Header row: `<h1>` title + "Add X" button (visible only to users with edit permission)
- Add button styling: `flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90`
- This pattern keeps the page component simple (server-side data fetching only) and moves all interactive state to the client component

### Reminder daemon — tsx subprocess
`entrypoint.sh` starts `src/scripts/reminder-daemon.ts` via `tsx` as a background process alongside `next start`. It runs `checkAppointmentReminders()` immediately on startup, then every 60 minutes. Sends reminders to `SMTP_FROM`. The daemon is intentionally not a Next.js API cron to avoid cold-start gaps.

### Inngest — scheduled jobs and event-driven workflows
Inngest handles scheduled tasks (cron) and event-triggered functions. When `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set, the app registers functions with Inngest Cloud which calls `/api/inngest` to execute them.

**Environment variables:**
- `INNGEST_EVENT_KEY` — Event key from Inngest dashboard
- `INNGEST_SIGNING_KEY` — Signing key from Inngest dashboard
- Leave empty to disable Inngest (functions won't run)

**Setup:**
1. Create account at [app.inngest.com](https://app.inngest.com)
2. Create a project, copy Event Key and Signing Key
3. Add to Railway environment variables
4. Redeploy — Inngest auto-discovers functions at `/api/inngest`

**Cron functions (scheduled):**
| Function | Schedule | Purpose |
|----------|----------|---------|
| `appointment-reminders` | Hourly (`0 * * * *`) | Send appointment reminder emails |
| `stripe-reconcile` | Daily 2 AM UTC | Sync all Stripe subscriptions with DB |
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
| `wedding/cancelled` | Cancellation | Schedule data export |

**Redundancy with reminder daemon:**
Appointment reminders have two mechanisms: the tsx daemon (always runs locally) and Inngest (runs when configured). If Inngest is not configured, the daemon ensures reminders still work. If both run, the daemon and Inngest may both send reminders — this is acceptable (idempotent, duplicates are harmless).

### Cloudflare Tunnel / non-standard host
When accessed via a Cloudflare Tunnel the `Host` header differs from `NEXTAUTH_URL`. Set `NEXTAUTH_URL` in `.env` to the **public** Cloudflare Tunnel domain (e.g. `https://wedding.yourdomain.com`) — this is what Better Auth uses to validate redirect URLs and build RSVP email links. Without this, auth redirects break.

### react-konva SSR workaround
Konva requires `window` and `document` — it crashes on Next.js server-side rendering. `SeatingVisualView` is dynamically imported in `SeatingClient` with `{ ssr: false }`. Do not remove this or move `SeatingVisualView` to a server component.

Konva's Node.js build also references the `canvas` npm package (for server-side rendering support it doesn't use here). This causes a webpack build error. Fixed in `next.config.js` by marking `canvas` as a webpack external:
```js
config.externals = [...config.externals, { canvas: "canvas" }]
```

**Note:** Because of the custom webpack config, the build script uses `--webpack` flag (`next build --webpack`). Dev uses `--turbopack` flag for faster local development. Do not remove the `--webpack` flag from the build script.

### middleware.ts — do not rename to proxy.ts
Better Auth requires Edge runtime, which is not supported by Next.js 16's `proxy.ts` file. Keep `middleware.ts` as-is. The `proxy.ts` file is a Next.js 16 feature for server-side middleware, but it doesn't support Edge runtime.

### `randomId()` helper instead of `crypto.randomUUID()`
`crypto.randomUUID()` is only available in secure contexts (HTTPS / localhost). The seating visual view generates client-side temporary element IDs before they get real DB IDs. A custom `randomId()` using `Math.random()` is used instead so the app works over plain HTTP (e.g. local IP access).

### PARTIAL rsvpStatus
Guests can be invited to multiple events and decline some while accepting others. The `RsvpStatus` enum has five values: `PENDING`, `ACCEPTED`, `PARTIAL`, `DECLINED`, `MAYBE`. `PARTIAL` is auto-calculated by `src/lib/rsvpStatus.ts` whenever per-event attending answers are saved — both via the public RSVP form and the admin PUT endpoint.

### Seating planner reception filter
The seating unassigned list only shows guests who should have a seat: `invitedToReception=true AND attendingReception≠false`. Guests who decline reception after being assigned to a table are kept on their table (don't auto-remove) but shown with an amber warning badge.

### rsvpStatus ownership — auto-calc vs override
The `PUT /api/guests/[id]` endpoint auto-calculates `rsvpStatus` from per-event attending fields when any answer has been given. If no answers have been given, it falls back to the manually-passed `rsvpStatus` (allows admin to set MAYBE/PENDING manually). The `PATCH /api/guests/[id]` endpoint handles two override cases:
- `rsvpStatus` — writes status directly, bypassing auto-calc (used by the override dropdown)
- `seatNumber` — writes seat number directly; validates range (1..capacity) and uniqueness within the table

The admin detail form uses PATCH for both so that neither change triggers a full form save. The `POST /api/guests/bulk-status` endpoint uses `prisma.guest.updateMany()` to write `rsvpStatus` directly across multiple guests — same field, same bypass of auto-calc.

### Router cache (Next.js App Router)
`router.refresh()` must be called **before** `router.push()` to bust the Next.js client-side RSC router cache. Getting the order wrong causes navigation to show stale data.

`router.refresh()` should also be called after mutations that affect other pages (e.g. payment changes on `/suppliers/[id]` affect the totals visible on `/suppliers`). Call it after the mutation completes without a `router.push()` — it marks all RSC cache entries as stale so the user sees fresh data when they next navigate.

### `useState(initialProp)` sync pattern
`useState(initialProp)` only initialises state once at component mount — it does not update if the server re-renders with new props (e.g. after `router.refresh()`). To keep client state in sync with server-refreshed props, add:
```typescript
useEffect(() => { setState(initialProp); }, [initialProp]);
```
Applied in `SupplierList` so the supplier list reflects the latest server data after `router.refresh()` completes.

### RefreshContext — cross-component refresh signalling
`src/context/RefreshContext.tsx` provides a lightweight pub/sub for triggering client-side refetches without a full page navigation.

- `RefreshProvider` wraps the entire dashboard layout (`src/app/(dashboard)/layout.tsx`), above `LayoutShell`
- Exposes `refreshToken: number` (starts at 0) and `triggerRefresh()` (increments with functional update)
- **`TasksPageClient`**: `load()` has `refreshToken` in its `useCallback` deps — when the token increments, `load` is recreated and the `useEffect([load])` re-fetches. `triggerRefresh()` is called after every mutation (save, toggle complete, bulk complete, bulk delete).
- **`LayoutShell` task badge**: `refreshToken` is added to the badge `useEffect` deps alongside `pathname`, so the count updates immediately after any task mutation rather than only on navigation.
- **`GuestModal` / `SupplierModal`**: both call `triggerRefresh()` after a successful POST so the badge and any other token-watching effects stay current.
- Consume with `const { refreshToken, triggerRefresh } = useRefresh()` in any client component inside the dashboard layout.

### Three-layer caching strategy (stale data prevention)
All three Next.js/browser caching layers are suppressed throughout the app:

1. **Next.js Full Route Cache** (server-rendered HTML) — every dashboard page, layout, and API route with a GET handler has `export const dynamic = "force-dynamic"` at the top.

2. **Browser fetch cache** (client-side `fetch()` calls) — all GET fetches in client components use `fetchApi()` from `src/lib/fetch.ts`, which always adds `cache: "no-store"`. POST/PUT/PATCH/DELETE calls use `fetch()` directly (mutations are never cached by the browser).

3. **CDN / proxy cache** (Cloudflare or any reverse proxy) — all API GET handlers return responses built with `apiJson()` from `src/lib/api-response.ts` instead of `NextResponse.json()`. `apiJson()` automatically adds `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`, `Pragma: no-cache`, and `Expires: 0`.

**Rule**: whenever you add a new GET API route, import and use `apiJson()` instead of `NextResponse.json()` for the success response, and add `export const dynamic = "force-dynamic"` at the top of the file. Whenever you add a GET `fetch()` call in a client component, use `fetchApi()` instead of `fetch()`.

### Reference data caching (in-memory)
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
- `/api/supplier-categories` — supplier categories (`supplier-categories`)
- `/api/appointment-categories` — appointment categories (`appointment-categories`)
- `/api/task-categories` — task categories (`task-categories`)

**Invalidation**: Each category's mutation routes (POST, PUT, DELETE) call `invalidateCache()` with the appropriate key. For example, `/api/task-categories/[id]` calls `invalidateCache("task-categories")` after any update or delete.

**When to use**: Reference data that is read frequently but changes rarely (category lists, settings, meal options). Do NOT use for user data, guest data, or anything that needs real-time consistency.

### Graceful shutdown
`entrypoint.sh` handles SIGTERM/SIGINT for clean container stops:
- Sends SIGTERM to Next.js server and reminder daemon
- Waits up to `GRACEFUL_TIMEOUT` seconds (default 30) for processes to finish
- Stops accepting new connections during shutdown
- Force-kills processes only after timeout expires
- Used by Docker healthcheck and orchestration platforms

### Health check endpoint
`GET /api/health` provides monitoring endpoint:
- Checks database connectivity (SELECT 1)
- Checks Redis connectivity if `REDIS_URL` is configured
- Returns status: `healthy` (all checks pass), `degraded` (Redis unavailable), or `unhealthy` (database unavailable)
- Used by Docker healthcheck: `wget -q --spider http://localhost:3000/api/health`
- No authentication required (public endpoint)

### Environment validation on startup
`src/lib/env.ts` validates all required environment variables when the app starts:
- Called from `src/instrumentation.ts` during Next.js initialization
- Validates: `DB_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SEED_ADMIN_1_*`
- Validates SMTP completeness if any SMTP var is set
- Throws clear error messages for missing/invalid config
- App fails fast with helpful error instead of cryptic runtime failure

### API response types
`src/types/api.ts` defines TypeScript interfaces for all API responses:
- Entity types: `UserResponse`, `GuestResponse`, `SupplierResponse`, `PaymentResponse`, etc.
- Pagination types: `PaginationMeta` (total, hasMore) extended by list responses
- Request body types: `SupplierCreateBody`, `TableUpdateBody`, `RoomUpdateBody`, etc.
- Used in API routes for type-safe request parsing
- Ensures consistent response shapes across all endpoints

---

## 4. Data Model Summary

### User
Admin accounts. `password` is bcrypt-hashed (cost 10). Optional `twoFactorSecret` (base32 TOTP seed). Related `BackupCode` records (hashed, single-use). Has `sessions` and `accounts` relations for Better Auth.

### Account (Better Auth)
Stores authentication credentials. Key fields:
- `userId` — FK to User
- `providerId` — always `"credential"` for this app
- `accountId` — email address
- `password` — bcrypt-hashed password (cost 10)

**Important**: When changing a user's password, you MUST update both `User.password` AND `Account.password` (where `providerId = 'credential'`). The `Account` table is what Better Auth reads for credential authentication.

### WeddingConfig
Singleton (`id = 1`). Couple name, date, venue name/address.

### Guest
Core guest record. Key fields:
- `rsvpToken` — unique, used as the public RSVP URL slug
- `rsvpStatus` — `PENDING | ACCEPTED | PARTIAL | DECLINED | MAYBE`
- `invitedToCeremony/Reception/Afterparty` — which events invited to
- `attendingCeremony/Reception/Afterparty` — actual responses (nullable until answered)
- `mealChoice` — foreign-key-like string referencing `MealOption.id`
- `tableId` — nullable FK to `Table`
- `seatNumber` — nullable `Int`; seat position at the assigned table (1..capacity)
- `isManualOverride` — `Boolean @default(false)`; set `true` by admin PATCH/bulk-status, `false` by public RSVP; drives the pencil icon in the guest list

### MealOption
Configurable meal choices (name, course, description, active flag, sort order).

### Room / Table / RoomElement
Seating planner. One Room per app (auto-created on first visit). Tables have shape (ROUND/RECTANGULAR/OVAL), capacity, canvas position, and visual fields:
- `width`, `height` (`Float`) — table size on the canvas
- `locked` (`Boolean`) — prevents moving/resizing in visual view
- `colour` (`String`) — hex colour for canvas fill (12 presets available)
- `notes` (`String?`) — optional notes shown in list view card header and properties panel; ℹ icon shown on canvas

RoomElements are decorative (Stage, Bar, etc.) with `width`/`height` and:
- `locked` (`Boolean`) — prevents moving/resizing

### Supplier / SupplierCategory
Suppliers have status (ENQUIRY/QUOTED/BOOKED/COMPLETE/CANCELLED), contract value, and optional category. Categories have name, colour, sort order.

### Payment
Belongs to Supplier. Has label, amount, dueDate, paidDate, status (PENDING/PAID/OVERDUE/CANCELLED). Overdue auto-marking happens on dashboard load. Supports optional receipt attachment (PDF/image).

### Attachment
Belongs to Supplier. `storedAs` is the UUID-renamed filename on disk. `filename` is the original display name. Optional `paymentId` links to a Payment for receipt attachments (shown in both supplier attachments list and payment detail).

### Appointment / AppointmentCategory
Appointments have date, location, notes, optional supplier link, optional reminderDays. `reminderSent` prevents double-sending.

### Task / TaskCategory
Tasks track wedding to-do items. Key fields:
- `title` — required
- `priority` — `HIGH | MEDIUM | LOW`
- `dueDate` — optional; drives grouping (Overdue / Due this week / Upcoming / No date)
- `isCompleted` / `completedAt` — completion state
- `categoryId` — optional FK to `TaskCategory`
- `assignedToId` — optional FK to `User`
- `supplierId` — optional FK to `Supplier`
- `isRecurring` / `recurringInterval` (`DAILY | WEEKLY | FORTNIGHTLY | MONTHLY`) / `recurringEndDate` — recurring config
- When a recurring task is completed, the API creates the next occurrence automatically (if before `recurringEndDate`)

`TaskCategory` has name (unique), colour, sortOrder, isActive.

---

## 5. Migrations

| # | Name | What it does |
|---|------|-------------|
| 0 | `init` | All base tables and enums: User, WeddingConfig, Guest, MealOption, Room, Table, RoomElement, Supplier (with text `category` column), Payment, Attachment |
| 1 | `add_2fa` | `twoFactorEnabled` + `twoFactorSecret` on User; new `BackupCode` table |
| 2 | `add_appointments` | `Appointment` table with old enum-based `AppointmentCategory` type |
| 3 | `category_models` | Converts Supplier text `category` → `SupplierCategory` table with FK. Converts Appointment enum category → `AppointmentCategory` table. Populates seed categories for both. |
| 4 | `add_partial_rsvp_status` | `ALTER TYPE "RsvpStatus" ADD VALUE 'PARTIAL'` — applied directly to running DB because `ALTER TYPE ADD VALUE` cannot run inside a transaction (Prisma limitation with PostgreSQL enums) |
| 5 | `table_visual_fields` | Adds `width`, `height`, `locked`, `colour` to `Table`; adds `locked` to `RoomElement`. All with safe defaults. |
| 6 | `add_seat_number` | Adds `seatNumber Int?` to `Guest`. Nullable with no default — existing guests have no seat assigned. |
| 7 | `add_rsvp_maybe` | Adds `attendingCeremonyMaybe`, `attendingReceptionMaybe`, `attendingAfterpartyMaybe` (`BOOLEAN NOT NULL DEFAULT false`) to `Guest`. Powers the three-way Yes/Maybe/No RSVP toggle. |
| 8 | `add_manual_override` | Adds `isManualOverride Boolean @default(false)` to `Guest`. Set `true` by admin PATCH/bulk-status overrides, `false` by public RSVP submission. Used to show the pencil icon beside the RSVP status badge in the guest list. |
| 9–11 | `add_reminder_email`, `add_login_attempt`, `add_user_locked_until`, `add_user_role` | Various auth/security enhancements: `reminderEmail` on `WeddingConfig`, login attempt tracking, account lockout, `UserRole` enum on `User`. |
| 12 | `add_tasks` | Adds `TaskPriority` enum (`HIGH/MEDIUM/LOW`), `RecurringInterval` enum (`DAILY/WEEKLY/FORTNIGHTLY/MONTHLY`), `TaskCategory` table, and `Task` table with all fields (title, notes, priority, dueDate, completedAt, isCompleted, isRecurring, recurringInterval, recurringEndDate, categoryId, assignedToId, supplierId). |
| 13 | `add_performance_indexes` | Adds database indexes for frequently queried fields: `Guest.tableId` (seating queries), `Task.isCompleted + dueDate` composite (task list filtering), `Task.assignedToId`, `Task.categoryId`, `Task.supplierId`. |
| 14 | `add_session_version` | Adds `sessionVersion` field to User model for session invalidation after password/email changes, 2FA toggle, or role changes. |
| 15 | `add_email_verification` | Adds `emailVerified` and `verificationToken` fields to User model for optional email verification. |
| 16 | `add_query_indexes` | Adds indexes for frequently queried fields: `Guest.email` (duplicate check), `Payment.status + dueDate` (upcoming/overdue), `Appointment.date` (upcoming). |
| 17 | `add_better_auth_tables` | Adds `Session`, `Account`, `Verification` tables for Better Auth authentication. `Account` table stores credentials (email/password). User model gets `sessions` and `accounts` relations. |
| 18 | `remove_user_password` | Removes `password` field from User model. Password is now stored exclusively in the Account table (Better Auth architecture). |
| 19 | `add_payment_receipt` | Adds `paymentId` column to `Attachment` model with index. Allows attachments to be linked to payments as receipts. Receipts appear in both supplier attachments list (with "Receipt" badge) and payment detail view. |
| 20 | `add_guest_group_name_index` | Adds index on `Guest.groupName` for faster group filtering and grouping queries in the guest list. |

**Important**: Migration 4 (`PARTIAL`) was applied directly via `docker compose exec db psql` and manually inserted into `_prisma_migrations`. If restoring to a fresh DB from the schema, all migrations will run in order automatically — no special handling needed. If the DB already exists from before migration 4, run:
```sql
ALTER TYPE "RsvpStatus" ADD VALUE 'PARTIAL';
```

---

## 6. Known Bugs Fixed

| Bug | Fix |
|-----|-----|
| Copy-to-clipboard silently fails over HTTP (non-secure context) | Added `navigator.clipboard && window.isSecureContext` guard with `textarea` + `document.execCommand('copy')` fallback. Applied to `GuestList.tsx`, `GuestForm.tsx`, `TwoFactorSettings.tsx`. |
| Copy button inside form submits form | Added `type="button"` explicitly to all non-submit buttons inside form elements. |
| RSVP afterparty defaulted to "No" when guest first visits | Changed default from `false` to `true` for all invited events in `RsvpForm.tsx`. |
| Admin guest edit: rsvpStatus not saving | `router.push()` was called before `router.refresh()` — router cache wasn't busted before navigation. Fixed by swapping order. |
| `attendingAfterparty` was `null` in DB after RSVP submit | Caused by the above defaulting bug — submit was sending `null` instead of `true`. Fixed by the afterparty default fix. |
| Seating planner showed declined-reception guests in unassigned list | Server query now filters: `WHERE invitedToReception = true AND attendingReception IS NOT FALSE`. Confirmed the Docker image had to be rebuilt — code change alone doesn't take effect in a running container. |
| Seating planner didn't show admin-overridden ACCEPTED guests in unassigned list | Old filter excluded any guest with `attendingReception: false` even if admin had overridden to ACCEPTED. Fixed with `NOT { AND: [{ attendingReception: false }, { rsvpStatus: { notIn: ["ACCEPTED","PARTIAL"] } }] }`. Also updated `isReceptionEligible()` to match. |
| Guest list / guest pages serving stale data after edits (Full Route Cache) | Next.js Full Route Cache was caching server-rendered HTML. Fixed by adding `export const dynamic = "force-dynamic"` to all dashboard pages, layout, and all API route files with GET handlers. |
| Persistent stale data across all pages (browser + CDN cache) | Three-layer fix: (1) `force-dynamic` on all pages/API routes, (2) `fetchApi()` with `cache: 'no-store'` for all client-side GET fetches, (3) `apiJson()` returning `Cache-Control: no-store` headers on all API GET responses. See `src/lib/fetch.ts` and `src/lib/api-response.ts`. |
| Prisma enum migration `ON CONFLICT DO NOTHING` error | `_prisma_migrations` table has no unique constraint on `migration_name` column so `ON CONFLICT` syntax fails. Fixed by using plain `INSERT`. |
| Migration 4 (`PARTIAL`) fails inside transaction | PostgreSQL cannot `ALTER TYPE ADD VALUE` inside a transaction. Applied directly via psql and registered manually in `_prisma_migrations`. |
| Guest detail page shows stale values after save | Event responses section and `isManualOverride` read from the server-rendered `guest` prop which never changed. Fixed by adding `localGuest` state updated via `syncFromFresh()` after every save/override. Form now stays on the page after saving (no navigation) and shows a "Changes saved" banner. |
| Seating table cards show guests in DB insertion order | Guests were rendered directly from `table.guests` without sorting. Fixed by adding explicit sort at render time in `SeatingListView.tsx` and `SeatingVisualView.tsx` (seat number asc, nulls last, then lastName, firstName). Also added `orderBy` to all Prisma queries that include guests, and to optimistic updates in `SeatingClient.tsx`. |
| Supplier list shows stale data after creating a new supplier | `useState(initialProp)` only initialises once — `router.refresh()` re-renders the server component but the client state didn't update. Fixed by adding `useEffect(() => setSuppliers(initialSuppliers), [initialSuppliers])` to sync prop changes into state. |
| Payment mutations on supplier detail didn't refresh the supplier list page | `router.refresh()` was not being called after payment add/edit/mark-paid/mark-unpaid/delete. Added to all 5 payment handlers in `SupplierDetail.tsx` so `/suppliers` totals and dashboard budget figures stay current. |
| Dashboard "Seated" widget showed wrong ratio (e.g. 80/1) | `receptionEligible` used old filter that excluded anyone with `attendingReception: false`, even admin-overridden guests. `assigned` counted all guests with `tableId != null` regardless of reception eligibility. Both now use the same filter as the seating planner: `invitedToReception: true AND NOT (attendingReception: false AND rsvpStatus NOT IN ['DECLINED'])`. |
| Dashboard "Guests accepted" widget showed incorrect "% responded" | Was calculating `accepted / total * 100` — bulk-overriding all guests to ACCEPTED would show 100% responded even if no one filled in the RSVP form. Fixed to `(total - pending) / total * 100` so it reflects guests who have any non-PENDING status. |
| `[...new Set(...)]` spread causes TypeScript build error | The project's TypeScript target does not support iterating `Set` with spread syntax. Use `Array.from(new Set(...))` instead. |
| Supplier status accepted invalid values | Status field in `POST /api/suppliers` and `PUT /api/suppliers/[id]` accepted any string without validation. Fixed by adding `isValidStatus()` type guard and validating against `SupplierStatus` enum. Invalid values return 400 error (PUT) or default to "ENQUIRY" (POST). |
| XSS vulnerability in email templates | HTML emails directly interpolated database values (`coupleName`, `guestFirstName`) without escaping. Fixed by adding `esc()` helper using `he.escape()` and `safeUrl()` for URL validation. All user-editable values in HTML emails are now escaped. |
| CSP headers broke Next.js app | Initial CSP `script-src 'self'` blocked inline scripts needed for hydration. Fixed by adding `'unsafe-inline' 'unsafe-eval'` to `script-src`, `'https://fonts.gstatic.com'` to `font-src` (for Google Fonts), and `connect-src 'self' ws: wss: https:` for dev mode WebSockets. Also added `https://static.cloudflareinsights.com` to `script-src` for Cloudflare analytics beacon. |
| Meal choice accepted invalid IDs | The `mealChoice` field was stored directly without validating it references an active meal option. Fixed by adding validation in three places: `POST /api/guests/bulk-meal`, `PUT /api/guests/[id]`, and `POST /api/rsvp/[token]`. Returns 400 error for invalid meal option IDs. |
| No rate limiting on public RSVP endpoint | Public RSVP endpoint had no rate limiting, allowing potential token enumeration or RSVP spam. Fixed by adding `src/lib/rate-limit.ts` utility with per-IP (20/min) and per-token (10/min) limits on both GET and POST endpoints. |
| Email change without password confirmation | Users could change their email without providing their password, allowing account hijacking if an attacker gained temporary session access. Fixed by requiring password confirmation in `PATCH /api/profile` when email is changed, with client-side UI showing password field when email differs from current. |
| Timing attack on login user lookup | When a user doesn't exist, the login returned immediately without bcrypt comparison, allowing timing-based email enumeration. Fixed by performing a dummy bcrypt comparison on a pre-computed hash when user is not found, normalizing response times. |
| No rate limiting on email sending endpoints | The RSVP email and payment reminder email endpoints had no rate limiting, allowing potential email abuse. Fixed by adding per-user rate limiting (50 emails per hour per user) using `checkRateLimit()` from `src/lib/rate-limit.ts` in both `POST /api/email/rsvp` and `POST /api/email/payment-reminder`. Returns 429 when limit exceeded. |
| N+1 query pattern in supplier/payments lists | Supplier and payment list endpoints returned all records without pagination, potentially causing performance issues with large datasets. Fixed by adding optional `skip` and `take` query parameters (1-500 range) to `GET /api/guests` and `GET /api/tasks`. Defaults to returning all results for backward compatibility with existing clients. |
| Missing database indexes | Frequently queried fields lacked indexes, causing slow queries. Fixed by adding indexes across migrations 13, 16, and 20: `Guest.tableId` (seating), `Guest.email` (duplicate check), `Guest.groupName` (group filtering), `Task.isCompleted + dueDate` (task filtering), `Task.assignedToId`, `Task.categoryId`, `Task.supplierId`, `Payment.status + dueDate` (upcoming/overdue), `Appointment.date` (upcoming), `LoginAttempt.email` and `createdAt` (security audit). |
| Multiple `any` type usage | API routes used `any` for request body types, bypassing TypeScript safety. Fixed by creating `src/types/api.ts` with typed interfaces (`SupplierCreateBody`, `TableUpdateBody`, `RoomUpdateBody`, `RoomElementInput`) and applying them to `req.json()` calls in suppliers, tables, and rooms routes. |
| Duplicate status validation code | `VALID_STATUSES` arrays and `isValidStatus()` functions duplicated across multiple files. Fixed by creating `src/lib/validation.ts` with shared `isValidRsvpStatus()` and `isValidSupplierStatus()` type guards, used in `bulk-status/route.ts`, `suppliers/route.ts`, and `suppliers/[id]/route.ts`. |
| Inconsistent authorization patterns | `GET /api/suppliers` used inline session check while other routes used `requireRole` helper. Fixed by using `requireRole(["ADMIN", "VIEWER"])` for consistent authorization pattern across all API routes. |
| Missing return type annotations | API route handlers lacked explicit return type annotations. Fixed by adding `Promise<NextResponse>` return type to all async GET, POST, PUT, PATCH, DELETE handlers across all API routes. |
| Content-Disposition header injection | Download endpoint used unsanitized filename in HTTP header, allowing potential header injection. Fixed by creating `src/lib/filename.ts` with `sanitizeFilename()` and `buildContentDisposition()` utilities. Upload sanitizes filenames before storing in DB; download uses defense-in-depth sanitization plus RFC 6266 `filename*` encoding. |
| No session invalidation on security events | Sessions remained valid after password/email changes, 2FA toggle, and role changes. Fixed by adding `sessionVersion` field to User model, checking in `requireRole()` middleware, and incrementing on security-sensitive events via `invalidateUserSessions()`. Users must re-login after these events. |
| Bulk operations had no size limits | Bulk status/meal/email operations accepted unlimited array sizes, allowing potential DoS. Fixed by adding `getBulkLimits()` in `src/lib/rate-limit.ts` with configurable limits (`BULK_GUEST_LIMIT=500`, `BULK_EMAIL_LIMIT=100`). Validation added to `bulk-status`, `bulk-meal`, and `send-rsvp-emails` endpoints. |
| Duplicate guest emails allowed | Creating/updating guests accepted duplicate emails, causing confusion in RSVP email sending. Fixed by adding duplicate email check in `POST /api/guests` and `PUT /api/guests/[id]`. Returns 409 Conflict if email already exists on another guest. |
| Rate limiting not shared across instances | In-memory rate limiting didn't work for multi-instance deployments — each instance had separate state. Fixed by implementing Redis-backed rate limiting with automatic fallback to in-memory when `REDIS_URL` is not set. Uses atomic `INCR` + `PEXPIRE` for shared state across instances. |
| Password length not validated | Password update endpoint accepted unlimited length passwords. Fixed by adding max length validation (128 chars) in `PUT /api/users/[id]/password`. |
| User name/email not length-validated | User update endpoint accepted unlimited length name and email values. Fixed by using `validateFields()` with `LENGTH_LIMITS` in `PUT /api/users/[id]`. |
| Missing startup environment validation | App could start with missing or invalid environment variables, failing at runtime. Fixed by creating `src/lib/env.ts` with `validateEnv()` and calling it in `src/instrumentation.ts` on startup. |
| Better Auth migration missing Account records | Migrating from next-auth to Better Auth required creating Account records for existing users. Password changes only updated User table, not Account table. Fixed by updating `PUT /api/users/[id]/password`, `POST /api/users`, and `prisma/seed.ts` to create/update Account.password. Also changed bcrypt cost from 12 to 10 for consistency. |
| Session cookie cache mismatched session expiry | Better Auth `cookieCache.maxAge` was set to 24 hours while `session.expiresIn` was 30 days. For trusted devices promised 30 days of staying logged in, the cache expiry should match. Fixed by setting `cookieCache.maxAge` to 30 days in `src/lib/auth-better.ts` so all three durations align: session expiry (30 days), cookie cache (30 days), and trusted device cookie (30 days). |
| Login loop with callback URL | After login, `router.push(callbackUrl)` used client-side navigation which didn't wait for the session cookie to be available. The middleware would see no session and redirect back to login, creating a loop. Fixed by using `window.location.href = callbackUrl` which forces a full page reload and ensures the session cookie is read. |
| Guests orphaned when table capacity reduced | When reducing a table's capacity, guests in seats beyond the new capacity kept their seat numbers and became "invisible" in the UI. Fixed by adding automatic seat reassignment in `PUT /api/tables/[id]` that moves displaced guests to available seats within the new capacity, or unassigns them if no seats available. |
| Modal forms not mobile-friendly | GuestModal, SupplierModal, AppointmentModal, and TaskModal used fixed 2-column grids that were hard to use on mobile. Fixed by adding responsive grid classes (`grid-cols-1 sm:grid-cols-2`) that stack fields vertically on mobile while maintaining 2-column layout on desktop. |
| Horizontal table meal row cut off in print view | Plan Designer print view used fixed height for horizontal tables, causing meal row to be cut off when "Show meals" enabled. Fixed by dynamically adding 30px to table height when meals are displayed, and recalculating layout bounds to account for the extra height. |
| N+1 query in bulk RSVP email send | The send-rsvp-emails endpoint fetched each guest individually in a loop. Fixed by batch fetching all guests in a single query with `findMany({ where: { id: { in: guestIds } } })` and using a Map for O(1) lookups. |
| Sequential validation queries in task creation | Task POST endpoint validated category, user, and supplier existence sequentially. Fixed by parallelizing with `Promise.all()` to run all three checks simultaneously. |
| Sequential queries in payments list | The payments endpoint fetched payments and then receipts in sequence. Fixed by parallelizing receipt and groupBy queries with `Promise.all()`. |
| Supplier endpoint over-fetching | The suppliers list endpoint used `include` to fetch full category and payment data when only IDs and sums were needed. Fixed by using targeted `select` to fetch only required fields, reducing data transfer. |
| Heavy task query for sidebar badge | The sidebar task badge triggered a full task list query with all relations just to show a count. Fixed by creating a lightweight `/api/tasks/count` endpoint that returns only `{ count: number }`. |

---

## 7. Key Files

```
wedding-planner/
├── docker-compose.yml         — Three services: app (port 3000) + db (postgres:16) + redis (redis:7-alpine); app has healthcheck using /api/health
├── Dockerfile                 — Multi-stage build: deps → builder → runner
├── entrypoint.sh              — Runs migrations, seed, reminder daemon, then next start; handles graceful shutdown on SIGTERM/SIGINT
├── .env                       — All secrets and config (never commit this)
├── prisma/
│   ├── schema.prisma          — Full data model
│   ├── seed.ts                — Creates admin users from SEED_ADMIN_* env vars
│   └── migrations/            — 20 numbered migrations (0–19)
├── src/
│   ├── instrumentation.ts     — Next.js startup hook; validates environment variables
│   ├── middleware.ts          — Auth guard for all routes except login/rsvp/api-auth
│   ├── context/
│   │   └── RefreshContext.tsx — RefreshProvider + useRefresh() hook; cross-component refresh token
│   ├── types/
│   │   └── api.ts             — Typed API response interfaces for all endpoints
│   ├── lib/
│   │   ├── auth-better.ts    — Better Auth config (credentials provider, bcryptjs password hashing)
│   │   ├── auth-client.ts    — Better Auth React client (useSession, signIn, signOut)
│   │   ├── session.ts        — getSession(), requireAuth() helpers with typed session; invalidateUserSessions()
│   │   ├── prisma.ts          — Singleton Prisma client
│   │   ├── email.ts           — nodemailer: sendRsvpEmail, sendAppointmentReminderEmail, sendPaymentReminderEmail; esc() and safeUrl() helpers for XSS prevention
│   │   ├── env.ts             — validateEnv(): startup validation of required environment variables
│   │   ├── rsvpStatus.ts      — calculateRsvpStatus() — ACCEPTED/PARTIAL/DECLINED/PENDING logic
│   │   ├── stripe-sync.ts     — syncWeddingFromStripe() — recover from missed webhooks, sync subscription status
│   │   ├── seating-types.ts   — GuestSummary, TableWithGuests, Room, isReceptionEligible()
│   │   ├── totp.ts            — TOTP generate/verify + backup code helpers
│   │   ├── csv.ts             — Guest CSV import/export
│   │   ├── fetch.ts           — fetchApi() helper: GET fetches with cache: 'no-store' (use in all client components)
│   │   ├── api-response.ts    — apiJson() and noCacheHeaders(): no-cache response headers (use in all GET handlers)
│   │   ├── db-error.ts         — handleDbError(): centralized Prisma error handling for all API routes
│   │   ├── filename.ts          — sanitizeFilename(), buildContentDisposition(): safe filename handling for uploads/downloads
│   │   ├── session.ts           — invalidateUserSessions(): increments sessionVersion to invalidate sessions
│   │   ├── rate-limit.ts       — checkRateLimit(), extractIp(), getBulkLimits(): Redis-backed rate limiting with in-memory fallback; async for Redis support
│   │   ├── cache.ts            — getCached(), invalidateCache(): in-memory TTL cache for reference data (categories, settings, meal options)
│   │   └── appointmentReminders.ts — checkAppointmentReminders() called by daemon
│   ├── scripts/
│   │   └── reminder-daemon.ts — Long-running process; calls startReminderJob()
│   ├── lib/inngest/
│   │   ├── client.ts             — Inngest client initialization
│   │   ├── index.ts              — Export all Inngest functions
│   │   └── functions/            — Scheduled and event-triggered functions
│   │       ├── appointment-reminders.ts   — Cron: hourly, send appointment reminders
│   │       ├── stripe-reconcile.ts        — Cron: daily 2 AM, sync all Stripe subscriptions
│   │       ├── stripe-sync-delayed.ts     — Event: stripe/sync.delayed, recover null subscription
│   │       ├── grace-period-expiry.ts     — Cron: daily 5 AM, move expired grace to CANCELLED
│   │       ├── mark-overdue-payments.ts   — Cron: daily 6 AM, mark overdue payments
│   │       ├── pre-deletion-warning.ts    — Cron: daily 2 AM, send deletion warning
│   │       ├── purge-expired-weddings.ts  — Cron: daily 4 AM, delete expired accounts
│   │       ├── welcome-email.ts           — Event: wedding/created, send welcome email
│   │       ├── trial-ending-reminder.ts   — Event: stripe/trial.will_end, send reminder
│   │       ├── payment-failure-email.ts   — Event: stripe/payment.failed, send failure email
│   │       └── cancellation-data-export.ts — Event: wedding/cancelled, export data
│   ├── app/
│   │   ├── (dashboard)/       — All authenticated pages (layout wraps with sidebar nav)
│   │   │   ├── page.tsx       — Dashboard
│   │   │   ├── guests/        — Guest list + [id] (no /new route — add via GuestModal)
│   │   │   ├── seating/       — Seating planner (server page passes data to SeatingClient)
│   │   │   │   └── print-designer/ — Print designer page for seating charts
│   │   │   ├── suppliers/     — Supplier list + [id] (no inline add form — add via SupplierModal)
│   │   │   ├── payments/      — Cross-supplier payments page
│   │   │   ├── appointments/  — Appointment list
│   │   │   └── settings/      — Settings pages
│   │   ├── rsvp/[token]/      — Public RSVP page (no auth)
│   │   ├── login/             — Login page
│   │   └── api/               — All API routes (see below)
│   └── components/
│       ├── dashboard/DashboardClient.tsx  — Full dashboard UI
│       ├── guests/
│       │   ├── GuestList.tsx              — Guest list table + filters; opens GuestModal for new guests
│       │   ├── GuestModal.tsx             — Modal overlay for adding a new guest
│       │   ├── GuestForm.tsx              — Edit-only form used on /guests/[id] (RSVP, meal, seating, override)
│       │   ├── RsvpStatusBadge.tsx        — Coloured badge for RSVP status
│       │   ├── CsvImportModal.tsx         — CSV import with duplicate detection + side-by-side comparison
│       │   └── PrintGuestListButton.tsx   — Print dropdown: Full Guest List + RSVP Summary
│       ├── payments/
│       │   ├── PaymentsList.tsx           — Cross-supplier payments page: summary bar, filters, grouped cards, inline edit, receipt display
│       │   ├── PaymentModal.tsx            — Add payment modal with optional receipt upload
│       │   ├── ReceiptUploadModal.tsx     — Receipt upload modal (file picker + camera capture)
│       │   └── ReceiptViewModal.tsx       — Receipt preview modal (images inline, PDFs open in new window)
│       ├── rsvp/RsvpForm.tsx              — Public RSVP form + 5-state confirmation (Yes/Maybe/No per event)
│       ├── suppliers/
│       │   ├── SupplierList.tsx           — Supplier list with filters; opens SupplierModal for new suppliers
│       │   ├── SupplierModal.tsx          — Modal overlay for adding a new supplier
│       │   └── SupplierDetail.tsx         — Supplier detail: payments, attachments, tasks
│       └── seating/
│           ├── SeatingClient.tsx          — State manager + assign/remove/delete logic
│           ├── SeatingListView.tsx        — Drag-and-drop list view
│           ├── SeatingVisualView.tsx      — react-konva canvas visual view (dynamically imported, ssr:false)
│           ├── PrintDesigner.tsx          — Print designer page: settings + preview
│           └── PrintTableBlock.tsx        — Table block component for print layout (horizontal/vertical)
│       └── billing/
│           ├── ActivateTrialButton.tsx   — "Activate subscription" button; ends trial, starts billing
│           └── SyncFromStripeButton.tsx   — "Refresh from Stripe" button; manual sync for billing page
```

### API routes
```
GET/PUT/PATCH/DELETE /api/guests/[id]    — Guest detail (PATCH = status override only)
GET        /api/guests/export            — CSV export
POST       /api/guests/import            — CSV import
POST       /api/guests/send-rsvp-emails  — Bulk RSVP email send ({ guestIds }) → { sent, failed, skipped }
POST       /api/guests/bulk-status       — Bulk RSVP status override ({ guestIds, rsvpStatus }) → { updated }
POST       /api/guests/bulk-meal         — Bulk meal choice update ({ guestIds, mealChoice }) → { updated }
GET/POST   /api/rsvp/[token]             — Public RSVP: GET returns guest + meal options, POST submits response
POST       /api/email/rsvp              — Resend RSVP email (admin-triggered); rate limited: 50/hour per user
GET        /api/payments                 — All payments across all suppliers with supplier info + receipt data + auto-detected OVERDUE status; optional pagination: ?skip=0&take=50
GET/POST/DELETE /api/payments/[id]/receipt — Get/upload/delete receipt for a payment (PDF/JPG/PNG, max 20 MB)
GET/POST   /api/suppliers               — Supplier list + create; optional pagination: ?skip=0&take=50
GET/PUT/DELETE /api/suppliers/[id]      — Supplier detail
GET/POST   /api/suppliers/[id]/payments — Payments
PUT/DELETE /api/suppliers/[id]/payments/[paymentId]
POST       /api/suppliers/[id]/attachments
DELETE     /api/suppliers/[id]/attachments/[attachmentId]
GET        /api/uploads/[supplierId]/[filename] — Protected file serving
GET/POST   /api/appointments            — Appointments
GET/PUT/DELETE /api/appointments/[id]
GET        /api/appointments/check-reminders — Manual trigger (used by daemon)
GET/POST   /api/supplier-categories     — CRUD + reorder
GET/POST   /api/appointment-categories  — CRUD + reorder
GET/POST   /api/meal-options            — Meal options
GET/PUT/DELETE /api/meal-options/[id]
GET        /api/dashboard/stats         — All dashboard data in one call
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
GET        /api/tasks/count             — Lightweight task count for sidebar badge (overdue + due this week); returns `{ count: number }`; avoids full task fetch
GET/PUT/DELETE /api/tasks/[id]          — Task detail; PUT requires ADMIN
PATCH      /api/tasks/[id]/complete     — Toggle complete (ADMIN + RSVP_MANAGER); creates next recurrence for recurring tasks
GET/POST   /api/task-categories         — Task category list + create (ADMIN)
PUT/DELETE /api/task-categories/[id]    — Update/delete category; DELETE returns 409 if tasks use it (force=true to nullify and delete)
GET        /api/health                  — Health check endpoint: database connectivity, Redis connectivity (if configured), returns status JSON
POST       /api/billing/sync            — Manually sync Stripe subscription data; ADMIN only; returns { changed, before, after }
POST       /api/billing/checkout        — Create Stripe checkout session for users without subscription; ADMIN only; returns { checkoutUrl }
GET        /api/billing/portal          — Stripe billing portal redirect; ADMIN only
GET/POST   /api/guests                   — Guest list + create; optional pagination: ?skip=0&take=100 (max 500)
```


### API Error Handling

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

### Security Headers and XSS Prevention

**Content Security Policy (CSP)** — `next.config.js`:
- Applied globally to all routes via `headers()` function
- Blocks inline scripts from untrusted sources, prevents clickjacking, disables plugins
- Directives:
  - `default-src 'self'` — all resources from same origin by default
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — required by Next.js App Router for hydration
  - `style-src 'self' 'unsafe-inline'` — required by Tailwind CSS
  - `img-src 'self' data: blob: https:` — images from any HTTPS source
  - `font-src 'self' https://fonts.gstatic.com` — Google Fonts CDN (used by `next/font/google`)
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

---

## 8. Environment Variables

All variables are in `.env` and passed to the `app` container via `docker-compose.yml`.

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_PASSWORD` | Yes | PostgreSQL password. Used internally between containers — can be any strong random string. |
| `NEXTAUTH_SECRET` | Yes | Signs session tokens for Better Auth. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Yes | The URL the app is accessible at. **Must match the public domain** when behind Cloudflare Tunnel. Used for auth redirect validation and RSVP email links. Local: `http://192.168.x.x:3000`. Public: `https://wedding.yourdomain.com`. |
| `SEED_ADMIN_1_NAME` | Yes | Display name for first admin user (created on first run only). |
| `SEED_ADMIN_1_EMAIL` | Yes | Email for first admin. |
| `SEED_ADMIN_1_PASSWORD` | Yes | Password for first admin (stored bcrypt-hashed). |
| `SEED_ADMIN_2_*` / `SEED_ADMIN_3_*` | No | Optional second and third admin accounts (same three fields each). |
| `SMTP_HOST` | No | SMTP server hostname. If blank, emails log to console instead of sending. |
| `SMTP_PORT` | No | SMTP port. Default: `587`. |
| `SMTP_USER` | No | SMTP username / email address. |
| `SMTP_PASS` | No | SMTP password (use App Password for Gmail). |
| `SMTP_FROM` | No | From address in outgoing emails. Also the recipient for appointment reminders. |
| `EMAIL_RATE_LIMIT_MAX` | No | Max emails per user per window. Default: `50`. |
| `EMAIL_RATE_LIMIT_WINDOW_MINUTES` | No | Email rate limit window in minutes. Default: `60` (1 hour). |
| `RSVP_RATE_LIMIT_IP_MAX` | No | Max RSVP requests per IP per window. Default: `20`. |
| `RSVP_RATE_LIMIT_IP_WINDOW_SECONDS` | No | IP rate limit window in seconds. Default: `60` (1 minute). |
| `RSVP_RATE_LIMIT_TOKEN_MAX` | No | Max RSVP requests per token per window. Default: `10`. |
| `RSVP_RATE_LIMIT_TOKEN_WINDOW_SECONDS` | No | Token rate limit window in seconds. Default: `60` (1 minute). |
| `BULK_GUEST_LIMIT` | No | Max guests per bulk operation (status/meal). Default: `500`. |
| `BULK_EMAIL_LIMIT` | No | Max emails per bulk send. Default: `100`. |
| `REDIS_URL` | No | Redis connection URL for multi-instance rate limiting. If not set, falls back to in-memory. Example: `redis://localhost:6379`. |
| `GRACEFUL_TIMEOUT` | No | Graceful shutdown timeout in seconds. Default: `30`. Time to wait for in-flight requests before forcing shutdown on SIGTERM. |
| `AWS_ENDPOINT_URL` | S3 required | S3 endpoint for server-side ops (upload/delete/list). Local: `http://minio:9000` (Docker-internal). Railway: auto-injected by Railway Buckets. |
| `AWS_ACCESS_KEY_ID` | S3 required | S3 access key. Local: `minioadmin`. Railway: auto-injected. |
| `AWS_SECRET_ACCESS_KEY` | S3 required | S3 secret key. Local: `minioadmin`. Railway: auto-injected. |
| `AWS_S3_BUCKET_NAME` | S3 required | S3 bucket name. Local: `wedding-planner-uploads`. Railway: auto-injected. |
| `AWS_DEFAULT_REGION` | S3 required | S3 region. Local: `auto`. Railway: auto-injected. |
| `S3_FORCE_PATH_STYLE` | No | Set `true` for MinIO (path-style URLs). Leave unset for Railway Buckets/Tigris (virtual-hosted URLs). Default in docker-compose: `true`. |
| `S3_PUBLIC_ENDPOINT_URL` | No | Browser-accessible S3 endpoint for presigned URL generation. Overrides `AWS_ENDPOINT_URL` only for signing (not for upload/delete). Local: `http://192.168.6.249:9000`. Unset in Railway — presigned URLs use `AWS_ENDPOINT_URL` directly. |

**SMTP notes**: If `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are all blank, the email library returns `ok: true` but logs to console — the app does not error on missing SMTP config. This is useful during development.

**Rate limiting notes**: All rate limit settings have sensible defaults and are optional. The email rate limit applies per authenticated user (for RSVP email sending and payment reminders). The RSVP rate limit has two layers: per-IP (prevents scraping) and per-token (prevents enumeration). For multi-instance deployments, set `REDIS_URL` to share rate limit state across instances.

---

## 9. Production Deployment

### Cloudflare Tunnel
The app is exposed publicly via a Cloudflare Tunnel running on the Mac mini. This means:
- No open ports on the router
- HTTPS is handled by Cloudflare — the app itself runs over HTTP inside Docker
- `NEXTAUTH_URL` **must be set to the public Cloudflare domain** (e.g. `https://wedding.yourdomain.com`), not the local IP, otherwise:
  - Auth redirects after login fail
  - RSVP email links point to the internal IP

### Moving to a new server
1. Copy the entire project directory including `data/` folder
2. `data/postgres/` contains the full database
3. `data/minio/` contains all supplier file attachments (local dev only — in production these live in Railway Buckets)
4. Copy `.env` with the same secrets
5. Run `docker compose up --build` on the new server

### Static IP
Assign a static local IP to the Mac mini (via router DHCP reservation) so that `NEXTAUTH_URL` with a local IP doesn't change. Currently `192.168.6.249`.

### Rebuilding vs restarting
- **Code change** → `docker compose up --build` (rebuilds the image)
- **`.env` change only** → `docker compose up -d` (restarts with new env, no rebuild needed)
- **Database migration** → migrations run automatically on every container start via `entrypoint.sh`

### Better Auth Migration Notes

The app was migrated from next-auth v4 to Better Auth for Next.js 16/React 19 compatibility. Key changes:

1. **Auth library**: `src/lib/auth-better.ts` replaces `src/lib/auth.ts`
2. **Session storage**: Better Auth uses database sessions (`Session` table) instead of JWT-only
3. **Credentials storage**: Passwords are stored in `Account` table only (password field removed from `User` table)
4. **Password changes**: Update `Account.password` only (where `providerId = 'credential'`)
5. **New user creation**: Create `User` record with `accounts: { create: { providerId: "credential", accountId: email, password: hashed } }`
6. **Seed script**: `prisma/seed.ts` creates Account records for seeded users
7. **bcrypt cost**: Changed from 12 to 10 for consistency with Better Auth defaults

**Files affected by password changes:**
- `PUT /api/users/[id]/password` — updates Account table only
- `POST /api/users` — creates Account record for new users
- `prisma/seed.ts` — creates Account records
- `POST /api/auth/preflight` — reads password from Account relation
- `PATCH /api/profile` — reads password from Account relation

---

## 10. Pending / Future Improvements

Items discussed or considered but not yet built:

- **Bulk RSVP email send**: ✅ Built — checkboxes + bulk toolbar + 3-phase send dialog on `/guests`.
- **Multiple rooms**: The seating planner assumes one room (auto-created on first visit). The data model supports multiple rooms but the UI only shows one.
- **Seating capacity display for declined guests**: Declined guests on a table still count toward the capacity number (they physically occupy a seat assignment). This is intentional but could be made clearer.
- **RSVP status MAYBE**: ✅ Built — public RSVP form now has three-button Yes/Maybe/No toggle per event. Selecting Maybe saves `attendingX=null, attendingXMaybe=true`. Status auto-calculates: all-maybe → MAYBE, mix → PARTIAL. Confirmation screen has MAYBE variant (amber, HelpCircle icon). Event indicators in admin guest list show amber for maybe responses.
- **Payment reminder email recipient**: ✅ Built — `WeddingConfig.reminderEmail` field added (Settings → Notifications section). Used as recipient for payment reminders and appointment daemon. Falls back to `SMTP_FROM` if not set.
- **Attachment preview**: Attachments can be downloaded but not previewed in-browser (no PDF/image viewer).
- **Guest groups**: `groupName` is a free-text string, not a separate model. No group-level operations (e.g. "assign all Smiths to Table 3") are implemented.
- **Mobile layout**: Full mobile responsive layout implemented. RSVP page is mobile-first. Admin sidebar uses hamburger menu at < 768px. Guest list shows card layout on mobile. All forms have responsive grids. iOS input zoom prevented via 16px font-size rule in globals.css. Seating visual view shows a notice on mobile suggesting list view.

---

## 11. Admin Console

A separate Next.js 16 operator console for managing SaaS accounts. It is a **different repository and app** — never modify this SaaS app as part of admin console work.

| | Path |
|--|------|
| **Admin console app** | `/Users/simonblythe/wedding-root/wedding-planner-admin/` |
| **Admin console plan** | `/Users/simonblythe/wedding-root/ADMIN-CONSOLE-PLAN.md` |
| **Admin console repo** | `github.com/weddingsimonnatalie-ops/wedding-planner-admin` (private) |

### Shared infrastructure
The admin console shares this app's PostgreSQL database and S3 bucket, but connects with a different DB role (`admin_console_user`) that has `BYPASSRLS` privilege — allowing cross-tenant queries without `withTenantContext()`.

### AdminAuditLog model
`AdminAuditLog` in `prisma/schema.prisma` is used exclusively by the admin console to record operator actions (extend trial, force status, delete account, etc.). **Do not drop or modify this model** — it is not used by the SaaS app itself but is part of the shared schema.

### Migration ownership
**All migrations run from this repo only.** The admin console copies `prisma/schema.prisma` after migrations are applied here — it never runs `prisma migrate` itself. When adding a new model or field that the admin console needs, create the migration here first, then copy the updated schema across.

### Admin console build state (as of 2026-03-27)
Phases 0–4 complete locally (login, dashboard, accounts list, account detail, admin actions, S3 storage summary, audit log). Phase 5 (reporting + polish) and Railway deployment pending. See `ADMIN-CONSOLE-PLAN.md` for details.

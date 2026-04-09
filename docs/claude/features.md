# Feature Reference

Detailed documentation of every built feature. Load this when working on a specific feature's UI or behaviour.

---

## Authentication

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

## Role-based access control (RBAC)

Three roles defined in the `UserRole` Prisma enum:

| Role | Access |
|------|--------|
| `ADMIN` | Full access to everything |
| `VIEWER` | Read-only access; can see Guests, Seating, Suppliers, Payments, Planner, Dashboard; cannot edit anything |
| `RSVP_MANAGER` | Can edit guests and RSVP data; can complete tasks; cannot see Suppliers, Payments, or Settings |

**Permission definitions** — `src/lib/permissions.ts` (`can.*` helpers):
- `editGuests` / `deleteGuests` / `manageRsvp` / `importExportGuests` — ADMIN + RSVP_MANAGER
- `editSeating` — ADMIN only
- `editSuppliers` / `editPayments` — ADMIN only
- `editAppointments` — ADMIN only
- `manageUsers` / `manageSettings` — ADMIN only
- `accessSuppliers` / `accessPayments` — ADMIN + VIEWER (page-level access; RSVP_MANAGER redirected away)
- `editTasks` — ADMIN only (add / edit / delete tasks)
- `completeTasks` — ADMIN + RSVP_MANAGER (check off tasks)
- `completeAppointments` — ADMIN + RSVP_MANAGER (mark appointments as done)
- `viewTasks` — all roles
- `accessSettings` — ADMIN only
- `accessPlanner` / `editPlannerEvents` / `editPlannerTasks` / `completePlannerTasks` — planner-specific aliases

**Client-side hook** — `src/hooks/usePermissions.ts`:
- Reads role from `useSession()`; defaults to `"VIEWER"` when session is undefined/loading (safe default)
- Returns `{ role, can: { ... }, isAdmin, isViewer, isRsvpManager }`

**Read-only UI** — `src/components/ui/ReadOnlyBanner.tsx`:
- Blue info banner shown at the top of restricted pages/sections
- Used in: GuestList, GuestForm (guest detail), AppointmentsList, SupplierList, SupplierDetail, PaymentsList, SeatingListView

**Navigation filtering** — `src/components/LayoutShell.tsx`:
- Appointments/Suppliers/Payments/Tasks hidden from RSVP_MANAGER nav
- Settings hidden from VIEWER and RSVP_MANAGER nav
- Sidebar badges: Tasks (overdue + due this week), Appointments (next 7 days), Payments (overdue + due this month) — ADMIN + VIEWER only

**Page-level redirects** — server components check `getServerSession` and `redirect("/")` for unauthorised roles:
- `/settings`, `/settings/users`, `/settings/security` — ADMIN only
- `/suppliers`, `/suppliers/[id]` — `can.accessSuppliers`
- `/payments` — `can.accessPayments`
- `/appointments` — ADMIN + VIEWER only

**Dashboard widgets**:
- Budget, Payments, Supplier Status widgets hidden for RSVP_MANAGER (only ADMIN + VIEWER see finance)
- Visual seating tab hidden for non-ADMIN roles

**Role change note**: Role changes take effect on the user's next login (session token is not reissued on role change).

## Dashboard (`/`)

- Countdown to wedding day
- **Design**: Entrance animations (`animate-fade-in-up` with staggered delays), hover effects on cards, circular progress ring on countdown, section headers with accent underlines
- Quick stats:
  - **Guests accepted**: shows `accepted / total`; "% responded" = `(total - pending) / total` (guests who have any non-PENDING status, not just those who accepted)
  - **Seated**: shows `assigned / receptionEligible`; uses the same filter as the seating planner — `invitedToReception: true AND NOT (attendingReception: false AND rsvpStatus NOT IN ['DECLINED'])` — so admin-overridden guests are counted correctly; `assigned` applies the same filter with `tableId != null`
  - Budget % and supplier count
- RSVP donut chart (Accepted/Partial/Declined/Pending/Maybe segments)
- Meal choice bar chart
- Budget overview (contracted/paid/remaining with progress bar)
- Supplier status breakdown
- Upcoming and overdue payments list (with inline "Mark as Paid" and email reminder button) — "View all payments →" links to `/payments`
- Upcoming appointments and tasks in unified 2-column layout (appointments left, tasks right)
  - Both show icon container with type badge, title, metadata, category badge
  - Tasks show priority badge and due date; appointments show date/time and location
  - "Mark as Done" button with confirmation modal for both
  - Tasks include email reminder button
- Overdue payments auto-marked on page load

## Guests (`/guests`)

- **Header row**: title + "Add guest" button (editors only); rendered in `GuestList.tsx`
- **Stats bar**: displayed below the header, shows total/accepted/partial/declined/pending/maybe/unassigned; uses filtered counts when filters are active
- Full list with filter by RSVP status, group name (including "— No group —" for guests with no group, sent as `?group=none`), table-assigned status
- Per-guest coloured event indicator badges (first letter of each event name, e.g. R/C/W/E) — only enabled + invited events shown; green=attending, red=declined, amber=maybe, grey=no answer yet
- Pencil icon next to RSVP status badge when status has been manually overridden by admin (detected via `calculateRsvpStatus()` comparison)
- RSVP link with clipboard copy (HTTP fallback for non-secure contexts)
- CSV import with duplicate detection (see below) and export
- **Add guest modal**: "Add guest" button in the header row opens `GuestModal` — a modal overlay (no page navigation). On save, calls `router.refresh()` and `triggerRefresh()`, then closes. The `/guests/new` full-page route no longer exists.
- **Toolbar layout** (desktop): `[Template] [Export] [Import] [Add guest]` — Template/Export/Import hidden on mobile; Add guest visible on all screen sizes
- **Quick select and Print toolbar** (desktop): `[Quick select ▾] [Print]` — below the header, before filters
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
  2. Sending: real-time progress bar + sent/error lists (300 ms delay between sends); skips guests who have unsubscribed
  3. Done: summary with sent/failed/skipped/unsubscribed counts; closes and clears selection
- **Bulk set status** — "Set Status ▾" dropdown in bulk toolbar; shows all 5 statuses with coloured dots; clicking a status opens a confirmation dialog listing selected guest names; calls `POST /api/guests/bulk-status` with `{ guestIds, rsvpStatus }`; uses `prisma.guest.updateMany()` — same field as single-guest PATCH override; pencil icon appears automatically on bulk-overridden guests
- **Bulk set meal** — "Set Meal ▾" dropdown in bulk toolbar; shows all active meal options + "— No choice —" to clear; confirmation dialog lists affected guests; note shown if any selected guests are not invited to reception (they are excluded from the update); calls `POST /api/guests/bulk-meal` with `{ guestIds, mealChoice }`; only sends reception-eligible guest IDs; toast confirms count updated

## Print Guest List (`/guests` → Print dropdown)

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

## CSV Import (`/guests` → Import CSV)

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

## Guest detail/edit (`/guests/[id]`)

- Full edit form (name, email, phone, group, child flag, event invitations, notes)
- **Save behaviour**: "Save changes" stays on the page — it does not navigate away. After a successful PUT, the form immediately refetches fresh data from `GET /api/guests/:id` (with `cache: "no-store"`) and updates all form state via `syncFromFresh()`. A "Changes saved" banner appears briefly. `router.refresh()` is also called to keep the RSC cache consistent.
- **Unsubscribed banner**: if `unsubscribedAt` is set, shows grey banner above form: "This guest has unsubscribed from emails. They will not receive reminder emails. You can still contact them directly if needed." Resend button is disabled.
- RSVP & Meal section:
  - Read-only event responses (all enabled events the guest is invited to) — reads from `localGuest` state (updated after each save), not from the initial server-rendered prop
  - Auto-calculated overall RSVP status badge (green/amber/orange/red/grey)
  - "Override ▾" dropdown — saves immediately via PATCH, then refetches and syncs all state; no form submit required. Sets `attendingX` AND clears `attendingXMaybe` for all 4 events so badges and status calculation are always consistent after override.
  - **Admin override indicator**: if stored `rsvpStatus` differs from what `calculateRsvpStatus()` would compute, an amber "Manually set" warning with triangle icon appears next to the badge — derived from `localGuest` state so updates immediately after override or save
  - "Resend RSVP email" ghost button (with confirm dialog) — disabled if guest has unsubscribed
- Meal & Dietary section (two-column: meal choice dropdown + dietary notes textarea)
- Seating section (shown when guest is assigned to a table):
  - Shows table name
  - Seat number dropdown (1..capacity); taken seats disabled with occupant name shown
  - Saves immediately via PATCH on change (no form submit required)
- RSVP link section at bottom (copy button with HTTP fallback)
- rsvpStatus is auto-calculated from per-event answers on PUT; override-only via PATCH
- `GuestForm` maintains `localGuest` state (initialised from server prop, updated by `syncFromFresh()` after every save/override) so all reactive reads stay fresh without page navigation

## Public RSVP (`/rsvp/[token]`)

- No login required, accessed via unique token
- Shows couple name and date at top
- Per-event **Yes / Maybe / No** three-button toggle (only for enabled events the guest is invited to; event names use the wedding's configured labels)
  - Event location shown as small grey text under the event name when set (e.g. "St Mary's Church, London")
  - Yes → `attendingX=true, attendingXMaybe=false`
  - Maybe → `attendingX=null, attendingXMaybe=true`
  - No → `attendingX=false, attendingXMaybe=false`
- **Meal choice dropdown** (only if invited to reception/meal event, only if meal options configured)
- **Per-event meal selection**: Each event with meals enabled shows its own meal dropdown (e.g., "Rehearsal Dinner meal", "Wedding Breakfast meal")
- Dietary notes textarea (shared across all events)
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

## Seating Planner (`/seating`)

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

**Known limitation**: The seating planner assumes one room (auto-created on first visit). The data model supports multiple rooms but the UI only shows one.

## Print Designer (`/seating/print-designer`)

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

## Suppliers (`/suppliers`, `/suppliers/[id]`)

- Supplier list with status filter (Enquiry/Quoted/Booked/Complete/Cancelled) and category filter
- **Header row**: title + action buttons (ADMIN only for edit actions)
  - `[Template] [Export] [Import] [Add Supplier]` — Template/Export/Import hidden on mobile; Add Supplier visible on all screen sizes
- **CSV import/export**:
  - **Export CSV**: downloads all suppliers with columns — Name, Contact Name, Email, Phone, Website, Category, Status, Contract Value, Contract Signed, Notes
  - **Import CSV**: upload flow with preview, duplicate detection by supplier name (case-insensitive), and per-duplicate actions (Skip/Update existing/Import as new)
  - **Template**: downloads a sample CSV with headers and an example row
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

## Supplier CSV Import (`/suppliers` → Import CSV)

- Upload flow: parse → preview → confirm
- **Template download**: sample CSV with headers and example row (Name, Contact Name, Email, Phone, Website, Category, Status, Contract Value, Contract Signed, Notes)
- Preview shows three categories:
  - **New suppliers** (green) — will be created
  - **Duplicates** (amber) — matched by supplier name (case-insensitive); shows incoming CSV data vs existing DB record side-by-side
  - **Errors** (red) — missing name field; always skipped
- Per-duplicate action (default: Skip):
  - **Skip** — do nothing
  - **Update existing** — overwrite existing record with non-empty CSV fields; category matched by name (warning shown for unknown categories)
  - **Import as new** — create a second supplier with the same name
- Global **Skip all** / **Update all** buttons above the duplicate list
- Category matching: case-insensitive lookup against existing planning categories; unknown categories show a warning in the preview
- **Auto-create categories**: unknown categories in CSV are created as new PlanningCategory rows during confirm; `planning-categories` cache is invalidated so they appear immediately in Settings
- Status values accepted: Enquiry/Quoted/Booked/Cancelled/Complete (case-insensitive, common variants like "Quote" also accepted)
- Result summary shows: created / updated / skipped / errors / categoriesCreated
- API: `POST /api/suppliers/import` — preview mode returns `existingSupplier` and `categoryId` for each row; confirm mode accepts `duplicateActions: Record<string, 'skip'|'update'|'create'>` keyed by CSV line number
- Export API: `GET /api/suppliers/export` — returns CSV file with all suppliers

## Payments (`/payments`)

- **Header row**: title + "Add payment" button (ADMIN only); rendered in `PaymentsList.tsx`
- Cross-supplier view of all payments — the single place to manage the full payment schedule
- **Design**: Entrance animations on stats grid, hover effects on cards, `tabular-nums` for number alignment
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

## Planner (`/planner`)

Unified view combining appointments (Events) and tasks. `/appointments` and `/tasks` both redirect here.

**Components:** `src/components/planner/PlannerClient.tsx` (unified list), `PlannerItemModal.tsx` (add/edit modal), `PlannerEventsTab.tsx` (standalone events list, not used by main page), `PlannerTasksTab.tsx` (standalone tasks list, not used by main page), `types.ts` (shared types).

**Unified chronological list** — fetches both `/api/appointments` and `/api/tasks` in parallel, then groups:
- **Overdue** (red header) — tasks with a past due date, not completed
- **Upcoming** (blue header) — future events + tasks with future due dates, interleaved by date, sorted soonest-first
- **No due date** (grey header) — tasks without a due date, not completed
- **Past & completed** (collapsible) — past events + completed tasks, newest-first

**Visual differentiation:**
- Events: blue left border + "Event" pill (CalendarDays icon); shows date/time, location, supplier link
- Tasks: standard card + "Task" pill + priority badge; shows due date label, assignee, complete/reminder/edit/delete actions

**Add / edit modal (`PlannerItemModal`):**
- Type toggle (Event / Task) shown for new items; type fixed when editing
- Event fields: title, category, date & time (required), location, email reminder, supplier, notes
- Task fields: title, category, priority, due date, assigned to, supplier, notes, recurring section
- Recurring tasks: Daily / Weekly / Fortnightly / Monthly + optional end date; completing auto-creates next occurrence

**Events (appointments):**
- Optional email reminder (N days before); reminder daemon checks hourly
- Categories from shared PlanningCategory pool
- Supplier link on card

**Tasks:**
- Grouped as above; inline complete / mark-not-done / email reminder
- Swipe-to-delete on mobile
- **Supplier tasks section**: still embedded in `/suppliers/[id]` via `SupplierTasksSection.tsx`
- **Dashboard widget**: upcoming and overdue tasks visible to all roles

**Nav badge**: combined tasks + appointments count on "Planner" nav item (CalendarCheck icon).

**Refresh coordination**: `triggerRefresh()` from `useRefresh()` context; list re-fetches via `refreshToken` dep.

**Role permissions:**
| Role | View | Complete tasks | Add/Edit/Delete |
|------|------|----------------|-----------------|
| ADMIN | ✅ | ✅ | ✅ |
| RSVP_MANAGER | ✅ (tasks only) | ✅ | ❌ |
| VIEWER | ✅ | ❌ | ❌ |

## Timeline (`/timeline`)

- **Header row**: title + "Add event" button (ADMIN only); rendered in `TimelineList.tsx`
- **Design**: Staggered entrance animations on event cards, hover effects
- Chronological list of wedding day events sorted by start time
- Each event shows: time, duration, title, location, vendor badge (if linked), notes
- **Category badges**: colour-coded labels from configurable Timeline Categories
- **Add / edit modal**: title, start time (datetime picker), duration (dropdown), category (dropdown from Settings), location, vendor (dropdown from suppliers), notes
- **Print view**: opens new window with clean A4 layout; time, duration, title, location, notes columns; category badge with colour
- **Empty state**: "No events yet" with description for ADMIN
- **Timeline categories**: configurable (Settings → Categories → Timeline Categories) with name, colour, sort order, active flag
  - Default categories seeded on migration: Prep, Transport, Ceremony, Photo, Reception, Food, Music, General
  - Deleting a category nullifies `categoryId` on events (events become "Other")

**Role permissions for timeline:**
| Role | View | Add/Edit/Delete |
|------|------|-----------------|
| ADMIN | ✅ | ✅ |
| VIEWER | ✅ | ❌ |
| RSVP_MANAGER | ✅ | ❌ |

## Music (`/music`)

Music playlist management for wedding planning. Create custom playlists, add tracks via Deezer search or manual entry.

**Playlist features:**
- Create/delete playlists with custom names (e.g., "Ceremony entrance", "First dance", "Party hits")
- Optional description for each playlist
- Tracks sorted by `sortOrder` within each playlist

**Track features:**
- Add tracks manually or via Deezer search
- **Deezer integration**: Free API, no authentication required; search returns title, artist, duration, album art, ISRC
- Fields: title (required), artist, duration (MM:SS or seconds), URL, notes, album art, Deezer URL, ISRC
- Album art thumbnails displayed in track list (40x40)
- Edit/delete individual tracks

**CSV Import/Export:**
- **Export**: Downloads all playlists and tracks as CSV
- **Import**: Upload CSV with preview showing new tracks, duplicates (existing tracks), and errors
- CSV format: `Playlist Name, Playlist Description, Track Title, Artist, Duration (seconds), URL, Notes`
- Duration accepts seconds (`200`) or MM:SS format (`3:20`)
- Duplicate detection: tracks matched by title + artist within playlist

**Deezer attribution:**
- Logo displayed on music page (required by Deezer API guidelines)
- Links to deezer.com

**Role permissions for music:**
| Role | View | Add/Edit/Delete |
|------|------|-----------------|
| ADMIN | ✅ | ✅ |
| VIEWER | ✅ | ❌ |
| RSVP_MANAGER | ✅ | ❌ |

**Components:** `src/components/music/MusicList.tsx`, `src/components/music/PlaylistModal.tsx`, `src/components/music/TrackModal.tsx`, `src/components/music/MusicCsvImportModal.tsx`

**API routes:**
- `GET /api/playlists` — list all playlists with track counts
- `POST /api/playlists` — create playlist
- `GET /api/playlists/[id]` — get playlist with tracks
- `PUT /api/playlists/[id]` — update playlist
- `DELETE /api/playlists/[id]` — delete playlist
- `POST /api/playlists/[id]/tracks` — add track
- `PUT /api/tracks/[id]` — update track
- `DELETE /api/tracks/[id]` — delete track
- `GET /api/music/search` — Deezer search (`?q=query`)
- `GET /api/music/export` — export CSV
- `POST /api/music/import` — import CSV (preview + confirm)

## Settings

Organized into 4 tabs accessible to ADMIN only:
- **General tab**: Wedding Details (couple name, date), Notifications (reminder email), Session Timeout (inactivity timeout + warning time), Wedding Colour Theme (palette picker), **Event Names + Locations** (enable/disable + rename + per-event location for all 4 events)
- **Meals tab**: Meal Options — event tabs show meal choices for each event with meals enabled; add/edit/deactivate per-event; "Meals on/Meals off" toggle in Event Names settings controls which events have meal selection
- **Categories tab**: Supplier Categories, Appointment Categories, Task Categories, Timeline Categories — each with add/edit/delete/reorder
- **Users tab**: User Management (inline) + link to Security page

**Event Names + Locations** (Settings → General → Event Names):
- Toggle each event on/off per wedding; rename to custom labels (e.g. "Rehearsal Dinner" → "Pre-Wedding Dinner")
- Set a per-event location (optional, max 200 chars) — shown to guests on the RSVP form under the event name
- Rehearsal Dinner is disabled by default; enabling it shows it throughout the app (guest list badges, RSVP form, guest edit form, CSV import/export)
- Existing guests have `invitedToRehearsalDinner=false` by default — must be enabled per-guest after turning the event on
- Component: `src/components/settings/EventNamesSettings.tsx`

Other settings pages:
- **Profile** (`/settings/profile`): change own display name and email
- **Security** (`/settings/security`): change password, TOTP 2FA setup/disable, backup codes, trusted devices management
- `/settings/users` redirects to `/settings?tab=users` for deep linking

## Billing (`/billing`)

Subscription management with provider choice (Stripe or PayPal). Users select their payment method at registration.

**Registration flow:**
- Payment method selector: "Card (Stripe)" or "PayPal"
- Stripe: redirects to Stripe Checkout for card collection
- PayPal: redirects to PayPal approval flow, then captures subscription ID on return

**Billing page:**
- Auto-syncs from provider on page load (recovers from missed webhooks)
- Shows subscription status badge: Trial / Active / Payment overdue / Cancelled
- Stripe users: "Manage subscription in Stripe" button → Stripe billing portal
- PayPal users:
  - Active/Trialing: "Cancel PayPal subscription" button with confirmation
  - Cancelled: "Reactivate subscription" button
  - Past due: Payment overdue warning + reactivate button
- Download my data: exports all wedding data as JSON

**Subscription lifecycle:**
- Trial: 14 days free (configurable via `TRIAL_DAYS`)
- Active: subscription active, all features enabled
- Past due: payment failed, 7-day grace period (configurable via `GRACE_PERIOD_DAYS`)
  - Email sending and file uploads blocked during grace period
  - Full access otherwise
- Cancelled: subscription terminated, data retained for 90 days (configurable via `DATA_RETENTION_DAYS`)

**Feature gates (applied via `requireRole()` in `src/lib/api-auth.ts`):**
- `TRIALING`: Full access except email/file uploads
- `ACTIVE`: Full access
- `PAST_DUE` (within grace): Full access except email/file uploads
- `PAST_DUE` (expired grace): Blocked, redirect to `/billing/suspended`
- `CANCELLED`: Blocked, redirect to `/billing/suspended`

**Provider-specific behavior:**
- **Stripe**: Trial can be ended early via "Activate subscription now" button (sets `trial_end: "now"`); billing portal for payment method changes
- **PayPal**: Trial activates automatically; reactivation available for suspended/cancelled subscriptions via PayPal API; no billing portal (payment method changes via paypal.com)

**Webhooks:**
- Stripe: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`
- PayPal: `BILLING.SUBSCRIPTION.CREATED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED`
- All webhooks are idempotent (event IDs stored to prevent duplicate processing)

**Nightly reconciliation (Inngest cron jobs):**
- `stripe-reconcile`: 2 AM UTC — syncs all non-cancelled Stripe subscriptions
- `paypal-reconcile`: 2:30 AM UTC — syncs all non-cancelled PayPal subscriptions

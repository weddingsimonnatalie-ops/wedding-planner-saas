# Data Model Summary

Key fields and relationships. Authoritative source is `prisma/schema.prisma`.

---

## User

Admin accounts. Optional `twoFactorSecret` (base32 TOTP seed). Related `BackupCode` records (hashed, single-use). Has `sessions` and `accounts` relations for Better Auth.

## Account (Better Auth)

Stores authentication credentials. Key fields:
- `userId` — FK to User
- `providerId` — always `"credential"` for this app
- `accountId` — email address
- `password` — bcrypt-hashed password (cost 10)

**Important**: When changing a user's password, you MUST update `Account.password` (where `providerId = 'credential'`). The `Account` table is what Better Auth reads for credential authentication. The `User` table does NOT have a password field.

**New user creation**: Create `User` record with `accounts: { create: { providerId: "credential", accountId: email, password: hashed } }`

**Files affected by password changes:**
- `PUT /api/users/[id]/password` — updates Account table only
- `POST /api/users` — creates Account record for new users
- `prisma/seed.ts` — creates Account records
- `POST /api/auth/preflight` — reads password from Account relation
- `PATCH /api/profile` — reads password from Account relation

## WeddingConfig

Singleton (`id = 1`). Couple name, date. `themeHue Int @default(330)` — HSL hue (0–359) for the app colour theme; default 330 = blush pink. The hue is injected as `--primary` and `--ring` CSS variables in the dashboard layout and public RSVP page. All Tailwind `bg-primary`, `text-primary`, `border-primary` classes respond to this variable automatically. Emails use `hslToHex(themeHue, 60, 55)` since email clients don't support CSS variables.

**Configurable event names + locations** (on `Wedding` model, not a separate table):
- `ceremonyEnabled Boolean @default(true)` / `ceremonyName String @default("Ceremony")` / `ceremonyLocation String?`
- `mealEnabled Boolean @default(true)` / `mealName String @default("Wedding Breakfast")` / `mealLocation String?`
- `eveningPartyEnabled Boolean @default(true)` / `eveningPartyName String @default("Evening Reception")` / `eveningPartyLocation String?`
- `rehearsalDinnerEnabled Boolean @default(false)` / `rehearsalDinnerName String @default("Rehearsal Dinner")` / `rehearsalDinnerLocation String?`

**Per-event meal configuration** (on `Wedding` model):
- `ceremonyMealsEnabled Boolean @default(false)`
- `mealMealsEnabled Boolean @default(true)`
- `eveningPartyMealsEnabled Boolean @default(false)`
- `rehearsalDinnerMealsEnabled Boolean @default(false)`

Use `getEvents(wedding)` from `src/lib/eventNames.ts` everywhere — never hardcode event names or assume exactly 3 events. The `meal` key maps to `reception` DB fields; `eveningParty` maps to `afterparty` DB fields. Each `EventConfig` returned by `getEvents()` includes a `location: string | null` field and `mealsEnabled: boolean` field.

## Guest

Core guest record. Key fields:
- `rsvpToken` — unique, used as the public RSVP URL slug
- `rsvpStatus` — `PENDING | ACCEPTED | PARTIAL | DECLINED | MAYBE`
- `invitedToCeremony/Reception/Afterparty/RehearsalDinner` — which events invited to (rehearsalDinner defaults false)
- `attendingCeremony/Reception/Afterparty/RehearsalDinner` — actual responses (nullable until answered)
- `attendingCeremonyMaybe/ReceptionMaybe/AfterpartyMaybe/RehearsalDinnerMaybe` — maybe state per event (`BOOLEAN NOT NULL DEFAULT false`)
- `mealChoice` — legacy field, references `MealOption.id` for backwards compatibility (still populated from "meal" event choice)
- `dietaryNotes` — shared dietary requirements across all events
- `mealChoices` — relation to `GuestMealChoice` for per-event meal selections
- `tableId` — nullable FK to `Table`
- `seatNumber` — nullable `Int`; seat position at the assigned table (1..capacity)
- `isManualOverride` — `Boolean @default(false)`; set `true` by admin PATCH/bulk-status, `false` by public RSVP; drives the pencil icon in the guest list
- `unsubscribedAt` — nullable `DateTime`; set when guest clicks unsubscribe link in RSVP email; guest will be skipped from future email sends

## MealOption

Configurable meal choices per event. Key fields:
- `eventId` — which event this meal belongs to (`ceremony`, `meal`, `eveningParty`, `rehearsalDinner`)
- `name`, `course`, `description` — meal details
- `isActive` — whether shown on RSVP forms
- `sortOrder` — display order within event

## GuestMealChoice

Per-event meal selections. Links a guest to a meal option for a specific event:
- `guestId` — FK to Guest
- `eventId` — which event (`ceremony`, `meal`, `eveningParty`, `rehearsalDinner`)
- `mealOptionId` — FK to MealOption (nullable if no choice made)
- Unique constraint on `(guestId, eventId)` — one meal choice per event per guest

## Room / Table / RoomElement

Seating planner. One Room per app (auto-created on first visit). Tables have shape (ROUND/RECTANGULAR/OVAL), capacity, canvas position, and visual fields:
- `width`, `height` (`Float`) — table size on the canvas
- `locked` (`Boolean`) — prevents moving/resizing in visual view
- `colour` (`String`) — hex colour for canvas fill (12 presets available)
- `notes` (`String?`) — optional notes shown in list view card header and properties panel; ℹ icon shown on canvas
- `orientation` — `HORIZONTAL | VERTICAL` for Plan Designer view

RoomElements are decorative (Stage, Bar, etc.) with `width`/`height` and:
- `locked` (`Boolean`) — prevents moving/resizing

## PlanningCategory

A single shared category pool used by Suppliers, Appointments, and Tasks. Fields: name, colour, sortOrder, isActive, allocatedAmount (optional, used for budget tracking). Managed from Settings → Categories as a single flat list. Deleting a category with items assigned returns 409 (force=true to nullify and delete).

## Supplier

Suppliers have status (ENQUIRY/QUOTED/BOOKED/COMPLETE/CANCELLED), contract value, and optional `categoryId` FK to `PlanningCategory`.

## Payment

Belongs to Supplier. Has label, amount, dueDate, paidDate, status (PENDING/PAID/OVERDUE/CANCELLED). Overdue auto-marking happens on dashboard load. Supports optional receipt attachment (PDF/image).

## Attachment

Belongs to Supplier. `storedAs` is the UUID-renamed filename on disk. `filename` is the original display name. Optional `paymentId` links to a Payment for receipt attachments (shown in both supplier attachments list and payment detail).

## Appointment

Appointments have date, location, notes, optional supplier link, optional reminderDays, optional `categoryId` FK to `PlanningCategory`. `reminderSent` prevents double-sending.

## Task

Tasks track wedding to-do items. Key fields:
- `title` — required
- `priority` — `HIGH | MEDIUM | LOW`
- `dueDate` — optional; drives grouping (Overdue / Due this week / Upcoming / No date)
- `isCompleted` / `completedAt` — completion state
- `categoryId` — optional FK to `PlanningCategory`
- `assignedToId` — optional FK to `User`
- `supplierId` — optional FK to `Supplier`
- `isRecurring` / `recurringInterval` (`DAILY | WEEKLY | FORTNIGHTLY | MONTHLY`) / `recurringEndDate` — recurring config
- When a recurring task is completed, the API creates the next occurrence automatically (if before `recurringEndDate`)

## TimelineEvent / TimelineCategory

Timeline events track the wedding day schedule. Key fields:
- `title` — required
- `startTime` — when the event starts
- `durationMins` — duration in minutes (default 30)
- `location` — optional location string
- `notes` — optional additional details
- `categoryId` — optional FK to `TimelineCategory` (nullable if category deleted)
- `supplierId` — optional FK to `Supplier` (for vendor-linked events)

`TimelineCategory` has name, colour, sortOrder, isActive. Events inherit colour from their category for visual display. Deleting a category nullifies `categoryId` on affected events.

## Wedding

Multi-tenant wedding record. Key billing fields:
- `billingProvider` — `STRIPE | PAYPAL` (default: `STRIPE`)
- `stripeCustomerId` — Stripe customer ID (for Stripe users)
- `stripeSubscriptionId` — Stripe subscription ID
- `paypalSubscriptionId` — PayPal subscription ID (for PayPal users)
- `subscriptionStatus` — `TRIALING | ACTIVE | PAST_DUE | CANCELLED | PAUSED`
- `currentPeriodEnd` — next billing date
- `trialEndsAt` — when trial ends
- `gracePeriodEndsAt` — when grace period expires (PAST_DUE status)
- `cancelledAt` — when subscription was cancelled
- `deleteScheduledAt` — when data will be deleted (90 days after cancellation)

The `subscriptionStatus` enum is provider-agnostic — both Stripe and PayPal map to the same values.

## StripeEvent / PayPalEvent

Idempotency tables for webhook processing. Store processed event IDs to prevent duplicate handling. Both have the same structure: `id`, `eventId` (unique), `eventType`, `processedAt`.

## AdminAuditLog

Used exclusively by the admin console to record operator actions (extend trial, force status, delete account, etc.). **Do not drop or modify this model** — it is not used by the SaaS app itself but is part of the shared schema.

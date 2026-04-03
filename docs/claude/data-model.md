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

Singleton (`id = 1`). Couple name, date, venue name/address. `themeHue Int @default(330)` — HSL hue (0–359) for the app colour theme; default 330 = blush pink. The hue is injected as `--primary` and `--ring` CSS variables in the dashboard layout and public RSVP page. All Tailwind `bg-primary`, `text-primary`, `border-primary` classes respond to this variable automatically. Emails use `hslToHex(themeHue, 60, 55)` since email clients don't support CSS variables.

## Guest

Core guest record. Key fields:
- `rsvpToken` — unique, used as the public RSVP URL slug
- `rsvpStatus` — `PENDING | ACCEPTED | PARTIAL | DECLINED | MAYBE`
- `invitedToCeremony/Reception/Afterparty` — which events invited to
- `attendingCeremony/Reception/Afterparty` — actual responses (nullable until answered)
- `attendingCeremonyMaybe/ReceptionMaybe/AfterpartyMaybe` — maybe state per event (`BOOLEAN NOT NULL DEFAULT false`)
- `mealChoice` — foreign-key-like string referencing `MealOption.id`
- `tableId` — nullable FK to `Table`
- `seatNumber` — nullable `Int`; seat position at the assigned table (1..capacity)
- `isManualOverride` — `Boolean @default(false)`; set `true` by admin PATCH/bulk-status, `false` by public RSVP; drives the pencil icon in the guest list
- `unsubscribedAt` — nullable `DateTime`; set when guest clicks unsubscribe link in RSVP email; guest will be skipped from future email sends

## MealOption

Configurable meal choices (name, course, description, active flag, sort order).

## Room / Table / RoomElement

Seating planner. One Room per app (auto-created on first visit). Tables have shape (ROUND/RECTANGULAR/OVAL), capacity, canvas position, and visual fields:
- `width`, `height` (`Float`) — table size on the canvas
- `locked` (`Boolean`) — prevents moving/resizing in visual view
- `colour` (`String`) — hex colour for canvas fill (12 presets available)
- `notes` (`String?`) — optional notes shown in list view card header and properties panel; ℹ icon shown on canvas
- `orientation` — `HORIZONTAL | VERTICAL` for Plan Designer view

RoomElements are decorative (Stage, Bar, etc.) with `width`/`height` and:
- `locked` (`Boolean`) — prevents moving/resizing

## Supplier / SupplierCategory

Suppliers have status (ENQUIRY/QUOTED/BOOKED/COMPLETE/CANCELLED), contract value, and optional category. Categories have name, colour, sort order.

## Payment

Belongs to Supplier. Has label, amount, dueDate, paidDate, status (PENDING/PAID/OVERDUE/CANCELLED). Overdue auto-marking happens on dashboard load. Supports optional receipt attachment (PDF/image).

## Attachment

Belongs to Supplier. `storedAs` is the UUID-renamed filename on disk. `filename` is the original display name. Optional `paymentId` links to a Payment for receipt attachments (shown in both supplier attachments list and payment detail).

## Appointment / AppointmentCategory

Appointments have date, location, notes, optional supplier link, optional reminderDays. `reminderSent` prevents double-sending.

## Task / TaskCategory

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

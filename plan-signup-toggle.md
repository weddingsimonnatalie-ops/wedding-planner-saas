# Plan: Signup Enable/Disable Toggle

Allow the admin console to enable or disable new user registration on the SaaS
app without touching environment variables or redeploying.

---

## Architecture

A singleton `AppConfig` row in the shared database holds the setting. Both apps
access the same database so no API proxying is needed — the admin app reads and
writes `AppConfig` directly. The SaaS app reads it on each registration attempt.

---

## Phase 1 — Schema: add AppConfig model

**Files:** `prisma/schema.prisma`, new manual SQL migration

Add a singleton model with a fixed primary key (`"global"`) so only one row can
ever exist:

```prisma
model AppConfig {
  id                   String  @id @default("global")
  registrationsEnabled Boolean @default(true)
}
```

Manual SQL migration (Node 23 workaround):
```sql
CREATE TABLE "AppConfig" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "registrationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- Seed the single row so the app never has to handle a missing row
INSERT INTO "AppConfig" ("id", "registrationsEnabled") VALUES ('global', true)
ON CONFLICT ("id") DO NOTHING;
```

Run `prisma generate` in both apps after updating both schemas.

---

## Phase 2 — SaaS app: guard the registration endpoint

**File:** `src/app/api/register/route.ts`

At the very top of the POST handler (before any other logic), check the config:

```ts
const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
if (!config?.registrationsEnabled) {
  return NextResponse.json(
    { error: "New registrations are currently disabled." },
    { status: 403 }
  );
}
```

Using `findUnique` with a known primary key is effectively a primary-key lookup —
fast and no index needed. No caching required; registration is infrequent.

---

## Phase 3 — SaaS app: show message on register page

**File:** `src/app/register/page.tsx`

The register page is a server component. Fetch the config server-side and pass a
`registrationsEnabled` prop to `RegisterClient`:

```ts
const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
const registrationsEnabled = config?.registrationsEnabled ?? true;
```

In `RegisterClient.tsx`, if `registrationsEnabled` is false, render a notice
instead of the form:

```
New accounts are not currently being accepted.
Please check back later.
```

This prevents users from filling in the form only to hit a 403 — a better
experience than a form error.

---

## Phase 4 — Admin app: Settings page toggle

**Files:**
- `app/(admin)/settings/page.tsx` — add a new "System" card that shows the
  current state and renders the toggle component
- New component: `components/SignupToggle.tsx` — client component with the
  toggle button and inline feedback
- New route: `app/api/system/settings/route.ts` — PATCH endpoint to update
  `registrationsEnabled`

### Settings page
The page is a server component. Add a DB query to read the current config:
```ts
const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
```

Render a new card above the existing cards:
```
System
  New registrations   [Enabled ✓]  / [Disabled]   <toggle button>
```

### SignupToggle component
- Receives `registrationsEnabled: boolean` as a prop
- Single button: shows "Disable signups" when enabled, "Enable signups" when
  disabled
- POST to `PATCH /api/system/settings` with `{ registrationsEnabled: !current }`
- On success: `router.refresh()` to re-render the server component with fresh data
- Confirm modal before disabling (not before enabling — enabling is safe)

### PATCH /api/system/settings
- Auth: `requireAuth()`
- Rate limit: `checkAdminRateLimit(operatorId)`
- Body: `{ registrationsEnabled: boolean }`
- Upsert the AppConfig row (handles missing row gracefully):
  ```ts
  await prisma.appConfig.upsert({
    where: { id: "global" },
    create: { id: "global", registrationsEnabled: value },
    update: { registrationsEnabled: value },
  });
  ```
- Write an `adminAuditLog` entry (action: `"TOGGLE_REGISTRATIONS"`)
- Return `{ registrationsEnabled: value }`

---

## Phase 5 — Admin app: schema sync + prisma generate

Copy the new `AppConfig` model into the admin app's `prisma/schema.prisma` and
run `prisma generate`. No migration needed in admin app (it never runs
migrations — migrations are owned by the SaaS app).

---

## Execution order

```
Phase 1  — schema + migration (SaaS app)
Phase 5  — schema sync + generate (admin app)    ← can run alongside Phase 1
Phase 2  — register API guard (SaaS app)
Phase 3  — register page UI (SaaS app)
Phase 4  — admin Settings toggle                 ← depends on Phase 1 & 5
```

Phases 2 and 3 have no dependencies on Phase 4 and can be built in parallel
with it once Phase 1 is done.

---

## Out of scope

- Per-plan invite codes or waitlist management
- Disabling existing user login (separate concern)
- Email notification to queued users when signups re-enable

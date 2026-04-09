# Dashboard Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 selectable dashboard layout presets (Classic, Actions First, Budget Focus, Organized) so users can choose the card ordering that matches their priorities.

**Architecture:** Each dashboard section is extracted into a standalone React component. A preset is an array of rows, each row containing section IDs and optional column spans. The `DashboardClient` reads the user's `dashboardLayout` preference and renders sections accordingly. A layout picker popover on the dashboard itself (not buried in settings) gives all users access, including non-admins.

**Tech Stack:** Next.js 16 App Router, Prisma 6, React, Tailwind CSS

---

## File Structure

### New files
- `src/components/dashboard/sections/DashboardQuickStats.tsx` — Countdown + 3-4 stat cards
- `src/components/dashboard/sections/DashboardGuestSummary.tsx` — RSVP breakdown bars
- `src/components/dashboard/sections/DashboardBudgetOverview.tsx` — Contracted/Paid/Remaining
- `src/components/dashboard/sections/DashboardBudgetCategories.tsx` — Category progress bars
- `src/components/dashboard/sections/DashboardMeals.tsx` — Meal choice bars
- `src/components/dashboard/sections/DashboardSuppliers.tsx` — Status pill list
- `src/components/dashboard/sections/DashboardPayments.tsx` — Overdue/upcoming payments list
- `src/components/dashboard/sections/DashboardAppointments.tsx` — Upcoming appointments list
- `src/components/dashboard/sections/DashboardTasks.tsx` — Overdue/due-soon tasks list
- `src/components/dashboard/DashboardPresets.tsx` — Preset config + type definitions
- `src/components/dashboard/LayoutPicker.tsx` — Popover to select layout
- `prisma/migrations/20260409150000_add_dashboard_layout/migration.sql` — Add dashboardLayout column

### Modified files
- `prisma/schema.prisma` — Add `dashboardLayout` field to User model
- `src/lib/server-context.ts` — Add `dashboardLayout` to ServerContext type and query
- `src/app/(dashboard)/layout.tsx` — Fetch dashboardLayout, pass to WeddingProvider
- `src/context/WeddingContext.tsx` — Add dashboardLayout to context
- `src/app/(dashboard)/page.tsx` — Pass dashboardLayout prop to DashboardClient
- `src/components/dashboard/DashboardClient.tsx` — Replace inline sections with preset-driven rendering, add LayoutPicker
- `src/app/api/profile/route.ts` — Accept dashboardLayout in PATCH

---

### Task 1: Add dashboardLayout to User model + migration

**Files:**
- Modify: `prisma/schema.prisma:20-41` (User model)
- Create: `prisma/migrations/20260409150000_add_dashboard_layout/migration.sql`

- [ ] **Step 1: Add field to User model**

In `prisma/schema.prisma`, add `dashboardLayout` field after `updatedAt` (line 33):

```prisma
model User {
  id                       String          @id @default(cuid())
  email                    String          @unique
  name                     String?
  // ... existing fields ...
  createdAt                DateTime        @default(now())
  updatedAt                DateTime        @updatedAt
  dashboardLayout          String          @default("classic")

  weddings       WeddingMember[]
  backupCodes    BackupCode[]
  assignedTasks  Task[]
  sessions       Session[]
  accounts       Account[]
  trustedDevices TrustedDevice[]
}
```

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260409150000_add_dashboard_layout/migration.sql`:

```sql
ALTER TABLE "User" ADD COLUMN "dashboardLayout" TEXT NOT NULL DEFAULT 'classic';
```

- [ ] **Step 3: Run migration**

Run: `docker compose exec app npx prisma migrate deploy`
Expected: Migration applies successfully.

- [ ] **Step 4: Generate Prisma client**

Run: `npx prisma generate`
Expected: Client regenerated with `dashboardLayout` field.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260409150000_add_dashboard_layout/migration.sql
git commit -m "feat: add dashboardLayout field to User model"
```

---

### Task 2: Thread dashboardLayout through server context and WeddingContext

**Files:**
- Modify: `src/lib/server-context.ts:8-46`
- Modify: `src/app/(dashboard)/layout.tsx:13-111`
- Modify: `src/context/WeddingContext.tsx:21-75`

- [ ] **Step 1: Update ServerContext type and query**

In `src/lib/server-context.ts`, add `dashboardLayout` to the `ServerContext` type (line 8):

```typescript
export type ServerContext = {
  userId: string;
  userEmail: string;
  userName: string | null;
  weddingId: string;
  role: UserRole;
  dashboardLayout: string;
};
```

Then in `getServerContext()` (line 40), add a User query to fetch `dashboardLayout`. After the `weddingMember` check (line 38), add:

```typescript
const userRecord = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { dashboardLayout: true },
});
```

Update the return statement (line 40) to include:

```typescript
return {
  userId: session.user.id,
  userEmail: session.user.email,
  userName: session.user.name,
  weddingId,
  role: member.role,
  dashboardLayout: userRecord?.dashboardLayout ?? "classic",
};
```

- [ ] **Step 2: Add dashboardLayout to WeddingContext**

In `src/context/WeddingContext.tsx`, update the `WeddingContextValue` type (line 21):

```typescript
type WeddingContextValue = {
  weddingId: string;
  role: UserRole;
  subscriptionStatus: SubStatus;
  currencySymbol: string;
  eventNames: EventNamesConfig;
  dashboardLayout: string;
};
```

Add `dashboardLayout` prop to `WeddingProvider` (line 31):

```typescript
export function WeddingProvider({
  weddingId,
  role,
  subscriptionStatus,
  currencySymbol,
  eventNames,
  dashboardLayout,
  children,
}: {
  weddingId: string;
  role: UserRole;
  subscriptionStatus: SubStatus;
  currencySymbol: string;
  eventNames: EventNamesConfig;
  dashboardLayout: string;
  children: React.ReactNode;
}) {
```

Add `dashboardLayout` to the provider value (line 47):

```typescript
value={{
  weddingId,
  role,
  subscriptionStatus,
  currencySymbol,
  eventNames,
  dashboardLayout,
}}
```

Add default to the fallback in `useWedding()` (around line 65):

```typescript
dashboardLayout: "classic",
```

- [ ] **Step 3: Pass dashboardLayout in dashboard layout**

In `src/app/(dashboard)/layout.tsx`, pass `dashboardLayout` to `WeddingProvider` (line 93):

```tsx
<WeddingProvider
  weddingId={ctx.weddingId}
  role={ctx.role}
  subscriptionStatus={weddingBilling?.subscriptionStatus ?? "TRIALING"}
  currencySymbol={currencySymbol}
  eventNames={eventNames}
  dashboardLayout={ctx.dashboardLayout}
>
```

- [ ] **Step 4: Verify build compiles**

Run: `docker compose build app`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server-context.ts src/context/WeddingContext.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: thread dashboardLayout through server context and WeddingContext"
```

---

### Task 3: Create preset configuration and types

**Files:**
- Create: `src/components/dashboard/DashboardPresets.tsx`

- [ ] **Step 1: Create preset config file**

Create `src/components/dashboard/DashboardPresets.tsx`:

```tsx
import type { DashStats } from "./DashboardClient";

export type DashboardPresetId = "classic" | "actions-first" | "budget-focus" | "organized";

export type DashboardRow = {
  /** Optional section header for the "Organized" preset */
  header?: string;
  /** Section IDs to render in this grid row */
  sections: string[];
  /** Grid column spans per section (defaults to equal split). Maps to lg:col-span-N. */
  spans?: number[];
};

export type DashboardPreset = {
  id: DashboardPresetId;
  name: string;
  description: string;
  rows: DashboardRow[];
};

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Summary stats first, then details",
    rows: [
      { sections: ["quickStats"] },
      { sections: ["guestSummary", "budgetOverview"], spans: [2, 1] },
      { sections: ["meals", "suppliers"], spans: [2, 1] },
      { sections: ["budgetCategories"] },
      { sections: ["payments"] },
      { sections: ["appointments", "tasks"] },
    ],
  },
  {
    id: "actions-first",
    name: "Actions First",
    description: "Urgent items and payments at the top",
    rows: [
      { sections: ["payments"] },
      { sections: ["tasks", "appointments"] },
      { sections: ["budgetOverview", "budgetCategories"] },
      { sections: ["quickStats"] },
      { sections: ["guestSummary", "meals"], spans: [2, 1] },
      { sections: ["suppliers"] },
    ],
  },
  {
    id: "budget-focus",
    name: "Budget Focus",
    description: "Wedding countdown and budget health lead",
    rows: [
      { sections: ["countdownHero", "budgetOverview"], spans: [1, 1] },
      { sections: ["payments", "budgetCategories"], spans: [2, 1] },
      { sections: ["tasks", "appointments"] },
      { sections: ["quickStats"] },
      { sections: ["guestSummary", "meals"], spans: [2, 1] },
      { sections: ["suppliers"] },
    ],
  },
  {
    id: "organized",
    name: "Organized",
    description: "Grouped sections: At a Glance, Needs Attention, Progress",
    rows: [
      { header: "At a Glance", sections: ["quickStats"] },
      { header: "Needs Attention", sections: ["payments"] },
      { header: "Needs Attention", sections: ["tasks", "appointments"] },
      { header: "Progress", sections: ["budgetOverview", "budgetCategories"] },
      { header: "Progress", sections: ["guestSummary", "meals"], spans: [2, 1] },
      { header: "Progress", sections: ["suppliers"] },
    ],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardPresets.tsx
git commit -m "feat: add dashboard preset configuration and types"
```

---

### Task 4: Extract DashboardQuickStats component

**Files:**
- Create: `src/components/dashboard/sections/DashboardQuickStats.tsx`
- Modify: `src/components/dashboard/DashboardClient.tsx` (replaces lines 189-218)

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/sections/DashboardQuickStats.tsx`:

```tsx
"use client";

import { Users, LayoutGrid, TrendingUp } from "lucide-react";
import { QuickStat } from "../DashboardClient";
import { CountdownCard } from "../DashboardClient";

interface DashboardQuickStatsProps {
  weddingDate: string | null;
  timezone: string;
  guestsAccepted: number;
  guestsTotal: number;
  guestsAssigned: number;
  receptionEligible: number;
  budgetPaid: number;
  budgetContracted: number;
  budgetRemaining: number;
  currencySymbol: string;
  showFinance: boolean;
}

export function DashboardQuickStats({
  weddingDate,
  timezone,
  guestsAccepted,
  guestsTotal,
  guestsAssigned,
  receptionEligible,
  budgetPaid,
  budgetContracted,
  budgetRemaining,
  currencySymbol,
  showFinance,
}: DashboardQuickStatsProps) {
  const respondedPct = guestsTotal > 0
    ? `${Math.round(((guestsTotal - (guestsTotal - guestsAccepted)) / guestsTotal) * 100)}%`
    : "0%";
  const fmt = (sym: string, n: number) =>
    `${sym}${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className={`grid gap-3 ${showFinance ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
      <CountdownCard weddingDate={weddingDate} timezone={timezone} />
      <QuickStat
        icon={<Users className="w-5 h-5 text-indigo-500" />}
        label="Guests accepted"
        value={`${guestsAccepted} / ${guestsTotal}`}
        sub={guestsTotal > 0 ? `${Math.round(((guestsTotal - guestsAccepted) / guestsTotal) * 100)}% responded` : "No guests yet"}
        href="/guests"
      />
      <QuickStat
        icon={<LayoutGrid className="w-5 h-5 text-violet-500" />}
        label="Seated"
        value={`${guestsAssigned} / ${receptionEligible}`}
        sub={receptionEligible > 0 ? `${Math.round((guestsAssigned / receptionEligible) * 100)}% assigned` : "No reception guests"}
        href="/seating"
      />
      {showFinance && (
        <QuickStat
          icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
          label="Budget paid"
          value={budgetContracted > 0
            ? `${Math.round((budgetPaid / budgetContracted) * 100)}%`
            : "—"}
          sub={budgetContracted > 0
            ? `${fmt(currencySymbol, budgetRemaining)} remaining`
            : "No suppliers yet"}
          href="/suppliers"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Export CountdownCard and QuickStat from DashboardClient**

In `src/components/dashboard/DashboardClient.tsx`, change the `CountdownCard` function (line 751) and `QuickStat` function (line 886) from unexported to exported:

```typescript
export function CountdownCard(...) {
```
```typescript
export function QuickStat(...) {
```

- [ ] **Step 3: Verify build compiles**

Run: `docker compose build app`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/sections/DashboardQuickStats.tsx src/components/dashboard/DashboardClient.tsx
git commit -m "feat: extract DashboardQuickStats component"
```

---

### Task 5: Extract remaining 7 section components

**Files:**
- Create: `src/components/dashboard/sections/DashboardGuestSummary.tsx`
- Create: `src/components/dashboard/sections/DashboardBudgetOverview.tsx`
- Create: `src/components/dashboard/sections/DashboardBudgetCategories.tsx`
- Create: `src/components/dashboard/sections/DashboardMeals.tsx`
- Create: `src/components/dashboard/sections/DashboardSuppliers.tsx`
- Create: `src/components/dashboard/sections/DashboardPayments.tsx`
- Create: `src/components/dashboard/sections/DashboardAppointments.tsx`
- Create: `src/components/dashboard/sections/DashboardTasks.tsx`

Each component wraps the corresponding JSX block from `DashboardClient.tsx`. The props are slices of the existing `DashStats` type. The components also need the action handlers (`handleMarkPaid`, `handleMarkTaskDone`, etc.) and the confirm modals — these are passed as callback props.

- [ ] **Step 1: Extract DashboardGuestSummary**

Create `src/components/dashboard/sections/DashboardGuestSummary.tsx`. This wraps lines 223-265 of DashboardClient (the guest summary card with RSVP breakdown bars). Props:

```typescript
interface DashboardGuestSummaryProps {
  total: number;
  accepted: number;
  partial: number;
  declined: number;
  pending: number;
  dietary: number;
}
```

The component renders the same JSX as lines 223-265, using the prop values instead of `stats.guests.*`.

- [ ] **Step 2: Extract DashboardBudgetOverview**

Create `src/components/dashboard/sections/DashboardBudgetOverview.tsx`. This wraps lines 269-298 (budget overview card). Props:

```typescript
interface DashboardBudgetOverviewProps {
  contracted: number;
  paid: number;
  remaining: number;
  currencySymbol: string;
}
```

- [ ] **Step 3: Extract DashboardBudgetCategories**

Create `src/components/dashboard/sections/DashboardBudgetCategories.tsx`. This wraps lines 361-405 (budget categories). Props:

```typescript
interface DashboardBudgetCategoriesProps {
  categories: { id: string; name: string; colour: string; allocated: number; paid: number }[];
  currencySymbol: string;
}
```

- [ ] **Step 4: Extract DashboardMeals**

Create `src/components/dashboard/sections/DashboardMeals.tsx`. This wraps lines 306-318 (meal choices). Props:

```typescript
interface DashboardMealsProps {
  meals: { name: string; count: number }[];
}
```

Reuses the `MealBars` sub-component (export it from DashboardClient or move it into this file).

- [ ] **Step 5: Extract DashboardSuppliers**

Create `src/components/dashboard/sections/DashboardSuppliers.tsx`. This wraps lines 322-357 (supplier status list). Props:

```typescript
interface DashboardSuppliersProps {
  suppliers: { ENQUIRY: number; QUOTED: number; BOOKED: number; COMPLETE: number; CANCELLED: number };
}
```

- [ ] **Step 6: Extract DashboardPayments**

Create `src/components/dashboard/sections/DashboardPayments.tsx`. This wraps lines 407-474 (upcoming payments). Props:

```typescript
interface DashboardPaymentsProps {
  payments: {
    id: string; label: string; amount: number;
    dueDate: string | null; status: string;
    supplierId: string; supplierName: string;
  }[];
  currencySymbol: string;
  onMarkPaid: (payment: DashboardPaymentsProps["payments"][0]) => void;
  onSendReminder: (paymentId: string) => void;
}
```

The `onMarkPaid` callback triggers the confirm modal (kept in the parent DashboardClient). The `onSendReminder` callback calls the API.

- [ ] **Step 7: Extract DashboardAppointments**

Create `src/components/dashboard/sections/DashboardAppointments.tsx`. This wraps lines 479-566 (appointments list). Props:

```typescript
interface DashboardAppointmentsProps {
  appointments: {
    id: string; title: string; categoryName: string | null; categoryColour: string | null; date: string;
    location: string | null; supplierId: string | null; supplierName: string | null;
  }[];
  onMarkDone: (appointment: DashboardAppointmentsProps["appointments"][0]) => void;
}
```

- [ ] **Step 8: Extract DashboardTasks**

Create `src/components/dashboard/sections/DashboardTasks.tsx`. This wraps lines 569-700 (tasks list). Props:

```typescript
interface DashboardTasksProps {
  overdue: number;
  dueSoon: number;
  upcoming: {
    id: string; title: string; priority: string;
    dueDate: string | null; isCompleted: boolean; assignedToName: string | null;
    categoryName: string | null; categoryColour: string | null;
    supplierId: string | null; supplierName: string | null;
  }[];
  onMarkDone: (task: DashboardTasksProps["upcoming"][0]) => void;
  onSendReminder: (taskId: string) => void;
}
```

- [ ] **Step 9: Export MealBars and SUPPLIER_STATUS from DashboardClient**

In `DashboardClient.tsx`, export `MealBars` (line 909) and `SUPPLIER_STATUS` (line 967):

```typescript
export function MealBars(...) {
```
```typescript
export const SUPPLIER_STATUS = {
```

- [ ] **Step 10: Verify build compiles**

Run: `docker compose build app`
Expected: Build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/components/dashboard/sections/
git commit -m "feat: extract all dashboard section components"
```

---

### Task 6: Create section registry and update DashboardClient to render presets

**Files:**
- Modify: `src/components/dashboard/DashboardClient.tsx`

This is the core task. Replace the hardcoded row layout with preset-driven rendering.

- [ ] **Step 1: Build the section registry in DashboardClient**

At the top of `DashboardClient`'s render, after the loading/error/null checks (around line 148), construct a `sections` map that maps section IDs to rendered JSX:

```typescript
const showFinance = role === "ADMIN" || role === "VIEWER" || role === undefined;

// Section registry — maps section IDs to rendered components
const sectionRegistry: Record<string, React.ReactNode> = {
  quickStats: (
    <DashboardQuickStats
      weddingDate={stats.wedding.weddingDate}
      timezone={stats.wedding.timezone}
      guestsAccepted={stats.guests.accepted}
      guestsTotal={stats.guests.total}
      guestsAssigned={stats.guests.assigned}
      receptionEligible={stats.guests.receptionEligible}
      budgetPaid={stats.budget.paid}
      budgetContracted={stats.budget.contracted}
      budgetRemaining={stats.budget.remaining}
      currencySymbol={currencySymbol}
      showFinance={showFinance}
    />
  ),
  guestSummary: <DashboardGuestSummary total={stats.guests.total} accepted={stats.guests.accepted} partial={stats.guests.partial} declined={stats.guests.declined} pending={stats.guests.pending} dietary={stats.guests.dietary} />,
  budgetOverview: showFinance ? <DashboardBudgetOverview contracted={stats.budget.contracted} paid={stats.budget.paid} remaining={stats.budget.remaining} currencySymbol={currencySymbol} /> : null,
  budgetCategories: showFinance && stats.budgetCategories.length > 0 ? <DashboardBudgetCategories categories={stats.budgetCategories} currencySymbol={currencySymbol} /> : null,
  meals: <DashboardMeals meals={stats.meals} />,
  suppliers: showFinance ? <DashboardSuppliers suppliers={stats.suppliers} /> : null,
  payments: showFinance ? <DashboardPayments payments={stats.payments} currencySymbol={currencySymbol} onMarkPaid={(p) => setMarkPaidConfirm(p)} onSendReminder={handleSendReminder} /> : null,
  appointments: <DashboardAppointments appointments={stats.appointments} onMarkDone={(a) => setMarkApptDoneConfirm(a)} />,
  tasks: <DashboardTasks overdue={stats.tasks.overdue} dueSoon={stats.tasks.dueSoon} upcoming={stats.tasks.upcoming} onMarkDone={(t) => setMarkDoneConfirm(t)} onSendReminder={handleSendTaskReminder} />,
  // "Budget Focus" preset uses a hero version of the countdown
  countdownHero: <CountdownHeroCard weddingDate={stats.wedding.weddingDate} timezone={stats.wedding.timezone} />,
};
```

- [ ] **Step 2: Add layout state to DashboardClient**

Add `dashboardLayout` prop and local state to DashboardClient:

```typescript
export function DashboardClient({ userName, role, dashboardLayout: initialLayout }: {
  userName?: string;
  role?: UserRole;
  dashboardLayout?: string;
}) {
  const { currencySymbol } = useWedding();
  const [layout, setLayout] = useState<DashboardPresetId>(
    (initialLayout as DashboardPresetId) || "classic"
  );
  // ... existing state
```

- [ ] **Step 3: Replace hardcoded rows with preset rendering**

Replace the entire JSX body (from the `return` statement onward, rows 1-5 plus confirm modals) with:

```tsx
return (
  <div className="space-y-6">
    {/* Welcome header + Layout picker */}
    <div className="relative">
      <div className="absolute -left-4 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-primary/40 to-primary/10" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-0.5">{stats.wedding.coupleName}</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
            Welcome back, {userName ?? "there"}
          </h1>
          {stats.wedding.weddingDate && (
            <p className="text-sm text-primary mt-1 font-medium">
              {formatDateWithTimezone(stats.wedding.weddingDate)}
            </p>
          )}
        </div>
        <LayoutPicker currentLayout={layout} onLayoutChange={setLayout} />
      </div>
    </div>

    {/* Preset-driven rows */}
    {DASHBOARD_PRESETS.find(p => p.id === layout)?.rows.map((row, rowIdx) => {
      // Filter out null/undefined sections (e.g. finance sections for non-admins)
      const visibleSections = row.sections
        .map(id => ({ id, node: sectionRegistry[id] }))
        .filter(s => s.node !== null);

      if (visibleSections.length === 0) return null;

      const totalCols = row.spans?.reduce((a, b) => a + b, 0) ?? visibleSections.length;
      const gridCols = totalCols <= 2 ? `grid-cols-1 lg:grid-cols-2` : `grid-cols-1 lg:grid-cols-${totalCols}`;

      return (
        <div key={rowIdx} className={`animate-fade-in-up stagger-${rowIdx + 1}`}>
          {row.header && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 mt-2">
              {row.header}
            </h2>
          )}
          <div className={`grid gap-4 ${gridCols}`}>
            {visibleSections.map((s, i) => {
              const span = row.spans?.[row.sections.indexOf(s.id)] ?? 1;
              return (
                <div key={s.id} className={span > 1 ? `lg:col-span-${span}` : undefined}>
                  {s.node}
                </div>
              );
            })}
          </div>
        </div>
      );
    })}

    {/* Confirm modals */}
    {markDoneConfirm && (
      <ConfirmModal
        message={<span>Mark <strong>{markDoneConfirm.title}</strong> as done?</span>}
        onConfirm={() => { handleMarkTaskDone(markDoneConfirm.id); setMarkDoneConfirm(null); }}
        onCancel={() => setMarkDoneConfirm(null)}
      />
    )}
    {markApptDoneConfirm && (
      <ConfirmModal
        message={<span>Mark <strong>{markApptDoneConfirm.title}</strong> as done?</span>}
        onConfirm={() => { handleMarkApptDone(markApptDoneConfirm.id); setMarkApptDoneConfirm(null); }}
        onCancel={() => setMarkApptDoneConfirm(null)}
      />
    )}
    {markPaidConfirm && (
      <ConfirmModal
        message={
          <span>
            Mark <strong>{markPaidConfirm.supplierName} — {markPaidConfirm.label}</strong>{" "}
            ({fmt(currencySymbol, markPaidConfirm.amount)}) as paid?
          </span>
        }
        onConfirm={() => { handleMarkPaid(markPaidConfirm.id, markPaidConfirm.supplierId); setMarkPaidConfirm(null); }}
        onCancel={() => setMarkPaidConfirm(null)}
      />
    )}
  </div>
);
```

- [ ] **Step 4: Add CountdownHeroCard for "Budget Focus" preset**

In `DashboardClient.tsx`, add a new sub-component after `CountdownCard`. This is a larger, left-aligned version of the countdown for the "Budget Focus" preset's hero row:

```tsx
function CountdownHeroCard({ weddingDate, timezone }: { weddingDate: string | null; timezone: string }) {
  // Reuses the same countdown logic as CountdownCard but renders as a
  // full card (not a small stat card) suitable for a 2-col hero row
  const days = weddingDate
    ? (() => {
        try {
          const now = new Date();
          const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
          const today = new Date(todayStr + "T00:00:00");
          const weddingStr = new Date(weddingDate).toLocaleDateString("en-CA", { timeZone: timezone });
          const wedding = new Date(weddingStr + "T00:00:00");
          const diffMs = wedding.getTime() - today.getTime();
          return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        } catch {
          const wedding = new Date(weddingDate);
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const weddingMidnight = new Date(Date.UTC(wedding.getUTCFullYear(), wedding.getUTCMonth(), wedding.getUTCDate()));
          return Math.ceil((weddingMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
      })()
    : null;

  return (
    <div className="bg-gradient-to-br from-primary/5 to-white rounded-xl border border-primary/10 p-6 flex flex-col items-center justify-center text-center min-h-[180px]">
      <Heart className="w-8 h-8 text-primary fill-primary/20 mb-3" />
      {days === null ? (
        <Link href="/settings" className="text-sm text-primary hover:underline font-medium">
          Set date in Settings
        </Link>
      ) : days > 0 ? (
        <>
          <p className="text-4xl md:text-5xl font-bold text-primary leading-none">
            {days}
          </p>
          <p className="text-sm text-gray-500 mt-1">days to go</p>
        </>
      ) : days === 0 ? (
        <p className="text-2xl font-bold text-primary">Today!</p>
      ) : (
        <p className="text-lg font-medium text-gray-500">{Math.abs(days)} days ago</p>
      )}
    </div>
  );
}
```

Note: The `Heart` import already exists in DashboardClient.

- [ ] **Step 5: Update dashboard page to pass dashboardLayout prop**

In `src/app/(dashboard)/page.tsx`, update the DashboardClient invocation:

```tsx
const ctx = await requireServerContext();
return (
  <DashboardClient
    userName={ctx.userName ?? ctx.userEmail ?? undefined}
    role={ctx.role}
    dashboardLayout={ctx.dashboardLayout}
  />
);
```

- [ ] **Step 6: Verify build compiles and test in browser**

Run: `docker compose up --build`
Then visit `http://localhost:3001` and verify:
- Default "Classic" layout renders identically to before
- No visual regressions

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/DashboardClient.tsx src/components/dashboard/sections/ src/app/\(dashboard\)/page.tsx
git commit -m "feat: preset-driven dashboard rendering with section registry"
```

---

### Task 7: Create LayoutPicker component

**Files:**
- Create: `src/components/dashboard/LayoutPicker.tsx`

- [ ] **Step 1: Create the LayoutPicker component**

This is a popover dropdown triggered by a small layout icon in the dashboard header. It shows the 4 preset options with names and descriptions, and highlights the active one.

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { LayoutGrid } from "lucide-react";
import { DASHBOARD_PRESETS, type DashboardPresetId } from "./DashboardPresets";

interface LayoutPickerProps {
  currentLayout: DashboardPresetId;
  onLayoutChange: (id: DashboardPresetId) => void;
}

export function LayoutPicker({ currentLayout, onLayoutChange }: LayoutPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(id: DashboardPresetId) {
    onLayoutChange(id);
    setOpen(false);
    // Persist to server
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardLayout: id }),
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Change dashboard layout"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Dashboard Layout
          </p>
          {DASHBOARD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleSelect(preset.id)}
              className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                currentLayout === preset.id ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${currentLayout === preset.id ? "text-primary" : "text-gray-900"}`}>
                  {preset.name}
                </span>
                {currentLayout === preset.id && (
                  <span className="text-xs text-primary">✓</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/LayoutPicker.tsx
git commit -m "feat: add LayoutPicker popover component"
```

---

### Task 8: Update PATCH /api/profile to accept dashboardLayout

**Files:**
- Modify: `src/app/api/profile/route.ts:32-87`

- [ ] **Step 1: Add dashboardLayout to PATCH handler**

In `src/app/api/profile/route.ts`, update the PATCH handler to accept and save `dashboardLayout`:

Change the destructuring on line 37:

```typescript
const { name, email, password, dashboardLayout } = await req.json();
```

Add to the update data object (after line 73):

```typescript
const updated = await prisma.user.update({
  where: { id: auth.user.id },
  data: {
    ...(name !== undefined && { name: name || null }),
    ...(email && { email }),
    ...(dashboardLayout !== undefined && { dashboardLayout }),
  },
  select: { id: true, name: true, email: true, dashboardLayout: true },
});
```

- [ ] **Step 2: Verify by testing the API**

Run: `docker compose up --build`
Then test via browser: select a layout in the LayoutPicker, reload the page, confirm it persists.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/profile/route.ts
git commit -m "feat: accept dashboardLayout in PATCH /api/profile"
```

---

### Task 9: Test all 4 presets end-to-end

- [ ] **Step 1: Test Classic preset**

1. Open dashboard at `http://localhost:3001`
2. Click layout picker, select "Classic"
3. Verify: Quick stats row → Guest Summary + Budget → Meals + Suppliers → Budget Categories → Payments → Appointments + Tasks
4. Verify: Same visual as the original dashboard

- [ ] **Step 2: Test Actions First preset**

1. Select "Actions First"
2. Verify: Payments at top → Tasks + Appointments → Budget Overview + Budget Categories → Quick Stats → Guest Summary + Meals → Suppliers
3. Verify: Finance sections hidden for non-admin users

- [ ] **Step 3: Test Budget Focus preset**

1. Select "Budget Focus"
2. Verify: Countdown hero + Budget Overview → Payments + Budget Categories → Tasks + Appointments → Quick Stats → Guest Summary + Meals → Suppliers
3. Verify: The countdown hero card renders as a centered, large card (not the small stat card)

- [ ] **Step 4: Test Organized preset**

1. Select "Organized"
2. Verify: Section headers visible: "AT A GLANCE", "NEEDS ATTENTION", "PROGRESS"
3. Verify: Quick Stats under "At a Glance", Payments/Tasks/Appointments under "Needs Attention", Budget/Guests/Suppliers under "Progress"

- [ ] **Step 5: Test persistence**

1. Select any preset, reload the page
2. Verify: The chosen layout persists after reload
3. Verify: Different users can have different layouts

- [ ] **Step 6: Test mobile view**

1. Resize browser to mobile width (375px)
2. Switch between all 4 presets
3. Verify: All sections stack vertically on mobile
4. Verify: No horizontal overflow or broken layouts

- [ ] **Step 7: Commit final state**

```bash
git add -A
git commit -m "feat: complete dashboard presets with all 4 layouts"
```
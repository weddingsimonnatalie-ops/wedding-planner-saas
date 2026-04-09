# Dashboard Presets Design

## Problem

The current dashboard has a fixed card order optimized for summary-first viewing. For wedding planners who log in daily, the most urgent items (overdue payments, tasks, appointments) are buried below summary stats. Different users have different priorities — some want budget clarity first, others want action items.

## Solution

Add 4 selectable dashboard layout presets. Users pick their preferred layout in Settings → General. The dashboard re-renders immediately without a page reload.

## Architecture: Section-Based Presets

Each dashboard section is extracted into a standalone React component. A preset is an ordered list of section IDs. Sections are coded once and shared across all presets.

This avoids 4 separate JSX layouts (maintenance nightmare) and means any new section automatically becomes available to all presets.

## The 4 Presets

### 1. Classic (current default)

Same ordering as today. Summary stats lead, details follow.

```
Quick Stats (4-col) → Guest Summary + Budget Overview → Meal Choices + Suppliers → Budget by Category → Upcoming Payments → Appointments + Tasks
```

### 2. Actions First

Urgent items at top. Overdue payments, tasks, and appointments are what you see first. Summary stats pushed below.

```
Upcoming Payments → Tasks + Appointments → Budget Overview + Budget by Category → Quick Stats (4-col) → Guest Summary + Meals + Suppliers
```

### 3. Budget Focus

Wedding countdown and budget health lead. Then into payments and action items. Good for finance-focused planners.

```
Countdown + Budget Overview (2-col hero) → Upcoming Payments + Budget by Category → Tasks + Appointments → Quick Stats (3-col: Guests/Seated/%Paid) → Guest Summary + Meals + Suppliers
```

### 4. Organized

Three explicitly-labeled sections with section headers. Clear visual hierarchy.

- **At a Glance** — Quick Stats (4-col)
- **Needs Attention** — Payments + Tasks + Appointments
- **Progress** — Budget + Suppliers + Guest Summary + Meals

## Data Model

Add `dashboardLayout` field to the `User` model:

```prisma
model User {
  // ... existing fields
  dashboardLayout String @default("classic") // "classic" | "actions-first" | "budget-focus" | "organized"
}
```

Migration: `20260409100000_add_dashboard_layout`

## Extracted Section Components

All extracted from `DashboardClient.tsx` into `src/components/dashboard/sections/`:

| Component | Content | Notes |
|-----------|---------|-------|
| `DashboardQuickStats` | Countdown + Guests accepted + Seated + Budget % | Adapts: 4-col (with finance) or 3-col (without) |
| `DashboardGuestSummary` | RSVP breakdown bars + dietary count | Currently 2-col span |
| `DashboardBudgetOverview` | Contracted/Paid/Remaining + progress bar | Currently 1-col |
| `DashboardBudgetCategories` | Category progress bars | Currently full-width, admin only |
| `DashboardMeals` | Meal choice bars | Currently 2-col span |
| `DashboardSuppliers` | Status pill list (Booked/Quoted/Enquiry/etc.) | Currently 1-col, admin only |
| `DashboardPayments` | Overdue & upcoming payments with Mark as Paid | Currently full-width, admin only |
| `DashboardAppointments` | Upcoming appointments with Mark as Done | Currently half-width |
| `DashboardTasks` | Overdue/due-soon tasks with Mark as Done | Currently half-width |

Each component receives its data slice via props (from the existing `DashStats` type). The parent `DashboardClient` fetches data once and distributes it.

## Preset Configuration

Presets are defined as an array of rows. Each row is an array of section IDs that share the same grid row. This replaces the `groupWith` approach with something declarative and easy to reason about.

```typescript
type DashboardPreset = {
  id: string;
  name: string;
  description: string;
  rows: DashboardRow[];
};

type DashboardRow = {
  /** Optional section header (used by "Organized" preset) */
  header?: string;
  /** Section IDs to render in this grid row */
  sections: string[];
  /** Grid column spans per section, defaults to equal split */
  spans?: number[];
};
```

Example — "Classic" preset:
```typescript
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
}
```

The `DashboardClient` reads the user's `dashboardLayout` preference and renders rows in order. Each row maps to a CSS grid. The `spans` array controls `lg:col-span-N` for each section.

## Settings UI

In Settings → General, add a "Dashboard layout" picker:

- Radio group or segmented control with 4 options
- Each option shows name + one-line description
- Selecting an option updates `dashboardLayout` via PATCH `/api/user/profile`
- Dashboard re-renders immediately (state update, no page reload)

## API Changes

- `PATCH /api/user/profile` — accept `dashboardLayout` field
- `GET /api/dashboard/stats` — no changes (already returns all data)
- Auth session — include `dashboardLayout` in session data so the dashboard can read it without an extra API call

## Implementation Order

1. Add `dashboardLayout` field to User model + migration
2. Extract 9 section components from DashboardClient
3. Define preset configurations (ordered section lists)
4. Update DashboardClient to render sections based on preset
5. Add layout picker to Settings → General
6. Add "Organized" section headers for that preset
7. Test all 4 presets

## Edge Cases

- **Non-admin users** (VIEWER/RSVP_MANAGER): Finance sections are hidden regardless of preset. The preset still applies to the remaining sections.
- **No data**: Empty states render within each section component, unchanged from current behavior.
- **Mobile**: Section components already handle responsive layouts. Presets only affect ordering, not responsiveness.
- **Default**: New users get "classic" (current behavior, zero surprise).
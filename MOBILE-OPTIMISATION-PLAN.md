# iPhone 15 Mobile Optimisation Plan

Target device: **390×844px** — Dynamic Island (top), home indicator bar (bottom).

All changes committed to branch: `mobile-view-improvements`

---

## Phase 1 — Safe Area Insets

The most impactful change. iPhone 15 hardware chrome (Dynamic Island + home indicator) currently overlaps fixed UI elements.

### `src/app/globals.css`
- [x] Add `env(safe-area-inset-bottom)` padding to `body` so page content doesn't sit behind the home indicator
- [x] Add `viewport-fit=cover` support via `Viewport` export in `src/app/layout.tsx`

### `src/components/LayoutShell.tsx`
- [x] Outer wrapper: `h-screen` → `h-dvh` + `padding-top: env(safe-area-inset-top)` so header clears the Dynamic Island
- [x] Mobile sidebar (`fixed inset-y-0`): add `padding-top: env(safe-area-inset-top)` so nav items aren't hidden under Dynamic Island
- [x] Main content area: `padding-bottom: max(1rem, env(safe-area-inset-bottom))` fallback for pages without a fixed bottom bar

### `src/components/guests/GuestList.tsx`
- [x] Toast notification (`fixed bottom-4 right-4`): replaced with `style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}`

### `src/components/tasks/TasksPageClient.tsx`
- [x] Fixed bulk action bar: `padding-bottom: max(0.75rem, env(safe-area-inset-bottom))`
- [x] Page bottom padding: replaced `pb-20` with `style={{ paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }}`

### All toast notifications (10 components)
- [x] `AppointmentsList.tsx` — safe area bottom
- [x] `SupplierTasksSection.tsx` — safe area bottom
- [x] `PaymentsList.tsx` — safe area bottom
- [x] `SupplierAppointmentsSection.tsx` — safe area bottom
- [x] `MealOptionsList.tsx` — safe area bottom
- [x] `SupplierDetail.tsx` — safe area bottom
- [x] `ProfileClient.tsx` — safe area bottom
- [x] `SeatingClient.tsx` — safe area bottom
- [x] `UsersManager.tsx` — safe area bottom
- [x] `CategoriesManager.tsx` — safe area bottom

**Commit after Phase 1 complete. ✅ DONE**

---

## Phase 2 — Touch Targets

Apple HIG minimum is 44×44px. Several icon buttons are currently ~28px.

### `src/components/appointments/AppointmentsList.tsx`
- [ ] Edit button: `p-1.5` → `p-2.5` to reach 44px effective touch area
- [ ] Delete button: same change

### `src/components/guests/GuestList.tsx`
- [ ] Review all icon buttons in mobile card rows — ensure `min-h-[44px] min-w-[44px]` or equivalent padding
- [ ] Filter toggle button on mobile: confirm adequate touch target

### `src/components/tasks/TasksPageClient.tsx`
- [ ] Task checkbox: wrap in a larger hit area or increase padding to reach 44px tap target

### `src/components/payments/PaymentsList.tsx`
- [ ] Edit / delete / mark-paid icon buttons on payment cards: audit and increase padding where < 44px

**Commit after Phase 2 complete.**

---

## Phase 3 — Readability & Text Sizes

`text-[10px]` stat labels are borderline illegible on a 390px screen.

### `src/components/guests/GuestList.tsx`
- [ ] Summary bar stat labels: `text-[10px]` → `text-[11px]`

### `src/components/suppliers/SupplierList.tsx`
- [ ] Summary bar stat labels: `text-[10px]` → `text-[11px]`

### `src/components/payments/PaymentsList.tsx`
- [ ] Summary bar stat labels: `text-[10px]` → `text-[11px]`

### `src/components/dashboard/DashboardClient.tsx`
- [ ] Review any `text-xs` or smaller labels in stat cards — increase where < 11px effective size

**Commit after Phase 3 complete.**

---

## Phase 4 — Modal Viewport Height

iOS Safari's dynamic toolbar shrinks the viewport. `max-h-[90vh]` can be too tall when the browser chrome is visible, cutting off modal footers.

### `src/components/guests/GuestModal.tsx`
- [ ] Replace `max-h-[90vh]` with `max-h-[85dvh]` (dynamic viewport height)

### `src/components/suppliers/SupplierModal.tsx`
- [ ] Replace `max-h-[90vh]` with `max-h-[85dvh]`

### `src/app/(dashboard)/appointments/page.tsx` or `AppointmentModal`
- [ ] Locate appointment add/edit modal — apply `max-h-[85dvh]`

### `src/components/tasks/TaskModal.tsx` (or wherever task modal lives)
- [ ] Apply `max-h-[85dvh]`

### `src/components/guests/CsvImportModal.tsx`
- [ ] Apply `max-h-[85dvh]` — CSV import modal is tall and likely to overflow on iPhone 15

**Commit after Phase 4 complete.**

---

## Phase 5 — Sidebar & Navigation Polish

### `src/components/LayoutShell.tsx`
- [ ] Add `max-w-[85vw]` to sidebar element so it never exceeds ~330px on a 390px screen (currently `w-64` = 256px which is fine, but `max-w-[85vw]` prevents edge cases on very small devices)
- [ ] Verify sidebar backdrop tap-to-close works reliably on iOS (check for `onClick` on overlay div)
- [ ] Confirm sidebar closes on route change on mobile (so navigating doesn't leave sidebar open)

### `src/app/(dashboard)/layout.tsx`
- [ ] Check `<meta name="viewport">` includes `viewport-fit=cover` — required for `env(safe-area-inset-*)` to work in iOS Safari

**Commit after Phase 5 complete.**

---

## Phase 6 — Breakpoint Consistency & Layout Fixes

### `src/components/payments/PaymentsList.tsx`
- [ ] Summary stats bar uses `sm:` (640px) breakpoint while guests/suppliers use `md:` (768px) — align to `md:` for the stats bar to match the design system

### `src/components/appointments/AppointmentsList.tsx`
- [ ] Filter selects: add `w-full sm:w-auto` so they go full-width on mobile (390px) rather than potentially overflowing
- [ ] Review header row on mobile — ensure "Add appointment" button doesn't crowd the title on 390px

### `src/components/dashboard/DashboardClient.tsx`
- [ ] "Mark as Paid" buttons in upcoming payments: `px-2.5 py-1` is small — increase to `px-3 py-1.5` with `min-h-[44px]` on mobile
- [ ] Review donut chart legend text wrapping at 390px — confirm no overflow

**Commit after Phase 6 complete.**

---

## Summary

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Safe area insets (Dynamic Island + home indicator) | ✅ Complete |
| 2 | Touch targets (44px minimum) | ⬜ Pending |
| 3 | Text readability (stat labels) | ⬜ Pending |
| 4 | Modal viewport height (dvh) | ⬜ Pending |
| 5 | Sidebar & viewport-fit meta | ⬜ Pending |
| 6 | Breakpoint consistency & layout fixes | ⬜ Pending |

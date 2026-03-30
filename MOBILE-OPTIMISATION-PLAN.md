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
- [x] Edit button: `p-1.5` → `min-h-[44px] min-w-[44px] flex items-center justify-center`
- [x] Delete button: same change

### `src/components/guests/GuestList.tsx`
- [x] Mobile card checkbox: wrapped in `<label>` with `min-h-[44px] min-w-[44px]` hit area
- [x] Filter toggle button: added `min-h-[44px]`

### `src/components/tasks/TasksPageClient.tsx`
- [x] Task bulk-select checkbox: wrapped in `<label>` with `min-h-[44px] min-w-[44px]`
- [x] Group header select-all checkbox: same label wrapping
- [x] Complete checkbox button: `min-w-[16px] min-h-[16px]` → `min-w-[44px] min-h-[44px] flex items-center justify-center`
- [x] Edit/Delete buttons: `min-w-[32px] min-h-[32px]` → `min-w-[44px] min-h-[44px]`

### `src/components/payments/PaymentsList.tsx`
- [x] Receipt view/delete icon buttons: `p-1.5` → `min-h-[44px] min-w-[44px] flex items-center justify-center`
- [x] Mark as paid / Mark as unpaid / Reminder buttons: added `min-h-[44px]`
- [x] Edit/Delete icon buttons: `p-1.5` → `min-h-[44px] min-w-[44px] flex items-center justify-center`

**Commit after Phase 2 complete. ✅ DONE**

---

## Phase 3 — Readability & Text Sizes

`text-[10px]` stat labels are borderline illegible on a 390px screen.

### `src/components/guests/GuestList.tsx`
- [x] Summary bar stat labels: `text-[10px]` → `text-[11px]`

### `src/components/suppliers/SupplierList.tsx`
- [x] Summary bar stat labels: `text-[10px]` → `text-[11px]`

### `src/components/payments/PaymentsList.tsx`
- [x] Summary bar stat labels: `text-[10px]` → `text-[11px]` (all 4 labels)

### `src/components/dashboard/DashboardClient.tsx`
- [x] Reviewed — uses `text-xs` (12px) throughout stat cards; no changes needed

Note: Remaining `text-[10px]` in seating planner (`SeatingListView`, `SeatingVisualView`) are intentional compact labels for table card controls and seat selectors — not body text, out of scope.

**Commit after Phase 3 complete. ✅ DONE**

---

## Phase 4 — Modal Viewport Height

iOS Safari's dynamic toolbar shrinks the viewport. `max-h-[90vh]` can be too tall when the browser chrome is visible, cutting off modal footers.

### Modals using `overflow-y-auto` scrollable backdrop (`my-8` card — no explicit max-h)
These needed safe-area-top padding on the backdrop so the modal card clears the Dynamic Island.
- [x] `GuestModal.tsx` — `p-4` → `px-4 pb-4` + `paddingTop: max(1rem, env(safe-area-inset-top))`
- [x] `SupplierModal.tsx` — same
- [x] `AppointmentModal.tsx` — same
- [x] `PaymentModal.tsx` — same
- [x] `TaskModal.tsx` — same
- [x] `ReceiptUploadModal.tsx` — same
- [x] `ReceiptViewModal.tsx` — same

### Modals using `items-center` backdrop with explicit `max-h-[90vh]` on card
- [x] `CsvImportModal.tsx` — backdrop safe-area-top + inner card `max-h-[90vh]` → `max-h-[85dvh]`
- [x] `GuestList.tsx` bulk status dialog — same two fixes
- [x] `GuestList.tsx` bulk meal dialog — same two fixes
- [x] `GuestList.tsx` bulk email dialog — same two fixes

Note: `max-h-[90vh]` in `SupplierDetail.tsx` is on an `<img object-contain>` element, not a modal card — left unchanged.

**Commit after Phase 4 complete. ✅ DONE**

---

## Phase 5 — Sidebar & Navigation Polish

### `src/components/LayoutShell.tsx`
- [x] Add `max-w-[85vw] md:max-w-none` to sidebar — protects against overflow on very small devices
- [x] Sidebar backdrop tap-to-close — already had `onClick={() => setOpen(false)}` ✓
- [x] Sidebar closes on route change — already had `useEffect(() => setOpen(false), [pathname])` ✓
- [x] Sidebar X close button: `p-1` → `min-h-[44px] min-w-[44px] flex items-center justify-center`
- [x] Hamburger button: `p-1.5` → `min-h-[44px] min-w-[44px] flex items-center justify-center`
- [x] Header profile link: `px-1 py-0.5` → `px-2 py-1 min-h-[44px]`
- [x] Header sign-out button: added `min-h-[44px]`

### `src/app/(dashboard)/layout.tsx`
- [x] `viewport-fit=cover` already set in Phase 1 via `Viewport` export in root `layout.tsx` ✓

**Commit after Phase 5 complete. ✅ DONE**

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
| 2 | Touch targets (44px minimum) | ✅ Complete |
| 3 | Text readability (stat labels) | ✅ Complete |
| 4 | Modal viewport height (dvh) | ✅ Complete |
| 5 | Sidebar & viewport-fit meta | ✅ Complete |
| 6 | Breakpoint consistency & layout fixes | ⬜ Pending |

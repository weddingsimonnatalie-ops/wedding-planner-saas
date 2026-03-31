# iPhone Mobile UX Improvement Plan

Target device: **390×844px** — iPhone 15, iOS Safari.

All changes committed to branch: `mobile-view-improvements`

---

## Phase 1 — Input Modes & Keyboard Types ✅ COMPLETE

iOS shows a full QWERTY keyboard for all `<input>` fields by default. Adding the right `inputMode` / `type` brings up numeric/decimal keypads and prevents the auto-zoom-on-focus issue.

### `src/components/payments/PaymentModal.tsx`
- [x] Amount field: `type="number"` → `type="text" inputMode="decimal"` (avoids iOS spinner widget, shows decimal keypad)

### `src/components/payments/PaymentsList.tsx`
- [x] Inline edit amount field: same `type="text" inputMode="decimal"` change

### `src/components/suppliers/SupplierModal.tsx`
- [x] Contract value field: `type="number"` → `type="text" inputMode="decimal"`

### `src/components/suppliers/SupplierDetail.tsx`
- [x] Contract value input: `type="number"` → `type="text" inputMode="decimal"`
- [x] Phone input: add `type="tel"` (currently plain text input, no type set)
- [x] Inline edit payment amount: `type="number"` → `type="text" inputMode="decimal"`

### `src/components/tasks/TaskModal.tsx`
- [x] Review all inputs — confirmed no numeric fields, all correct

**Commit: `8fd2a8f`**

---

## Phase 2 — Guest Detail Sticky Save Button ✅ COMPLETE

The guest detail form (`/guests/[id]`) is long: name/contact → events → RSVP override → meal → seating → notes. After editing a field mid-page the user must scroll past the entire RSVP section to reach the Save button. A sticky footer save bar fixes this.

### `src/components/guests/GuestForm.tsx`
- [x] Wrap the outer `<form>` in `relative flex flex-col` with `pb-20` to leave room for sticky footer
- [x] Move the Save / Cancel buttons out of the inline position and into a `fixed bottom-0 left-0 right-0` bar (only visible on mobile: `md:hidden`)
- [x] Keep the existing Save button visible at its current position on `md+` screens
- [x] Apply `style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}` to the sticky bar so it clears the home indicator
- [x] "Unsaved changes" dot indicator on the sticky bar when `isDirty` is true

**Commit: `64f7312`**

---

## Phase 3 — Bottom Navigation Bar ✅ COMPLETE

The hamburger → slide-out sidebar flow requires two taps to navigate. A persistent bottom tab bar gives one-tap access to the 4 most-used destinations, leaving the sidebar for secondary pages.

### New file: `src/components/BottomNav.tsx`
- [x] Fixed bottom bar: `fixed bottom-0 inset-x-0 md:hidden bg-white border-t border-gray-200`
- [x] Safe area: `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}`
- [x] Four tabs: **Dashboard** (Home icon) · **Guests** (Users icon) · **Tasks** (CheckSquare icon) · **More** (Menu icon)
  - Dashboard, Guests, Tasks: direct `<Link>` navigation
  - More: opens the sidebar (calls `setOpen(true)` via a context or prop)
- [x] Active tab: `text-primary` fill; inactive: `text-gray-400`
- [x] Badge on Tasks tab: red dot when overdue/due-this-week count > 0 (reuse existing badge logic)
- [x] Each tab: `min-h-[44px]` touch target with icon + label text at `text-[10px]`

### `src/components/LayoutShell.tsx`
- [x] Import and render `<BottomNav />` inside the layout, below `<main>` (only renders on mobile via its own `md:hidden`)
- [x] Main content area: add `pb-16 md:pb-0` so page content isn't hidden behind the bottom bar
- [x] Pass sidebar open setter to BottomNav (or expose via context)

### `src/app/(dashboard)/layout.tsx`
- [x] Confirm `BottomNav` has access to `refreshToken` from `RefreshContext` for the task badge

**Commit: `d0c3129`**

---

## Phase 4 — Supplier Detail Progressive Disclosure ✅ COMPLETE

`/suppliers/[id]` renders Payments, Attachments, and Tasks all expanded simultaneously — 3+ collapsed screens of content on mobile. Making each section collapsible reduces scroll and lets users focus on one thing at a time.

### `src/components/suppliers/SupplierDetail.tsx`
- [x] Add `openSection` state: `"payments" | "attachments" | "tasks" | null` — default `"payments"` (most commonly needed)
- [x] Each section gets a tappable header row: section title + item count + ChevronDown/Up icon
- [x] On mobile (`md:hidden` logic) only the open section body is rendered; on `md+` all sections always show (no change to desktop)
- [x] Section header: `min-h-[44px]` touch target, `flex items-center justify-between`
- [x] Animate open/close with `transition-all` or simple conditional render (no complex animation library)

**Commit: `c362780`**

---

## Phase 5 — Bulk Dialog iOS Scroll Fix

The three bulk action dialogs in `GuestList.tsx` (bulk status, bulk meal, bulk email) have inner `overflow-y-auto` scroll lists. iOS Safari treats inner scroll areas as a secondary scroll context — users often accidentally scroll the backdrop instead of the list, and momentum scroll doesn't work.

### `src/components/guests/GuestList.tsx`
- [ ] Bulk status dialog inner list: add `overscroll-contain` and `-webkit-overflow-scrolling: touch` style
- [ ] Bulk meal dialog inner list: same
- [ ] Bulk email confirm dialog (will-send + cannot-send lists): same
- [ ] Bulk email sending dialog (sent/error progress list): same
- [ ] Bulk email done dialog: same
- [ ] Ensure all these inner lists have explicit `max-h` so scroll activates (e.g. `max-h-48` or `max-h-60`)

**Commit after Phase 5 complete.**

---

## Phase 6 — Pull-to-Refresh ✅ COMPLETE

Standard iOS pattern for refreshing list data. Pulling down past a threshold triggers a reload. Useful when another user (or the app background sync) has changed data.

### New file: `src/hooks/usePullToRefresh.ts`
- [x] Hook accepts `onRefresh: () => void` and a ref to the scrollable container
- [x] Tracks `touchstart` / `touchmove` / `touchend` on the container
- [x] Only activates when `scrollTop === 0` and drag direction is downward
- [x] Returns `{ isPulling: boolean; pullDistance: number; isRefreshing: boolean }`
- [x] Triggers `onRefresh` when pull exceeds 64px threshold and user releases
- [x] Prevents default scroll during active pull to avoid bounce conflict with Safari

### `src/components/guests/GuestList.tsx`
- [x] Apply `usePullToRefresh` to the main list container, wired to `router.refresh()`
- [x] Show spinner/indicator at top of list when `isPulling` or `isRefreshing`

### `src/components/tasks/TasksPageClient.tsx`
- [x] Apply `usePullToRefresh` wired to `router.refresh()`

### `src/components/payments/PaymentsList.tsx`
- [x] Apply `usePullToRefresh` wired to `router.refresh()`

**Commit: `0310037`**

---

## Phase 7 — Swipe-to-Action on List Items ✅ COMPLETE

iOS-native swipe-left gesture to reveal action buttons (complete, delete) on list items. High friction operations currently require: tap card → find button → confirm. Swipe handles the common case in one gesture.

### New file: `src/components/ui/SwipeableRow.tsx`
- [x] Wraps any content; tracks `touchstart` / `touchmove` / `touchend`
- [x] Horizontal drag reveals action buttons on the right (slides content left)
- [x] Max reveal: 120px (room for 2 buttons)
- [x] Snap: if drag > 60px on release → snap open; if < 60px → snap closed
- [x] Tap outside an open row → closes it
- [x] Only one row open at a time (close others when a new one opens)
- [x] Disabled on `md+` screens — pointer events only
- [x] Props: `actions: Array<{ icon, label, colour, onClick }>`, `disabled?: boolean`

### `src/components/guests/GuestList.tsx` (mobile card view)
- [x] Wrap mobile guest card in `<SwipeableRow>` with actions:
  - Delete (red, Trash2 icon) — triggers existing delete handler with confirm
- [x] Note: no Complete action (guests don't have a complete state)

### `src/components/tasks/TasksPageClient.tsx` (task rows)
- [x] Wrap task row in `<SwipeableRow>` with actions:
  - Complete (green, Check icon) — triggers toggle complete (only when `can.completeTasks`)
  - Delete (red, Trash2 icon) — triggers delete (only when `can.editTasks`)

**Commit: `ed3e6ca`**

---

## Summary

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Input modes & keyboard types | ✅ Complete |
| 2 | Guest detail sticky save button | ✅ Complete |
| 3 | Bottom navigation bar | ✅ Complete |
| 4 | Supplier detail progressive disclosure | ✅ Complete |
| 5 | Bulk dialog iOS scroll fix | ✅ Complete |
| 6 | Pull-to-refresh | ✅ Complete |
| 7 | Swipe-to-action on list items | ✅ Complete |

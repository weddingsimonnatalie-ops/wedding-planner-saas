# Switch Wedding Button — Design Spec

**Date:** 2026-04-15

## Context

Users can belong to multiple weddings (e.g. a planner managing several couples). The `/select-wedding` page already exists and handles switching the active wedding cookie. However, there is no way to reach it once logged in — the only trigger is the post-login redirect when a user has 2+ weddings. This spec adds a "Switch Wedding" button to the user profile area so users can switch at any time.

The button must only appear when the user belongs to more than one wedding (no point showing it for single-wedding accounts).

## Approach

Pass a `weddingCount` integer from the server layout down to the UI components. No client-side fetch required — the count is computed server-side in the existing `Promise.all` in the dashboard layout.

## Changes

### 1. `src/app/(dashboard)/layout.tsx`

Add a `weddingMember.count` query to the existing `Promise.all`:

```ts
prisma.weddingMember.count({ where: { userId: ctx.userId } })
```

Pass the result as `weddingCount` prop to `<LayoutShell>`.

### 2. `src/components/LayoutShell.tsx`

- Add `weddingCount?: number` to `LayoutShellProps`
- When `weddingCount > 1`, render a `<Link href="/select-wedding">` in the desktop header between the user name link and the sign out button
- Use the `ArrowLeftRight` icon (lucide-react) with label "Switch Wedding" (hidden on small screens, consistent with existing sign out label)
- Forward `weddingCount` to `<MobileMenu>`

### 3. `src/components/MobileMenu.tsx`

- Add `weddingCount?: number` to `MobileMenuProps`
- When `weddingCount > 1`, render a "Switch Wedding" `<Link href="/select-wedding">` in the profile/sign out section, between "Profile" and "Sign out"
- Use the `ArrowLeftRight` icon, same style as existing Profile and Sign out items

## Files Changed

| File | Change |
|------|--------|
| `src/app/(dashboard)/layout.tsx` | Add `weddingMember.count` to `Promise.all`; pass `weddingCount` to `LayoutShell` |
| `src/components/LayoutShell.tsx` | Accept + conditionally render switch button; forward prop to MobileMenu |
| `src/components/MobileMenu.tsx` | Accept + conditionally render switch link item |

## Verification

1. Log in as a user with **one** wedding — "Switch Wedding" button must not appear on desktop header or mobile menu
2. Log in as a user with **two or more** weddings — button appears in desktop header (between profile and sign out) and in mobile menu (between Profile and Sign out)
3. Click the button — navigates to `/select-wedding`; selecting a wedding redirects to `/` with the new wedding active
4. Confirm no visual regressions on the header/mobile menu for single-wedding users

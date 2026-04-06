---
name: feedback-chrome-focus-fix
description: Chrome loses input focus on state update; use scroll:false and focus restoration
type: feedback
---

## Issue
Chrome desktop loses input focus after each character typed in search fields when multiple results are displayed. Safari and iOS do not have this issue.

## Root Cause
Next.js App Router's focus management interferes with input focus during client-side navigation. When `router.push` is called, Next.js tries to manage scroll and focus, which can steal focus from inputs. This is a known issue tracked in [GitHub Issue #54838](https://github.com/vercel/next.js/issues/54838).

## Solution
1. **Use `scroll: false`** in `router.push` calls to prevent Next.js focus management
2. **Wrap in `startTransition`** to help React batch updates
3. **Use `useLayoutEffect` with `requestAnimationFrame`** to restore focus if Chrome still loses it
4. **Track typing state** with a ref to skip URL sync during active typing
5. **Add `autoComplete="off"`** to prevent Chrome autofill interference

## Code Pattern
```tsx
const isTypingRef = useRef(false);
const searchInputRef = useRef<HTMLInputElement>(null);

function navigateFilter(url: string) {
  startTransition(() => router.push(url, { scroll: false }));
}

useLayoutEffect(() => {
  if (isTypingRef.current && searchInputRef.current) {
    const rafId = requestAnimationFrame(() => {
      if (isTypingRef.current && searchInputRef.current && document.activeElement !== searchInputRef.current) {
        searchInputRef.current.focus();
        const len = searchInputRef.current.value.length;
        searchInputRef.current.setSelectionRange(len, len);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }
}, [searchValue]);
```

**Why:** Without these fixes, Chrome's focus management and Next.js navigation cause focus to shift to container elements during re-renders.
**How to apply:** Use this pattern for any search input that triggers URL-based filtering in Next.js App Router.
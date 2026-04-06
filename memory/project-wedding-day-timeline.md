---
name: Wedding day timeline
description: Wedding day schedule feature — timeline events with configurable categories, managed from Settings
type: project
---

**Status:** ✅ COMPLETE (merged to main)

---

## Overview

Wedding day timeline feature for planning the schedule — tracking times, vendor arrivals, photo sessions, music cues, and key moments. Event types are configurable categories managed from Settings → Categories.

---

## Architecture

### Database Models

```prisma
model TimelineCategory {
  id             String           @id @default(cuid())
  weddingId      String
  wedding        Wedding          @relation(...)
  name           String
  colour         String           @default("#6366f1")
  sortOrder      Int              @default(0)
  isActive       Boolean          @default(true)
  timelineEvents TimelineEvent[]
  createdAt      DateTime         @default(now())

  @@index([weddingId])
}

model TimelineEvent {
  id           String            @id @default(cuid())
  weddingId    String
  wedding      Wedding           @relation(...)
  startTime    DateTime
  durationMins Int               @default(30)
  title        String
  location     String?
  notes        String?
  categoryId   String?           // Optional — can be null if category deleted
  category     TimelineCategory? @relation(...)
  supplierId   String?
  supplier     Supplier?         @relation(...)
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  @@index([weddingId])
  @@index([weddingId, startTime])
}
```

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/timeline` | GET | Get all timeline events for wedding, sorted by startTime |
| `/api/timeline` | POST | Create event (ADMIN only) |
| `/api/timeline/[id]` | PUT | Update event (ADMIN only) |
| `/api/timeline/[id]` | DELETE | Delete event (ADMIN only) |
| `/api/timeline-categories` | GET | Get all categories for wedding |
| `/api/timeline-categories` | POST | Create category (ADMIN only) |
| `/api/timeline-categories/[id]` | PUT | Update category (ADMIN only) |
| `/api/timeline-categories/[id]` | DELETE | Delete category (ADMIN only, nullifies events) |
| `/api/timeline-categories/reorder` | PUT | Reorder categories (ADMIN only) |

### UI Components

- **TimelinePage** (`/timeline`) — Server component, passes to TimelineList
- **TimelineList** — Lists events chronologically with colour-coded category badges
- **TimelineEventModal** — Add/edit modal with dynamic category dropdown
- **TimelinePrintView** — Opens print-friendly view with custom CSS
- **CategoriesManager** — Manages categories in Settings → Categories tab

### Permissions

| Action | ADMIN | VIEWER | RSVP_MANAGER |
|--------|-------|--------|---------------|
| View timeline | ✅ | ✅ | ✅ |
| Create/edit/delete events | ✅ | ❌ | ❌ |
| Manage categories | ✅ | ❌ | ❌ |

---

## Migration Notes

**Migration:** `20260401010000_timeline_category`

1. Creates `TimelineCategory` table
2. Adds `categoryId` column to `TimelineEvent` (nullable)
3. Seeds 8 default categories per wedding: Prep, Transport, Ceremony, Photo, Reception, Food, Music, General
4. Migrates existing `eventType` enum values to category IDs
5. Drops `TimelineEventType` enum

Default colours match the original hardcoded values (pink, blue, purple, amber, green, orange, indigo, gray).

---

## Navigation

Timeline appears in the sidebar and mobile menu between **Budget** and **Settings**. It is also included in the mobile bottom navigation bar (after Payments, before More button) since 2026-04-05.

---

## Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | TimelineCategory and TimelineEvent models |
| `prisma/migrations/20260401010000_timeline_category/` | Migration SQL |
| `src/app/(dashboard)/timeline/page.tsx` | Timeline page |
| `src/app/api/timeline/route.ts` | GET/POST events |
| `src/app/api/timeline/[id]/route.ts` | PUT/DELETE events |
| `src/app/api/timeline-categories/route.ts` | GET/POST categories |
| `src/app/api/timeline-categories/[id]/route.ts` | PUT/DELETE categories |
| `src/app/api/timeline-categories/reorder/route.ts` | Reorder categories |
| `src/components/timeline/TimelineList.tsx` | Event list with category badges |
| `src/components/timeline/TimelineEventModal.tsx` | Add/edit modal |
| `src/components/timeline/TimelinePrintView.tsx` | Print view |
| `src/components/settings/SettingsClient.tsx` | Categories tab with Timeline section |
| `src/components/settings/CategoriesManager.tsx` | Shared category manager (now supports "timeline") |
# Wedding Day Timeline Implementation Plan

## Overview

A dedicated feature for planning the wedding day schedule - tracking times, vendor arrivals, photo sessions, music cues, and key moments. Helps couples coordinate the day and share the timeline with vendors and wedding party.

---

## Current State

**Existing models:**
- `Appointment` - general appointments with date/time/location
- `Supplier` - vendors with status tracking
- `Wedding.weddingDate` - the big day

**Current timeline capabilities:**
- Appointments can track vendor meetings
- No day-of schedule view
- No time-based grouping or visual timeline
- No vendor arrival tracking specific to wedding day

---

## Proposed Architecture

### 1. Database Schema Changes

```prisma
model TimelineEvent {
  id           String          @id @default(cuid())
  weddingId    String
  wedding      Wedding         @relation(fields: [weddingId], references: [id], onDelete: Cascade)

  // Timing
  startTime    DateTime        // Time this event starts
  durationMins Int             @default(30) // Duration in minutes

  // Content
  title        String          // "Hair & Makeup", "First Look", "Ceremony"
  location     String?         // "Bride's Room", "Garden", "Grand Ballroom"
  notes        String?         // Additional details

  // Categorization
  eventType    TimelineEventType @default(GENERAL)

  // Vendor link (optional)
  supplierId   String?
  supplier     Supplier?       @relation(fields: [supplierId], references: [id], onDelete: SetNull)

  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  @@index([weddingId])
  @@index([weddingId, startTime])
}

enum TimelineEventType {
  PREP          // Hair, makeup, getting ready
  TRANSPORT     // Travel between locations
  CEREMONY      // Ceremony events
  PHOTO         // Photo sessions
  RECEPTION     // Reception events
  FOOD          // Meal service
  MUSIC         // First dance, bouquet toss
  GENERAL       // Other events
}
```

---

### 2. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/timeline` | GET | Get all timeline events for wedding day, sorted by time |
| `/api/timeline` | POST | Create timeline event |
| `/api/timeline/[id]` | PUT | Update timeline event |
| `/api/timeline/[id]` | DELETE | Delete timeline event |

**GET `/api/timeline` response:**
```json
{
  "weddingDate": "2024-06-15",
  "events": [
    {
      "id": "e1",
      "startTime": "2024-06-15T08:00:00Z",
      "durationMins": 120,
      "title": "Hair & Makeup",
      "location": "Bridal Suite",
      "eventType": "PREP",
      "supplier": { "id": "s1", "name": "Glam Studio" },
      "notes": "Bride + bridesmaids"
    }
  ]
}
```

---

### 3. UI Components

#### Timeline Page (`/timeline`)
- Header: "Wedding Day Timeline" + "Add event" button (ADMIN only)
- Date display (wedding date from settings)
- Chronological list of events (sorted by startTime)
- Event cards with time, title, location, vendor badge
- Colour-coded by event type

#### TimelineEventCard
- Shows: Time, title, duration, location, vendor badge (if linked)
- Colour-coded by event type
- Actions: Edit, Delete (ADMIN only)

#### TimelineEventModal
- Form fields:
  - Title (required)
  - Start time (time picker)
  - Duration (dropdown: 15min, 30min, 45min, 1hr, 1.5hr, 2hr)
  - Location (text)
  - Event type dropdown
  - Linked vendor (optional, dropdown from suppliers)
  - Notes (textarea)

#### Print View
- Print button opens new window
- Time + Title + Location + Notes columns
- A4 portrait, clean printable layout

---

### 4. Implementation Phases

#### Phase 1: Database + API
1. Create migration for `TimelineEvent` model and enums
2. Create `/api/timeline` routes (GET, POST)
3. Create `/api/timeline/[id]` routes (PUT, DELETE)
4. Add permissions to `api-auth.ts`

#### Phase 2: Timeline Page
1. Create `/timeline` page component
2. Create `TimelineList` client component
3. Create `TimelineEventCard` component
4. Create `TimelineEventModal` for add/edit
5. Implement event CRUD

#### Phase 3: Print View
1. Create `TimelinePrintView` component
2. Print button opens new window
3. Clean printable layout (time, title, location, notes)

#### Phase 4: Polish
1. Mobile responsive design
2. Link vendors from supplier list (optional field in form)

---

### 5. Permissions

| Action | ADMIN | VIEWER | RSVP_MANAGER |
|--------|-------|--------|---------------|
| View timeline | ✅ | ✅ | ✅ |
| Create/edit/delete events | ✅ | ❌ | ❌ |

All roles can view the timeline. Only ADMIN can edit.

---

### 6. Files to Create/Modify

**New files:**
- `prisma/migrations/...` - Migration for TimelineEvent model
- `src/app/(dashboard)/timeline/page.tsx` - Timeline page
- `src/components/timeline/TimelineList.tsx` - Main client component
- `src/components/timeline/TimelineEventCard.tsx` - Event display card
- `src/components/timeline/TimelineEventModal.tsx` - Add/edit modal
- `src/components/timeline/TimelinePrintView.tsx` - Print layout
- `src/app/api/timeline/route.ts` - GET, POST
- `src/app/api/timeline/[id]/route.ts` - PUT, DELETE

**Modified files:**
- `prisma/schema.prisma` - Add TimelineEvent model and enums
- `src/components/LayoutShell.tsx` - Add Timeline nav item
- `src/lib/permissions.ts` - Add timeline permissions
- `src/hooks/usePermissions.ts` - Expose timeline permissions

---

### 7. Migration SQL

```sql
-- Create enum
CREATE TYPE "TimelineEventType" AS ENUM ('PREP', 'TRANSPORT', 'CEREMONY', 'PHOTO', 'RECEPTION', 'FOOD', 'MUSIC', 'GENERAL');

-- Create TimelineEvent table
CREATE TABLE "TimelineEvent" (
  "id" TEXT NOT NULL,
  "weddingId" TEXT NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "durationMins" INTEGER NOT NULL DEFAULT 30,
  "title" TEXT NOT NULL,
  "location" TEXT,
  "notes" TEXT,
  "eventType" "TimelineEventType" NOT NULL DEFAULT 'GENERAL',
  "supplierId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimelineEvent_weddingId_idx" ON "TimelineEvent"("weddingId");
CREATE INDEX "TimelineEvent_weddingId_startTime_idx" ON "TimelineEvent"("weddingId", "startTime");

ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_weddingId_fkey"
  FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

---

### 8. Edge Cases

1. **Events spanning midnight** - Allow events past midnight (reception ending at 1 AM)
2. **Overlapping events** - Allow (parallel tracks are common — photos during cocktail hour)
3. **No wedding date set** - Timeline still works, just no date context
4. **Duration changes** - UI calculates end time from start + duration
# In-App Notifications Implementation Plan

## Overview

A real-time notification system that alerts users about important events: task due dates, overdue payments, RSVP updates, vendor communications, and system messages. Includes a bell icon in the header, notification center dropdown, and optional email digests.

---

## Current State

**Existing notification mechanisms:**
- Email reminders for appointments (via daemon)
- Payment reminder emails (manual trigger)
- Dashboard widgets show overdue items
- Sidebar badges for tasks/payments/appointments count

**Missing:**
- No real-time in-app notifications
- No notification history
- No notification preferences per user
- No notification center UI

---

## Proposed Architecture

### 1. Database Schema

```prisma
model Notification {
  id          String           @id @default(cuid())
  weddingId   String
  wedding     Wedding          @relation(fields: [weddingId], references: [id], onDelete: Cascade)
  userId      String?          // Null = broadcast to all wedding members
  user        User?            @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Content
  type        NotificationType
  title       String           // Short title: "Payment overdue"
  message     String           // Full message: "The £500 deposit to Grand Venue is 3 days overdue"
  actionUrl   String?          // Link to relevant page: "/suppliers/abc123"

  // Related entity (optional)
  entityType  String?          // "Payment", "Guest", "Task", "Supplier"
  entityId    String?          // ID of related entity

  // State
  isRead      Boolean          @default(false)
  readAt      DateTime?
  isDismissed Boolean          @default(false)
  dismissedAt DateTime?

  // Email status
  emailSent   Boolean          @default(false)
  emailedAt   DateTime?

  priority    NotificationPriority @default(NORMAL)

  createdAt   DateTime         @default(now())
  expiresAt   DateTime?        // Auto-delete after date

  @@index([weddingId])
  @@index([userId])
  @@index([weddingId, isRead])
  @@index([createdAt])
}

enum NotificationType {
  PAYMENT_DUE
  PAYMENT_OVERDUE
  TASK_DUE
  TASK_OVERDUE
  RSVP_RECEIVED
  RSVP_UPDATED
  GUEST_UNSUBSCRIBED
  APPOINTMENT_REMINDER
  VENDOR_EMAIL_RECEIVED
  VENDOR_STATUS_CHANGED
  TRIAL_ENDING
  SUBSCRIPTION_ISSUE
  SYSTEM
}

enum NotificationPriority {
  LOW       // Grey, informational
  NORMAL    // Blue, default
  HIGH      // Amber, needs attention
  URGENT    // Red, immediate action required
}

model NotificationPreference {
  id           String  @id @default(cuid())
  weddingId    String
  wedding     Wedding @relation(fields: [weddingId], references: [id], onDelete: Cascade)
  userId      String
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Per-type preferences
  paymentDue      Boolean @default(true)
  paymentOverdue  Boolean @default(true)
  taskDue         Boolean @default(true)
  taskOverdue     Boolean @default(true)
  rsvpReceived    Boolean @default(true)
  rsvpUpdated     Boolean @default(false)
  guestUnsubscribed Boolean @default(true)
  appointmentReminder Boolean @default(true)
  vendorStatusChanged Boolean @default(true)
  systemNotifications Boolean @default(true)

  // Delivery preferences
  inAppEnabled    Boolean @default(true)
  emailEnabled    Boolean @default(false)
  emailDigest     String  @default("NONE") // "NONE", "DAILY", "WEEKLY"
  digestTime      Int     @default(9) // Hour of day (0-23)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([weddingId, userId])
  @@index([weddingId])
}
```

---

### 2. Notification Sources

Notifications are generated from various events in the system:

| Event | Notification Type | Priority | Source |
|-------|------------------|----------|--------|
| Payment due in 7 days | `PAYMENT_DUE` | NORMAL | Daily cron |
| Payment overdue | `PAYMENT_OVERDUE` | HIGH | Daily cron |
| Task due in 3 days | `TASK_DUE` | NORMAL | Daily cron |
| Task overdue | `TASK_OVERDUE` | HIGH | Daily cron |
| Guest submits RSVP | `RSVP_RECEIVED` | NORMAL | RSVP API |
| Guest updates RSVP | `RSVP_UPDATED` | LOW | RSVP API |
| Guest unsubscribes | `GUEST_UNSUBSCRIBED` | NORMAL | Unsubscribe API |
| Appointment in 24hrs | `APPOINTMENT_REMINDER` | NORMAL | Daily cron |
| Vendor status changes | `VENDOR_STATUS_CHANGED` | NORMAL | Supplier API |
| Trial ending in 7 days | `TRIAL_ENDING` | HIGH | Stripe webhook |
| Subscription payment failed | `SUBSCRIPTION_ISSUE` | URGENT | Stripe webhook |

---

### 3. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/notifications` | GET | List notifications (paginated, filterable by read/unread) |
| `/api/notifications/count` | GET | Get unread count for header badge |
| `/api/notifications/[id]/read` | POST | Mark notification as read |
| `/api/notifications/[id]/dismiss` | POST | Dismiss notification |
| `/api/notifications/mark-all-read` | POST | Mark all as read |
| `/api/notifications/preferences` | GET | Get user preferences |
| `/api/notifications/preferences` | PUT | Update preferences |

**GET `/api/notifications` response:**
```json
{
  "notifications": [
    {
      "id": "n1",
      "type": "PAYMENT_OVERDUE",
      "title": "Payment overdue",
      "message": "The £500 deposit to Grand Venue is 3 days overdue",
      "actionUrl": "/suppliers/abc123",
      "priority": "HIGH",
      "isRead": false,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "unreadCount": 5,
  "hasMore": true
}
```

---

### 4. UI Components

#### NotificationBell (Header)
- Bell icon with badge (unread count)
- Positioned in LayoutShell header
- Badge: red circle with number (max 99+)
- Click → opens notification dropdown
- Pulse animation for new notifications

#### NotificationDropdown
- Positioned below bell icon
- Shows recent 10 notifications
- "Mark all read" button
- "View all" link to notification center
- Each notification shows:
  - Icon (based on type)
  - Title (bold if unread)
  - Message (truncated)
  - Timestamp (relative: "2 hours ago")
  - Priority indicator (colored dot)

#### NotificationCenter (`/notifications`)
- Full-page notification list
- Filters: All / Unread / By type
- Mark individual as read/dismiss
- Mark all as read
- Bulk actions
- Infinite scroll or pagination

#### NotificationPreferences (`/settings/notifications`)
- Per-type enable/disable toggles
- Email digest settings
- Quiet hours (optional)

---

### 5. Real-Time Updates

**Option A: Polling (simpler)**
- Client polls `/api/notifications/count` every 60 seconds
- Badge updates without page refresh
- Good enough for MVP

**Option B: Server-Sent Events (SSE)**
- Open persistent connection to `/api/notifications/stream`
- Server pushes new notifications in real-time
- More complex but instant updates

**Option C: WebSockets (via Pusher/Ably)**
- Third-party service handles real-time
- Best for multi-device sync
- Adds cost and complexity

**Recommendation:** Start with Option A (polling), upgrade to SSE if needed.

---

### 6. Implementation Phases

#### Phase 1: Database + API (Day 1)
1. Create migration for `Notification` and `NotificationPreference` models
2. Create `/api/notifications` routes (GET, count)
3. Create notification read/dismiss routes
4. Create notification preferences routes

#### Phase 2: Notification Generation (Day 2)
1. Create `src/lib/notifications.ts` utility
2. Add notification creation to payment/task/guest flows
3. Create daily cron job for due/overdue checks
4. Generate notifications for existing overdue items

#### Phase 3: Notification UI (Day 3)
1. Create NotificationBell component
2. Create NotificationDropdown component
3. Add to LayoutShell header
4. Create NotificationCenter page

#### Phase 4: Preferences + Email (Day 4)
1. Create NotificationPreferences settings page
2. Add email digest generation
3. Add digest cron job (daily/weekly)
4. Respect user preferences in notification creation

#### Phase 5: Polish (Day 5)
1. Notification grouping (by type/date)
2. Bulk actions (mark all read, dismiss all)
3. Notification expiry cleanup (delete old notifications)
4. Mobile responsive dropdown
5. Keyboard shortcuts (Esc to close, N for notification center)

---

### 7. Permissions

| Action | ADMIN | VIEWER | RSVP_MANAGER |
|--------|-------|--------|---------------|
| View notifications | ✅ | ✅ | ✅ |
| Dismiss notifications | ✅ | ✅ | ✅ |
| Manage own preferences | ✅ | ✅ | ✅ |
| View all notifications | ✅ | ✅ | ❌ (filtered) |

RSVP_MANAGER sees only RSVP-related notifications.

---

### 8. Files to Create/Modify

**New files:**
- `src/app/(dashboard)/notifications/page.tsx` - Notification center
- `src/components/notifications/NotificationBell.tsx` - Header bell icon
- `src/components/notifications/NotificationDropdown.tsx` - Dropdown panel
- `src/components/notifications/NotificationItem.tsx` - Single notification
- `src/components/notifications/NotificationCenter.tsx` - Full page list
- `src/app/api/notifications/route.ts` - GET list
- `src/app/api/notifications/count/route.ts` - GET unread count
- `src/app/api/notifications/[id]/read/route.ts` - POST mark read
- `src/app/api/notifications/[id]/dismiss/route.ts` - POST dismiss
- `src/app/api/notifications/mark-all-read/route.ts` - POST bulk read
- `src/app/api/notifications/preferences/route.ts` - GET/PUT preferences
- `src/lib/notifications.ts` - Notification creation utility
- `src/lib/inngest/functions/notification-checks.ts` - Daily cron

**Modified files:**
- `prisma/schema.prisma` - Add Notification models
- `src/components/LayoutShell.tsx` - Add NotificationBell
- `src/app/api/guests/[id]/route.ts` - Generate RSVP notifications
- `src/app/api/suppliers/[id]/route.ts` - Generate vendor notifications
- `src/inngest/index.ts` - Register notification cron

---

### 9. Migration SQL

```sql
-- Create enum types
CREATE TYPE "NotificationType" AS ENUM (
  'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'TASK_DUE', 'TASK_OVERDUE',
  'RSVP_RECEIVED', 'RSVP_UPDATED', 'GUEST_UNSUBSCRIBED',
  'APPOINTMENT_REMINDER', 'VENDOR_EMAIL_RECEIVED', 'VENDOR_STATUS_CHANGED',
  'TRIAL_ENDING', 'SUBSCRIPTION_ISSUE', 'SYSTEM'
);

CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- Create Notification table
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "weddingId" TEXT NOT NULL,
  "userId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actionUrl" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "isDismissed" BOOLEAN NOT NULL DEFAULT false,
  "dismissedAt" TIMESTAMP(3),
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "emailedAt" TIMESTAMP(3),
  "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_weddingId_idx" ON "Notification"("weddingId");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_weddingId_isRead_idx" ON "Notification"("weddingId", "isRead");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_weddingId_fkey"
  FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create NotificationPreference table
CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "weddingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "paymentDue" BOOLEAN NOT NULL DEFAULT true,
  "paymentOverdue" BOOLEAN NOT NULL DEFAULT true,
  "taskDue" BOOLEAN NOT NULL DEFAULT true,
  "taskOverdue" BOOLEAN NOT NULL DEFAULT true,
  "rsvpReceived" BOOLEAN NOT NULL DEFAULT true,
  "rsvpUpdated" BOOLEAN NOT NULL DEFAULT false,
  "guestUnsubscribed" BOOLEAN NOT NULL DEFAULT true,
  "appointmentReminder" BOOLEAN NOT NULL DEFAULT true,
  "vendorStatusChanged" BOOLEAN NOT NULL DEFAULT true,
  "systemNotifications" BOOLEAN NOT NULL DEFAULT true,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "emailDigest" TEXT NOT NULL DEFAULT 'NONE',
  "digestTime" INTEGER NOT NULL DEFAULT 9,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_weddingId_userId_key" UNIQUE ("weddingId", "userId")
);

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_weddingId_fkey"
  FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

### 10. Edge Cases

1. **Notification for deleted entity** - Use soft reference, actionUrl may 404
2. **Notification for user without wedding membership** - Filter by weddingId
3. **Multiple users same wedding** - Broadcast (userId = null) or individual
4. **Notification spam** - Rate limit creation, group similar notifications
5. **Old notifications** - Auto-delete after 30 days (expiresAt)
6. **User disabled notifications** - Still create but don't deliver (for history)

---

### 11. Future Enhancements

- Push notifications (browser or mobile app)
- Slack/Discord webhook integration
- Notification templates (customizable messages)
- Actionable notifications (buttons: "Pay now", "View guest")
- Notification analytics (open rate, action rate)
- Quiet hours (no notifications during specified times)
- Per-wedding notification branding
- SMS notifications (Twilio integration)
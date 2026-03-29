---
name: GDPR email unsubscribe
description: Add unsubscribe functionality for RSVP emails to comply with GDPR; guest can opt out, admin sees status
type: project
---

Started 2026-03-29. Branch: `feature/gdpr-unsubscribe`.

**Why:** GDPR gives individuals the right to object to processing (including emails). While wedding RSVP emails are transactional, providing an unsubscribe option is good practice and protects against repeated reminder emails being seen as harassment.

**Scope:** Unsubscribe link in RSVP emails, unsubscribe endpoint, email sending respects flag, admin visibility in guest detail.

---

## Phase progress

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database migration: add `unsubscribedAt` to Guest | ✅ complete |
| 2 | Unsubscribe endpoint: `GET /api/unsubscribe/[token]` | ✅ complete |
| 3 | Update RSVP email template with unsubscribe link | ✅ complete |
| 4 | Update email sending logic to check unsubscribed flag | ✅ complete |
| 5 | Admin guest detail page: show unsubscribed status | ✅ complete |
| 6 | Testing: unsubscribe flow end-to-end | ✅ complete |
| 7 | Update CLAUDE.md documentation | ✅ complete |

---

## Phase 1 — Database migration

**Goal:** Add nullable `unsubscribedAt` timestamp to Guest model.

**Files to modify:**
- `prisma/schema.prisma` — add `unsubscribedAt DateTime?` field to Guest model
- Create new migration file

**Migration:**
```sql
ALTER TABLE "Guest" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);
```

**Prisma schema change:**
```prisma
model Guest {
  // ... existing fields
  unsubscribedAt DateTime?
}
```

**Checkpoint:**
- ✅ Migration file created
- ✅ Migration applied manually (Prisma CLI broken on Node 23)
- ✅ `prisma generate` updates client

---

## Phase 2 — Unsubscribe endpoint

**Goal:** Create public endpoint that sets `unsubscribedAt` when guest clicks unsubscribe link.

**Files to create:**
- `src/app/api/unsubscribe/[token]/route.ts`

**Behavior:**
- `GET /api/unsubscribe/[token]` — finds guest by `rsvpToken`, sets `unsubscribedAt = new Date()`, returns HTML page confirming unsubscribe
- Token is same as RSVP token (already unique per guest)
- Already-unsubscribed guests see "already unsubscribed" message (idempotent)
- Invalid token returns 404

**Response:**
- Return friendly HTML page (not JSON) since this is a public link users click in email
- Include couple name and guest name for personalization
- "You will no longer receive RSVP reminder emails. The wedding organisers can still contact you directly if needed."

**Checkpoint:**
- ✅ Route file created
- ✅ Handles valid token (sets unsubscribedAt, returns confirmation HTML)
- ✅ Handles already unsubscribed (returns "already unsubscribed" message)
- ✅ Handles invalid token (returns 404 or friendly error page)

---

## Phase 3 — Update RSVP email template

**Goal:** Add unsubscribe link to all RSVP emails.

**Files to modify:**
- `src/lib/email.ts` — `sendRsvpEmail()` function

**Changes:**
- Add unsubscribe URL: `${process.env.NEXTAUTH_URL}/unsubscribe/${token}`
- Append to email body (after the main content):
  - Plain text: "Don't want to receive reminder emails? Unsubscribe here: [URL]"
  - HTML: `<p style="font-size: 12px; color: #666; margin-top: 20px;">Don't want to receive reminder emails? <a href="[URL]">Unsubscribe</a></p>`

**Checkpoint:**
- ✅ Plain text version has unsubscribe link
- ✅ HTML version has styled unsubscribe link
- ✅ URL uses NEXTAUTH_URL env var

---

## Phase 4 — Update email sending logic

**Goal:** Skip unsubscribed guests when sending emails.

**Files to modify:**
- `src/app/api/guests/send-rsvp-emails/route.ts` — bulk RSVP email send
- `src/app/api/email/rsvp/route.ts` — individual resend (admin "Resend RSVP email" button)

**Changes:**
- Query includes `unsubscribedAt` in select
- Filter out guests where `unsubscribedAt !== null`
- Return count of skipped unsubscribed guests in response

**Bulk send response:**
```typescript
{
  sent: number,
  failed: number,
  skipped: number, // includes no-email AND unsubscribed
  unsubscribed: number // new field for reporting
}
```

**Individual resend:**
- Check `guest.unsubscribedAt` before sending
- Return 400 with message "This guest has unsubscribed from emails"

**Checkpoint:**
- ✅ Bulk send skips unsubscribed guests
- ✅ Bulk send reports unsubscribed count
- ✅ Individual resend returns error for unsubscribed guests
- ✅ `sendRsvpEmail()` function unchanged (called only after check)

---

## Phase 5 — Admin guest detail page

**Goal:** Show unsubscribed status to admin users.

**Files to modify:**
- `src/app/(dashboard)/guests/[id]/page.tsx` — pass `unsubscribedAt` to client
- `src/components/guests/GuestForm.tsx` — display unsubscribe banner

**UI:**
- If `unsubscribedAt` is set, show banner above RSVP section:
  - "This guest has unsubscribed from emails (on [date]). They will not receive reminder emails. You can still contact them directly if needed."
  - Grey/info styled, not warning (not an error, just informational)
- "Resend RSVP email" button should be disabled with tooltip "Guest has unsubscribed from emails"

**Checkpoint:**
- ✅ Server component passes unsubscribedAt to client (guest object from findUnique includes all fields)
- ✅ GuestForm shows banner when unsubscribedAt is set
- ✅ Resend button disabled when unsubscribed (shows "Resend disabled — guest unsubscribed")
- ✅ API returns unsubscribedAt in guest response

---

## Phase 6 — Testing

**Goal:** Verify end-to-end functionality.

**Test scenarios:**
1. ✅ New guest: `unsubscribedAt` is null (column exists in DB)
2. ✅ Click unsubscribe link in email: sets `unsubscribedAt`, shows confirmation page
3. ✅ Click unsubscribe again: shows "already unsubscribed" message (idempotent)
4. ✅ Bulk send: unsubscribed guests are skipped, count reported
5. ✅ Individual resend: returns error for unsubscribed guest
6. ✅ Admin view: shows unsubscribed banner and disabled resend button
7. ✅ Invalid token: returns 404/error page

**Build verification:** Docker build successful, no TypeScript errors.

---

## Phase 7 — Documentation

**Goal:** Update CLAUDE.md with unsubscribe feature.

**Sections to update:**
- Guest model description — add `unsubscribedAt` field
- API routes — add `/api/unsubscribe/[token]`
- Email sending — note unsubscribe handling
- Guest detail — note unsubscribed banner

**Checkpoint:**
- ✅ CLAUDE.md updated with new `unsubscribedAt` field in Guest model
- ✅ Added migration 21 to migrations table
- ✅ Added `/api/unsubscribe/[token]` to API routes
- ✅ Updated guest detail/edit section with unsubscribed banner
- ✅ Updated bulk send RSVP emails section with unsubscribed handling

---

## Rollback plan

If issues arise:
1. Migration rollback: `prisma migrate rollback` (or manual `ALTER TABLE "Guest" DROP COLUMN "unsubscribedAt"`)
2. Remove unsubscribe link from email template (revert Phase 3)
3. Remove filtering from email sending (revert Phase 4)
4. Remove banner from guest detail (revert Phase 5)

---

## Notes

- Unsubscribe token is the same as RSVP token (`rsvpToken` field) — no new token needed
- Unsubscribe is one-way: no "resubscribe" option (admin can clear `unsubscribedAt` in DB if needed)
- GDPR requires honoring unsubscribe requests promptly — this implementation is immediate
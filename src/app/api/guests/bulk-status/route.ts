export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { RsvpStatus } from "@prisma/client";
import { isValidRsvpStatus } from "@/lib/validation";
import { getBulkLimits } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const { guestIds, rsvpStatus } = body;

    if (!Array.isArray(guestIds) || guestIds.length === 0) {
        return NextResponse.json({ error: "guestIds must be a non-empty array" }, { status: 400 });
    }

    const { guestLimit } = getBulkLimits();
    if (guestIds.length > guestLimit) {
        return NextResponse.json(
            { error: `Cannot process more than ${guestLimit} guests at once` },
            { status: 400 }
        );
    }

    if (!isValidRsvpStatus(rsvpStatus)) {
        return NextResponse.json({ error: "Invalid rsvpStatus" }, { status: 400 });
    }

    const updated = await withTenantContext(weddingId, async (tx) => {
      // Validate all guestIds exist within this wedding (prevents cross-tenant access)
      const existingGuests = await tx.guest.findMany({
          where: { id: { in: guestIds }, weddingId },
          select: { id: true },
      });

      if (existingGuests.length !== guestIds.length) {
          return null; // signal validation failure
      }

      const isOverride = rsvpStatus !== "PENDING";

      // PARTIAL: update status only, leave attending fields as-is (mixed responses)
      if (rsvpStatus === "PARTIAL") {
          const result = await tx.guest.updateMany({
            where: { id: { in: guestIds }, weddingId },
            data: { rsvpStatus: "PARTIAL", isManualOverride: true },
          });
          return result.count;
      }

      // PENDING / MAYBE: clear all attending fields
      if (rsvpStatus === "PENDING" || rsvpStatus === "MAYBE") {
          const result = await tx.guest.updateMany({
            where: { id: { in: guestIds }, weddingId },
            data: {
              rsvpStatus: rsvpStatus as RsvpStatus,
              isManualOverride: isOverride,
              attendingCeremony:   null,
              attendingReception:  null,
              attendingAfterparty: null,
            },
          });
          return result.count;
      }

      // ACCEPTED / DECLINED: set attending fields per-event based on invitation flags
      // Run sequentially inside the same tenant transaction (cannot nest $transaction)
      const attending = rsvpStatus === "ACCEPTED";

      const statusResult = await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId },
        data: { rsvpStatus: rsvpStatus as RsvpStatus, isManualOverride: true },
      });
      // Invited to each event → set attending true/false
      await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId, invitedToCeremony: true },
        data: { attendingCeremony: attending },
      });
      await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId, invitedToReception: true },
        data: { attendingReception: attending },
      });
      await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId, invitedToAfterparty: true },
        data: { attendingAfterparty: attending },
      });
      // Not invited → null
      await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId, invitedToCeremony: false },
        data: { attendingCeremony: null },
      });
      await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId, invitedToReception: false },
        data: { attendingReception: null },
      });
      await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId, invitedToAfterparty: false },
        data: { attendingAfterparty: null },
      });

      return statusResult.count;
    });

    if (updated === null) {
      return NextResponse.json({ error: "One or more guestIds not found" }, { status: 400 });
    }

    return NextResponse.json({ updated });

  } catch (error) {
    return handleDbError(error);
  }

}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { RsvpStatus } from "@prisma/client";
import { isValidRsvpStatus } from "@/lib/validation";
import { getBulkLimits } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;

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

    // Validate all guestIds exist
    const existingGuests = await prisma.guest.findMany({
        where: { id: { in: guestIds } },
        select: { id: true },
    });

    if (existingGuests.length !== guestIds.length) {
        return NextResponse.json({ error: "One or more guestIds not found" }, { status: 400 });
    }

    const isOverride = rsvpStatus !== "PENDING";

    // PARTIAL: update status only, leave attending fields as-is (mixed responses)
    if (rsvpStatus === "PARTIAL") {
        const result = await prisma.guest.updateMany({
          where: { id: { in: guestIds } },
          data: { rsvpStatus: "PARTIAL", isManualOverride: true },
        });
        return NextResponse.json({ updated: result.count });
    }

    // PENDING / MAYBE: clear all attending fields
    if (rsvpStatus === "PENDING" || rsvpStatus === "MAYBE") {
        const result = await prisma.guest.updateMany({
          where: { id: { in: guestIds } },
          data: {
            rsvpStatus: rsvpStatus as RsvpStatus,
            isManualOverride: isOverride,
            attendingCeremony:   null,
            attendingReception:  null,
            attendingAfterparty: null,
          },
        });
        return NextResponse.json({ updated: result.count });
    }

    // ACCEPTED / DECLINED: set attending fields per-event based on invitation flags
    const attending = rsvpStatus === "ACCEPTED";
    const [statusResult] = await prisma.$transaction([
        prisma.guest.updateMany({
          where: { id: { in: guestIds } },
          data: { rsvpStatus: rsvpStatus as RsvpStatus, isManualOverride: true },
        }),
        // Invited to each event → set attending true/false
        prisma.guest.updateMany({
          where: { id: { in: guestIds }, invitedToCeremony: true },
          data: { attendingCeremony: attending },
        }),
        prisma.guest.updateMany({
          where: { id: { in: guestIds }, invitedToReception: true },
          data: { attendingReception: attending },
        }),
        prisma.guest.updateMany({
          where: { id: { in: guestIds }, invitedToAfterparty: true },
          data: { attendingAfterparty: attending },
        }),
        // Not invited → null
        prisma.guest.updateMany({
          where: { id: { in: guestIds }, invitedToCeremony: false },
          data: { attendingCeremony: null },
        }),
        prisma.guest.updateMany({
          where: { id: { in: guestIds }, invitedToReception: false },
          data: { attendingReception: null },
        }),
        prisma.guest.updateMany({
          where: { id: { in: guestIds }, invitedToAfterparty: false },
          data: { attendingAfterparty: null },
        }),
    ]);

    return NextResponse.json({ updated: statusResult.count });

  } catch (error) {
    return handleDbError(error);
  }

}
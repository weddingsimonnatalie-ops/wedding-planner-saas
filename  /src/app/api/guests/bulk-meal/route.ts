import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getBulkLimits } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;

    const { guestIds, mealChoice } = await req.json();
    if (!Array.isArray(guestIds) || guestIds.length === 0) {
      return NextResponse.json({ error: "guestIds required" }, { status: 400 });
    }

    const { guestLimit } = getBulkLimits();
    if (guestIds.length > guestLimit) {
      return NextResponse.json(
        { error: `Cannot process more than ${guestLimit} guests at once` },
        { status: 400 }
      );
    }

    // Validate all guestIds exist
    const existingGuests = await prisma.guest.findMany({
      where: { id: { in: guestIds } },
      select: { id: true },
    });

    if (existingGuests.length !== guestIds.length) {
      return NextResponse.json({ error: "One or more guestIds not found" }, { status: 400 });
    }

    // Validate mealChoice references an active meal option (if provided)
    if (mealChoice !== null && mealChoice !== undefined) {
      const mealOption = await prisma.mealOption.findFirst({
        where: { id: mealChoice, isActive: true },
      });
      if (!mealOption) {
        return NextResponse.json({ error: "Invalid meal option" }, { status: 400 });
      }
    }

    const result = await prisma.guest.updateMany({
      where: { id: { in: guestIds } },
      data: { mealChoice: mealChoice ?? null },
    });

    return NextResponse.json({ updated: result.count });

  } catch (error) {
    return handleDbError(error);
  }

}
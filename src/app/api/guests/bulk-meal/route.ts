import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { getBulkLimits } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

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

    const result = await withTenantContext(weddingId, async (tx) => {
      // Validate all guestIds exist within this wedding (prevents cross-tenant access)
      const existingGuests = await tx.guest.findMany({
        where: { id: { in: guestIds }, weddingId },
        select: { id: true },
      });

      if (existingGuests.length !== guestIds.length) {
        return { notFound: true, count: 0 };
      }

      // Validate mealChoice references an active meal option (if provided)
      if (mealChoice !== null && mealChoice !== undefined) {
        const mealOption = await tx.mealOption.findFirst({
          where: { id: mealChoice, isActive: true },
        });
        if (!mealOption) {
          return { invalidMeal: true, count: 0 };
        }
      }

      const updateResult = await tx.guest.updateMany({
        where: { id: { in: guestIds }, weddingId },
        data: { mealChoice: mealChoice ?? null },
      });

      return { count: updateResult.count };
    });

    if (result.notFound) {
      return NextResponse.json({ error: "One or more guestIds not found" }, { status: 400 });
    }
    if (result.invalidMeal) {
      return NextResponse.json({ error: "Invalid meal option" }, { status: 400 });
    }

    return NextResponse.json({ updated: result.count });

  } catch (error) {
    return handleDbError(error);
  }

}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/guests/bulk-delete
 *
 * Delete multiple guests by ID. Used by the downgrade gate page
 * when a Free Tier user needs to reduce their guest count to ≤30.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { guestIds } = body as { guestIds?: string[] };

    if (!Array.isArray(guestIds) || guestIds.length === 0) {
      return NextResponse.json({ error: "guestIds must be a non-empty array" }, { status: 400 });
    }

    // Delete guests that belong to this wedding
    const result = await prisma.guest.deleteMany({
      where: {
        id: { in: guestIds },
        weddingId: auth.weddingId,
      },
    });

    console.log(`guests/bulk-delete: deleted ${result.count} guests from wedding ${auth.weddingId}`);

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    return handleDbError(error);
  }
}
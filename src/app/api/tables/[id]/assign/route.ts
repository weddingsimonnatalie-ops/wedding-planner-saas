import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const { guestId } = await req.json();
    if (!guestId) return NextResponse.json({ error: "guestId is required" }, { status: 400 });

    const updatedGuest = await withTenantContext(weddingId, async (tx) => {
      // Validate guest exists and belongs to this wedding
      const guest = await tx.guest.findUnique({ where: { id: guestId, weddingId } });
      if (!guest) throw new Error("INVALID_GUEST");

      const table = await tx.table.findUnique({
        where: { id, weddingId },
        include: { _count: { select: { guests: true } } },
      });

      if (!table) throw new Error("TABLE_NOT_FOUND");

      if (table._count.guests >= table.capacity) {
        throw new Error("TABLE_FULL");
      }

      return tx.guest.update({
        where: { id: guestId, weddingId },
        data: { tableId: id },
        select: {
          id: true, firstName: true, lastName: true, groupName: true,
          rsvpStatus: true, mealChoice: true,
          invitedToCeremony: true, invitedToReception: true, invitedToAfterparty: true,
          attendingReception: true, seatNumber: true,
        },
      });
    });

    return NextResponse.json(updatedGuest);

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_GUEST") return NextResponse.json({ error: "Invalid guestId" }, { status: 400 });
      if (error.message === "TABLE_NOT_FOUND") return NextResponse.json({ error: "Table not found" }, { status: 404 });
      if (error.message === "TABLE_FULL") return NextResponse.json({ error: "Table is at full capacity" }, { status: 400 });
    }
    return handleDbError(error);
  }

}

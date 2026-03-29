export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> }
): Promise<NextResponse> {
  try {
    const { id, guestId } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    await withTenantContext(weddingId, async (tx) => {
      // Validate guest exists and belongs to this wedding
      const guest = await tx.guest.findUnique({ where: { id: guestId, weddingId } });
      if (!guest) throw new Error("GUEST_NOT_FOUND");

      // Validate guest is assigned to this table
      if (guest.tableId !== id) {
        throw new Error("GUEST_NOT_ON_TABLE");
      }

      await tx.guest.update({
        where: { id: guestId, weddingId },
        data: { tableId: null, seatNumber: null },
      });
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "GUEST_NOT_FOUND") return NextResponse.json({ error: "Guest not found" }, { status: 404 });
      if (error.message === "GUEST_NOT_ON_TABLE") return NextResponse.json({ error: "Guest not assigned to this table" }, { status: 400 });
    }
    return handleDbError(error);
  }

}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

import { handleDbError } from "@/lib/db-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> }
): Promise<NextResponse> {
  try {
    const { id, guestId } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;

    // Validate guest exists
    const guest = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) return NextResponse.json({ error: "Guest not found" }, { status: 404 });

    // Validate guest is assigned to this table
    if (guest.tableId !== id) {
        return NextResponse.json({ error: "Guest not assigned to this table" }, { status: 400 });
    }

    await prisma.guest.update({
    where: { id: guestId },
    data: { tableId: null, seatNumber: null },
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

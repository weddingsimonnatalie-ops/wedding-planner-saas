import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

import { handleDbError } from "@/lib/db-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { guestId } = await req.json();
    if (!guestId) return NextResponse.json({ error: "guestId is required" }, { status: 400 });

    // Validate guest exists
    const guest = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) return NextResponse.json({ error: "Invalid guestId" }, { status: 400 });

    const table = await prisma.table.findUnique({
    where: { id: id },
    include: { _count: { select: { guests: true } } },
    });

    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    if (table._count.guests >= table.capacity) {
    return NextResponse.json({ error: "Table is at full capacity" }, { status: 400 });
    }

    const updatedGuest = await prisma.guest.update({
    where: { id: guestId },
    data: { tableId: id },
    select: {
        id: true, firstName: true, lastName: true, groupName: true,
        rsvpStatus: true, mealChoice: true,
        invitedToCeremony: true, invitedToReception: true, invitedToAfterparty: true,
        attendingReception: true, seatNumber: true,
    },
    });

    return NextResponse.json(updatedGuest);

  } catch (error) {
    return handleDbError(error);
  }

}

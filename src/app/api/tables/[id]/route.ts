import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { TableShape, Orientation } from "@prisma/client";
import type { TableUpdateBody } from "@/types/api";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

const GUEST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  groupName: true,
  rsvpStatus: true,
  mealChoice: true,
  invitedToCeremony: true,
  invitedToReception: true,
  invitedToAfterparty: true,
  attendingReception: true,
  seatNumber: true,
} as const;

function buildTableData(body: TableUpdateBody) {
  const { name, shape, capacity, positionX, positionY, rotation, notes, width, height, locked, colour, orientation } = body;
  return {
    ...(name !== undefined ? { name: name?.trim() } : {}),
    ...(shape !== undefined ? { shape: shape as TableShape } : {}),
    ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
    ...(positionX !== undefined ? { positionX: Number(positionX) } : {}),
    ...(positionY !== undefined ? { positionY: Number(positionY) } : {}),
    ...(rotation !== undefined ? { rotation: Number(rotation) } : {}),
    ...(width !== undefined ? { width: Number(width) } : {}),
    ...(height !== undefined ? { height: Number(height) } : {}),
    ...(locked !== undefined ? { locked: Boolean(locked) } : {}),
    ...(colour !== undefined ? { colour: String(colour) } : {}),
    ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
    ...(orientation !== undefined ? { orientation: orientation as Orientation } : {}),
  };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const body = await req.json();

    // Validate field lengths
    const errors = validateFields([
      { value: body.name, field: "tableName" },
      { value: body.notes, field: "tableNotes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const table = await prisma.table.update({
    where: { id: id },
    data: buildTableData(body),
    include: { guests: { select: GUEST_SELECT, orderBy: [{ seatNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }] } },
    });

    // Handle seat reassignment when capacity is reduced
    if (body.capacity !== undefined) {
      const displacedGuests = await prisma.guest.findMany({
        where: {
          tableId: id,
          seatNumber: { gt: body.capacity }
        },
        orderBy: { seatNumber: 'asc' }
      });

      if (displacedGuests.length > 0) {
        // Find available seats (gaps) within new capacity
        const assignedSeats = await prisma.guest.findMany({
          where: { tableId: id, seatNumber: { lte: body.capacity } },
          select: { seatNumber: true }
        });
        const takenSet = new Set(assignedSeats.map(g => g.seatNumber));
        const availableSeats: number[] = [];
        for (let i = 1; i <= body.capacity; i++) {
          if (!takenSet.has(i)) availableSeats.push(i);
        }

        // Reassign displaced guests to available seats (or unassign if no seats available)
        const updates: Promise<unknown>[] = [];
        for (const guest of displacedGuests) {
          const newSeat = availableSeats.shift();
          updates.push(
            prisma.guest.update({
              where: { id: guest.id },
              data: { seatNumber: newSeat ?? null }
            })
          );
        }
        await Promise.all(updates);
      }
    }

    // Re-fetch with updated guests for the response
    const updatedTable = await prisma.table.findUnique({
      where: { id },
      include: { guests: { select: GUEST_SELECT, orderBy: [{ seatNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }] } },
    });

    return NextResponse.json(updatedTable);

  } catch (error) {
    return handleDbError(error);
  }

}

// Silent PATCH — same as PUT but no toast from client
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const body = await req.json();

    // Validate field lengths
    const errors = validateFields([
      { value: body.name, field: "tableName" },
      { value: body.notes, field: "tableNotes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const table = await prisma.table.update({
    where: { id: id },
    data: buildTableData(body),
    include: { guests: { select: GUEST_SELECT, orderBy: [{ seatNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }] } },
    });

    // Handle seat reassignment when capacity is reduced
    if (body.capacity !== undefined) {
      const displacedGuests = await prisma.guest.findMany({
        where: {
          tableId: id,
          seatNumber: { gt: body.capacity }
        },
        orderBy: { seatNumber: 'asc' }
      });

      if (displacedGuests.length > 0) {
        // Find available seats (gaps) within new capacity
        const assignedSeats = await prisma.guest.findMany({
          where: { tableId: id, seatNumber: { lte: body.capacity } },
          select: { seatNumber: true }
        });
        const takenSet = new Set(assignedSeats.map(g => g.seatNumber));
        const availableSeats: number[] = [];
        for (let i = 1; i <= body.capacity; i++) {
          if (!takenSet.has(i)) availableSeats.push(i);
        }

        // Reassign displaced guests to available seats (or unassign if no seats available)
        const updates: Promise<unknown>[] = [];
        for (const guest of displacedGuests) {
          const newSeat = availableSeats.shift();
          updates.push(
            prisma.guest.update({
              where: { id: guest.id },
              data: { seatNumber: newSeat ?? null }
            })
          );
        }
        await Promise.all(updates);
      }
    }

    // Re-fetch with updated guests for the response
    const updatedTable = await prisma.table.findUnique({
      where: { id },
      include: { guests: { select: GUEST_SELECT, orderBy: [{ seatNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }] } },
    });

    return NextResponse.json(updatedTable);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;

    await prisma.guest.updateMany({
    where: { tableId: id },
    data: { tableId: null, seatNumber: null },
    });

    await prisma.table.delete({ where: { id: id } });
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

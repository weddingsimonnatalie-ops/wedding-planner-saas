export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { TableShape, Orientation } from "@prisma/client";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";const GUEST_SELECT = {
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tables = await prisma.table.findMany({
        include: { guests: { select: GUEST_SELECT, orderBy: [{ seatNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }] } },
        orderBy: { createdAt: "asc" },
    });

    return apiJson(tables);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { roomId, name, shape, capacity, positionX, positionY, orientation } = await req.json();

    if (!name?.trim()) {
        return NextResponse.json({ error: "Table name is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: name, field: "tableName", required: true },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    // Validate orientation if provided
    const validOrientation = orientation && Object.values(Orientation).includes(orientation as Orientation)
      ? orientation as Orientation
      : "VERTICAL";

    // Use the first room if no roomId provided
    let resolvedRoomId = roomId;
    if (!resolvedRoomId) {
        let room = await prisma.room.findFirst({ orderBy: { createdAt: "asc" } });
        if (!room) {
          room = await prisma.room.create({
            data: { name: "Main Reception", widthMetres: 20, heightMetres: 15 },
          });
        }
        resolvedRoomId = room.id;
    } else {
        // Validate roomId exists
        const room = await prisma.room.findUnique({ where: { id: resolvedRoomId } });
        if (!room) return NextResponse.json({ error: "Invalid roomId" }, { status: 400 });
    }

    const table = await prisma.table.create({
        data: {
          roomId: resolvedRoomId,
          name: name.trim(),
          shape: (shape as TableShape) ?? "ROUND",
          capacity: Number(capacity) || 8,
          positionX: positionX ?? 50,
          positionY: positionY ?? 50,
          orientation: validOrientation,
        },
        include: { guests: { select: GUEST_SELECT, orderBy: [{ seatNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }] } },
    });

    return NextResponse.json(table, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

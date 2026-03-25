import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import type { RoomUpdateBody, RoomElementInput } from "@/types/api";

import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { widthMetres, heightMetres, name, elements }: RoomUpdateBody = await req.json();

    const room = await prisma.room.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(widthMetres !== undefined ? { widthMetres: Number(widthMetres) } : {}),
        ...(heightMetres !== undefined ? { heightMetres: Number(heightMetres) } : {}),
      },
    });

    // Replace elements if provided
    if (Array.isArray(elements)) {
      await prisma.roomElement.deleteMany({ where: { roomId: id } });
      if (elements.length > 0) {
        await prisma.roomElement.createMany({
          data: elements.map((el: RoomElementInput) => ({
            roomId: id,
            type: el.type,
            label: el.label ?? null,
            positionX: el.positionX,
            positionY: el.positionY,
            width: el.width ?? 10,
            height: el.height ?? 10,
            rotation: el.rotation ?? 0,
            color: el.color ?? "#e2e8f0",
            locked: el.locked ?? false,
          })),
        });
      }
    }

    const updated = await prisma.room.findUnique({
      where: { id },
      include: { elements: true },
    });

    return NextResponse.json(updated);

  } catch (error) {
    return handleDbError(error);
  }

}
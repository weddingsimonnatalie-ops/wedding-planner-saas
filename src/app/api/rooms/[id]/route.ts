import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
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
    const { weddingId } = auth;

    const { widthMetres, heightMetres, name, elements }: RoomUpdateBody = await req.json();

    const updated = await withTenantContext(weddingId, async (tx) => {
      await tx.room.update({
        where: { id, weddingId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(widthMetres !== undefined ? { widthMetres: Number(widthMetres) } : {}),
          ...(heightMetres !== undefined ? { heightMetres: Number(heightMetres) } : {}),
        },
      });

      // Replace elements if provided
      if (Array.isArray(elements)) {
        await tx.roomElement.deleteMany({ where: { roomId: id } });
        if (elements.length > 0) {
          await tx.roomElement.createMany({
            data: elements.map((el: RoomElementInput) => ({
              weddingId,
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

      return tx.room.findUnique({
        where: { id, weddingId },
        include: { elements: true },
      });
    });

    return NextResponse.json(updated);

  } catch (error) {
    return handleDbError(error);
  }

}

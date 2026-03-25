export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let rooms = await prisma.room.findMany({
        include: { elements: true, tables: { include: { guests: { select: { id: true, firstName: true, lastName: true, groupName: true, rsvpStatus: true, mealChoice: true, invitedToCeremony: true, invitedToReception: true, invitedToAfterparty: true } } } } },
        orderBy: { createdAt: "asc" },
    });

    // Create default room if none exists
    if (rooms.length === 0) {
        const room = await prisma.room.create({
          data: { name: "Main Reception", widthMetres: 20, heightMetres: 15 },
          include: { elements: true, tables: { include: { guests: { select: { id: true, firstName: true, lastName: true, groupName: true, rsvpStatus: true, mealChoice: true, invitedToCeremony: true, invitedToReception: true, invitedToAfterparty: true } } } } },
        });
        rooms = [room];
    }

    return apiJson(rooms);

  } catch (error) {
    return handleDbError(error);
  }

}

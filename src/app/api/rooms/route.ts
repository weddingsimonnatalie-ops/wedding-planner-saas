export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { verifyWeddingCookieId, COOKIE_NAME } from "@/lib/wedding-cookie";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
    if (!cookieValue) return NextResponse.json({ error: "No wedding context" }, { status: 401 });
    const weddingId = await verifyWeddingCookieId(cookieValue);
    if (!weddingId) return NextResponse.json({ error: "Invalid wedding context" }, { status: 401 });

    const rooms = await withTenantContext(weddingId, async (tx) => {
      let found = await tx.room.findMany({
        where: { weddingId },
        include: { elements: true, tables: { include: { guests: { select: { id: true, firstName: true, lastName: true, groupName: true, rsvpStatus: true, mealChoice: true, invitedToCeremony: true, invitedToReception: true, invitedToAfterparty: true } } } } },
        orderBy: { createdAt: "asc" },
      });

      // Create default room if none exists
      if (found.length === 0) {
        const room = await tx.room.create({
          data: { weddingId, name: "Main Reception", widthMetres: 20, heightMetres: 15 },
          include: { elements: true, tables: { include: { guests: { select: { id: true, firstName: true, lastName: true, groupName: true, rsvpStatus: true, mealChoice: true, invitedToCeremony: true, invitedToReception: true, invitedToAfterparty: true } } } } },
        });
        found = [room];
      }

      return found;
    });

    return apiJson(rooms);

  } catch (error) {
    return handleDbError(error);
  }

}

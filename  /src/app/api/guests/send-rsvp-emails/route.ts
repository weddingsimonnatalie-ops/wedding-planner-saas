import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sendRsvpEmail } from "@/lib/email";
import { getBulkLimits } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;

    const { guestIds } = await req.json();
    if (!Array.isArray(guestIds) || guestIds.length === 0) {
        return NextResponse.json({ error: "guestIds array required" }, { status: 400 });
    }

    const { emailLimit } = getBulkLimits();
    if (guestIds.length > emailLimit) {
        return NextResponse.json(
            { error: `Cannot send more than ${emailLimit} emails at once` },
            { status: 400 }
        );
    }

    const config = await prisma.weddingConfig.findUnique({ where: { id: 1 } });
    const coupleName = config?.coupleName ?? "Our Wedding";

    const sent: Array<{ guestId: string; name: string; email: string }> = [];
    const failed: Array<{ guestId: string; name: string; email: string; error: string }> = [];
    const skipped: Array<{ guestId: string; name: string; reason: string }> = [];

    // Batch fetch all guests in a single query (fixes N+1)
    const guests = await prisma.guest.findMany({
        where: { id: { in: guestIds } },
        select: { id: true, firstName: true, lastName: true, email: true, rsvpToken: true }
    });
    const guestMap = new Map(guests.map(g => [g.id, g]));

    for (const guestId of guestIds) {
        const guest = guestMap.get(guestId);
        if (!guest) {
          skipped.push({ guestId, name: "Unknown", reason: "Guest not found" });
          continue;
        }
        if (!guest.email) {
          skipped.push({ guestId, name: `${guest.firstName} ${guest.lastName}`, reason: "No email address" });
          continue;
        }

        const result = await sendRsvpEmail(
          guest.email,
          guest.firstName,
          guest.rsvpToken,
          coupleName,
          config?.weddingDate ?? null
        );

        if (result.ok) {
          sent.push({ guestId, name: `${guest.firstName} ${guest.lastName}`, email: guest.email });
        } else {
          failed.push({ guestId, name: `${guest.firstName} ${guest.lastName}`, email: guest.email, error: result.message });
        }
    }

    return NextResponse.json({ sent, failed, skipped });

  } catch (error) {
    return handleDbError(error);
  }

}

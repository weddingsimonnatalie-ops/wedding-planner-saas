import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager, requireEmailFeature } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { sendRsvpEmail } from "@/lib/email";
import { getBulkLimits, checkRateLimit, getEmailRateLimit } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const emailGate = requireEmailFeature(auth.wedding.subscriptionStatus);
    if (emailGate) return emailGate;

    // Rate limit per user (same as single email send: 50/hour)
    const rateKey = `email:rsvp:${auth.user.id}`;
    const { max, windowMs } = getEmailRateLimit();
    const rateCheck = await checkRateLimit(rateKey, max, windowMs);
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

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

    const { config, guests } = await withTenantContext(weddingId, async (tx) => {
      const config = await tx.wedding.findUnique({ where: { id: weddingId }, select: { coupleName: true, weddingDate: true, themeHue: true } });

      // Batch fetch all guests in a single query, scoped to this wedding (fixes N+1 and prevents cross-tenant access)
      const guests = await tx.guest.findMany({
          where: { id: { in: guestIds }, weddingId },
          select: { id: true, firstName: true, lastName: true, email: true, rsvpToken: true, unsubscribedAt: true },
      });

      return { config, guests };
    });

    const coupleName = config?.coupleName ?? "Our Wedding";
    const guestMap = new Map(guests.map(g => [g.id, g]));

    const sent: Array<{ guestId: string; name: string; email: string }> = [];
    const failed: Array<{ guestId: string; name: string; email: string; error: string }> = [];
    const skipped: Array<{ guestId: string; name: string; reason: string }> = [];
    let unsubscribed = 0;

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
        if (guest.unsubscribedAt) {
          unsubscribed++;
          continue;
        }

        const result = await sendRsvpEmail(
          guest.email,
          guest.firstName,
          guest.rsvpToken,
          coupleName,
          config?.weddingDate ?? null,
          config?.themeHue ?? 330
        );

        if (result.ok) {
          sent.push({ guestId, name: `${guest.firstName} ${guest.lastName}`, email: guest.email });
        } else {
          failed.push({ guestId, name: `${guest.firstName} ${guest.lastName}`, email: guest.email, error: result.message });
        }
    }

    return NextResponse.json({ sent, failed, skipped, unsubscribed });

  } catch (error) {
    return handleDbError(error);
  }

}

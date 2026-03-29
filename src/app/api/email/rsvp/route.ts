import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager, requireEmailFeature } from "@/lib/api-auth";
import { sendRsvpEmail } from "@/lib/email";
import { checkRateLimit, getEmailRateLimit } from "@/lib/rate-limit";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const emailGate = requireEmailFeature(auth.wedding.subscriptionStatus);
    if (emailGate) return emailGate;

    // Rate limit per user to prevent email abuse
    const rateKey = `email:rsvp:${auth.user.id}`;
    const { max, windowMs } = getEmailRateLimit();
    const rateCheck = await checkRateLimit(rateKey, max, windowMs);
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const { guestId } = await req.json();
    if (!guestId) return NextResponse.json({ error: "guestId required" }, { status: 400 });

    const { guest, wedding } = await withTenantContext(weddingId, async (tx) => {
      const guest = await tx.guest.findUnique({ where: { id: guestId, weddingId } });
      const wedding = await tx.wedding.findUnique({ where: { id: weddingId } });
      return { guest, wedding };
    });

    if (!guest) return NextResponse.json({ error: "Guest not found" }, { status: 404 });

    if (!guest.email) {
      return NextResponse.json({ error: "Guest has no email address" }, { status: 400 });
    }

    if (guest.unsubscribedAt) {
      return NextResponse.json({ error: "This guest has unsubscribed from emails" }, { status: 400 });
    }

    const coupleName = wedding?.coupleName ?? "Our Wedding";

    const result = await sendRsvpEmail(
      guest.email,
      guest.firstName,
      guest.rsvpToken,
      coupleName,
      wedding?.weddingDate ?? null,
      wedding?.themeHue ?? 330
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });

  } catch (error) {
    return handleDbError(error);
  }

}

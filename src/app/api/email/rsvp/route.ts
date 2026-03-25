import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sendRsvpEmail } from "@/lib/email";
import { checkRateLimit, getEmailRateLimit } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;

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

    const guest = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) return NextResponse.json({ error: "Guest not found" }, { status: 404 });

    if (!guest.email) {
      return NextResponse.json({ error: "Guest has no email address" }, { status: 400 });
    }

    const config = await prisma.weddingConfig.findUnique({ where: { id: 1 } });
    const coupleName = config?.coupleName ?? "Our Wedding";

    const result = await sendRsvpEmail(
      guest.email,
      guest.firstName,
      guest.rsvpToken,
      coupleName,
      config?.weddingDate ?? null
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });

  } catch (error) {
    return handleDbError(error);
  }

}
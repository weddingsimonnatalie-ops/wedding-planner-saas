export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateRsvpStatus } from "@/lib/rsvpStatus";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";
import { checkRateLimit, extractIp, getRsvpRateLimit } from "@/lib/rate-limit";
import { validateLength } from "@/lib/validation";

type Choice = "yes" | "no" | "maybe";

function toFields(choice: Choice | undefined): { attending: boolean | null; maybe: boolean } {
  if (choice === "yes") return { attending: true, maybe: false };
  if (choice === "no") return { attending: false, maybe: false };
  if (choice === "maybe") return { attending: null, maybe: true };
  return { attending: null, maybe: false };
}

// Public — no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const { ipMax, ipWindowMs, tokenMax, tokenWindowMs } = getRsvpRateLimit();

    // Rate limit by IP to prevent scraping
    const ip = extractIp(req);
    const ipLimit = await checkRateLimit(`rsvp:ip:${ip}`, ipMax, ipWindowMs);
    if (ipLimit.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Rate limit by token to prevent token enumeration
    const tokenLimit = await checkRateLimit(`rsvp:token:${token}`, tokenMax, tokenWindowMs);
    if (tokenLimit.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const guest = await prisma.guest.findUnique({
      where: { rsvpToken: token },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rsvpStatus: true,
        rsvpRespondedAt: true,
        invitedToCeremony: true,
        invitedToReception: true,
        invitedToAfterparty: true,
        attendingCeremony: true,
        attendingReception: true,
        attendingAfterparty: true,
        attendingCeremonyMaybe: true,
        attendingReceptionMaybe: true,
        attendingAfterpartyMaybe: true,
        mealChoice: true,
        dietaryNotes: true,
      },
    });

    if (!guest) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const mealOptions = await prisma.mealOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return apiJson({ guest, mealOptions });
  } catch (error) {
    return handleDbError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const { ipMax, ipWindowMs, tokenMax, tokenWindowMs } = getRsvpRateLimit();

    // Rate limit by IP to prevent spam
    const ip = extractIp(req);
    const ipLimit = await checkRateLimit(`rsvp:ip:${ip}`, ipMax, ipWindowMs);
    if (ipLimit.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Rate limit by token to prevent spamming a single guest's RSVP
    const tokenLimit = await checkRateLimit(`rsvp:token:${token}`, tokenMax, tokenWindowMs);
    if (tokenLimit.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const guest = await prisma.guest.findUnique({
      where: { rsvpToken: token },
    });

    if (!guest) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const {
      attendingCeremony: ceremonyCh,
      attendingReception: receptionCh,
      attendingAfterparty: afterpartyCh,
      mealChoice,
      dietaryNotes,
    } = body;

    const ceremony = guest.invitedToCeremony ? toFields(ceremonyCh) : { attending: null as boolean | null, maybe: false };
    const reception = guest.invitedToReception ? toFields(receptionCh) : { attending: null as boolean | null, maybe: false };
    const afterparty = guest.invitedToAfterparty ? toFields(afterpartyCh) : { attending: null as boolean | null, maybe: false };

    // Validate mealChoice references an active meal option (if provided)
    if (mealChoice && mealChoice.trim()) {
      const mealOption = await prisma.mealOption.findFirst({
        where: { id: mealChoice.trim(), isActive: true },
      });
      if (!mealOption) {
        return NextResponse.json({ error: "Invalid meal option" }, { status: 400 });
      }
    }

    const rsvpStatus = calculateRsvpStatus(
      guest.invitedToCeremony,
      guest.invitedToReception,
      guest.invitedToAfterparty,
      ceremony.attending,
      reception.attending,
      afterparty.attending,
      ceremony.maybe,
      reception.maybe,
      afterparty.maybe
    );

    // Validate dietary notes length
    const dietaryError = validateLength(dietaryNotes, "dietaryNotes");
    if (dietaryError) {
      return NextResponse.json({ error: dietaryError }, { status: 400 });
    }

    const updated = await prisma.guest.update({
      where: { rsvpToken: token },
      data: {
        rsvpStatus: rsvpStatus as any,
        isManualOverride: false,
        rsvpRespondedAt: new Date(),
        attendingCeremony: ceremony.attending,
        attendingCeremonyMaybe: ceremony.maybe,
        attendingReception: reception.attending,
        attendingReceptionMaybe: reception.maybe,
        attendingAfterparty: afterparty.attending,
        attendingAfterpartyMaybe: afterparty.maybe,
        mealChoice: mealChoice?.trim() || null,
        dietaryNotes: dietaryNotes?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, rsvpStatus: updated.rsvpStatus });
  } catch (error) {
    return handleDbError(error);
  }
}
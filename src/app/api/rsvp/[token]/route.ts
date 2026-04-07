export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateRsvpStatus } from "@/lib/rsvpStatus";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";
import { checkRateLimit, extractIp, getRsvpRateLimit } from "@/lib/rate-limit";
import { validateLength } from "@/lib/validation";
import { withTenantContext } from "@/lib/tenant";

type Choice = "yes" | "no";

function toAttending(choice: Choice | undefined): boolean | null {
  if (choice === "yes") return true;
  if (choice === "no")  return false;
  return null;
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

    // Guest lookup is by globally unique rsvpToken — no weddingId filter needed
    const guest = await prisma.guest.findUnique({
      where: { rsvpToken: token },
      select: {
        id: true,
        weddingId: true,
        firstName: true,
        lastName: true,
        rsvpStatus: true,
        rsvpRespondedAt: true,
        invitedToCeremony: true,
        invitedToReception: true,
        invitedToAfterparty: true,
        invitedToRehearsalDinner: true,
        attendingCeremony: true,
        attendingReception: true,
        attendingAfterparty: true,
        attendingRehearsalDinner: true,
        mealChoice: true,
        dietaryNotes: true,
      },
    });

    if (!guest) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [mealOptions, guestMealChoices] = await withTenantContext(guest.weddingId, (tx) =>
      Promise.all([
        tx.mealOption.findMany({
          where: { weddingId: guest.weddingId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
        tx.guestMealChoice.findMany({
          where: { guestId: guest.id },
          select: { eventId: true, mealOptionId: true },
        }),
      ])
    );

    return apiJson({ guest, mealOptions, guestMealChoices });
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

    // Guest lookup is by globally unique rsvpToken — no weddingId filter needed
    const guest = await prisma.guest.findUnique({
      where: { rsvpToken: token },
    });

    if (!guest) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const {
      attendingCeremony: ceremonyCh,
      attendingReception: receptionCh,
      attendingAfterparty: afterpartyCh,
      attendingRehearsalDinner: rehearsalDinnerCh,
      mealChoices, // Per-event meal choices: Record<string, string | null>
      dietaryNotes,
    } = body;

    const ceremony        = guest.invitedToCeremony        ? toAttending(ceremonyCh)        : null;
    const reception       = guest.invitedToReception       ? toAttending(receptionCh)       : null;
    const afterparty      = guest.invitedToAfterparty      ? toAttending(afterpartyCh)      : null;
    const rehearsalDinner = guest.invitedToRehearsalDinner ? toAttending(rehearsalDinnerCh) : null;

    // Validate dietary notes length
    const dietaryError = validateLength(dietaryNotes, "dietaryNotes");
    if (dietaryError) {
      return NextResponse.json({ error: dietaryError }, { status: 400 });
    }

    const rsvpStatus = calculateRsvpStatus(
      guest.invitedToCeremony,
      guest.invitedToReception,
      guest.invitedToAfterparty,
      guest.invitedToRehearsalDinner,
      ceremony,
      reception,
      afterparty,
      rehearsalDinner,
    );

    // Process per-event meal choices
    let legacyMealChoice: string | null = null;

    if (mealChoices && typeof mealChoices === "object") {
      // Validate each meal choice
      for (const [eventId, mealOptionId] of Object.entries(mealChoices)) {
        if (mealOptionId && typeof mealOptionId === "string" && mealOptionId.trim()) {
          const mealOption = await withTenantContext(guest.weddingId, (tx) =>
            tx.mealOption.findFirst({
              where: { id: mealOptionId.trim(), weddingId: guest.weddingId, isActive: true, eventId },
            })
          );
          if (!mealOption) {
            return NextResponse.json(
              { error: `Invalid meal option for event ${eventId}` },
              { status: 400 }
            );
          }
          // Keep legacy mealChoice for the "meal" event
          if (eventId === "meal") {
            legacyMealChoice = mealOptionId.trim();
          }
        }
      }
    }

    // Update guest and meal choices in a transaction
    const result = await withTenantContext(guest.weddingId, async (tx) => {
      // Update guest RSVP data
      const updated = await tx.guest.update({
        where: { rsvpToken: token },
        data: {
          rsvpStatus: rsvpStatus as any,
          isManualOverride: false,
          rsvpRespondedAt: new Date(),
          attendingCeremony: ceremony,
          attendingReception: reception,
          attendingAfterparty: afterparty,
          attendingRehearsalDinner: rehearsalDinner,
          mealChoice: legacyMealChoice, // Legacy field for backwards compatibility
          dietaryNotes: dietaryNotes?.trim() || null,
        },
      });

      // Delete existing meal choices for this guest
      await tx.guestMealChoice.deleteMany({
        where: { guestId: guest.id },
      });

      // Create new meal choices
      if (mealChoices && typeof mealChoices === "object") {
        const mealChoiceData = Object.entries(mealChoices)
          .filter(([, mealOptionId]) => mealOptionId && typeof mealOptionId === "string" && mealOptionId.trim())
          .map(([eventId, mealOptionId]) => ({
            guestId: guest.id,
            eventId,
            mealOptionId: mealOptionId as string,
          }));

        if (mealChoiceData.length > 0) {
          await tx.guestMealChoice.createMany({
            data: mealChoiceData,
          });
        }
      }

      return updated;
    });

    return NextResponse.json({ ok: true, rsvpStatus: result.rsvpStatus });
  } catch (error) {
    return handleDbError(error);
  }
}

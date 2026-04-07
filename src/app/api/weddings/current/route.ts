export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";
import { getCached, invalidateCache } from "@/lib/cache";
import { withTenantContext } from "@/lib/tenant";
import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const wedding = await getCached(
      `${weddingId}:wedding-config`,
      300_000,
      () =>
        withTenantContext(weddingId, (tx) =>
          tx.wedding.findUnique({ where: { id: weddingId } })
        )
    );
    return apiJson(wedding);
  } catch (error) {
    return handleDbError(error);
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const {
      coupleName,
      weddingDate,
      reminderEmail,
      sessionTimeout,
      sessionWarningTime,
      themeHue,
      currencySymbol,
      totalBudget,
      // Event name configuration
      ceremonyEnabled,
      ceremonyName,
      ceremonyLocation,
      ceremonyMealsEnabled,
      mealEnabled,
      mealName,
      mealLocation,
      mealMealsEnabled,
      eveningPartyEnabled,
      eveningPartyName,
      eveningPartyLocation,
      eveningPartyMealsEnabled,
      rehearsalDinnerEnabled,
      rehearsalDinnerName,
      rehearsalDinnerLocation,
      rehearsalDinnerMealsEnabled,
    } = body;

    const errors = validateFields([
      { value: coupleName, field: "coupleName" },
      { value: reminderEmail, field: "email" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    // Validate that at least one event is enabled
    if (
      ceremonyEnabled !== undefined ||
      mealEnabled !== undefined ||
      eveningPartyEnabled !== undefined ||
      rehearsalDinnerEnabled !== undefined
    ) {
      // Get current values for events not being updated
      const currentWedding = await withTenantContext(weddingId, (tx) =>
        tx.wedding.findUnique({
          where: { id: weddingId },
          select: {
            ceremonyEnabled: true,
            mealEnabled: true,
            eveningPartyEnabled: true,
            rehearsalDinnerEnabled: true,
          },
        })
      );

      const finalCeremonyEnabled = ceremonyEnabled !== undefined ? Boolean(ceremonyEnabled) : currentWedding?.ceremonyEnabled ?? true;
      const finalMealEnabled = mealEnabled !== undefined ? Boolean(mealEnabled) : currentWedding?.mealEnabled ?? true;
      const finalEveningPartyEnabled = eveningPartyEnabled !== undefined ? Boolean(eveningPartyEnabled) : currentWedding?.eveningPartyEnabled ?? true;
      const finalRehearsalDinnerEnabled = rehearsalDinnerEnabled !== undefined ? Boolean(rehearsalDinnerEnabled) : currentWedding?.rehearsalDinnerEnabled ?? false;

      const enabledCount = [finalCeremonyEnabled, finalMealEnabled, finalEveningPartyEnabled, finalRehearsalDinnerEnabled].filter(Boolean).length;

      if (enabledCount < 1) {
        return NextResponse.json(
          { error: "At least one event must be enabled" },
          { status: 400 }
        );
      }
    }

    const wedding = await withTenantContext(weddingId, (tx) =>
      tx.wedding.update({
        where: { id: weddingId },
        data: {
          ...(coupleName !== undefined ? { coupleName: coupleName.trim() || "Our Wedding" } : {}),
          ...(weddingDate !== undefined
            ? { weddingDate: weddingDate ? new Date(weddingDate) : null }
            : {}),
...(reminderEmail !== undefined ? { reminderEmail: reminderEmail?.trim() || null } : {}),
          ...(sessionTimeout !== undefined ? { sessionTimeout: Number(sessionTimeout) } : {}),
          ...(sessionWarningTime !== undefined
            ? { sessionWarningTime: Number(sessionWarningTime) }
            : {}),
          ...(themeHue !== undefined
            ? { themeHue: Math.max(0, Math.min(359, Math.round(Number(themeHue)))) }
            : {}),
          ...(currencySymbol !== undefined
            ? { currencySymbol: String(currencySymbol).trim().slice(0, 5) || "£" }
            : {}),
          ...(totalBudget !== undefined
            ? { totalBudget: totalBudget !== null ? Math.max(0, Number(totalBudget)) : null }
            : {}),
          // Event name configuration
          ...(ceremonyEnabled !== undefined ? { ceremonyEnabled: Boolean(ceremonyEnabled) } : {}),
          ...(ceremonyName !== undefined
            ? { ceremonyName: String(ceremonyName).trim().slice(0, 50) || "Ceremony" }
            : {}),
          ...(ceremonyLocation !== undefined
            ? { ceremonyLocation: String(ceremonyLocation).trim().slice(0, 200) || null }
            : {}),
          ...(mealEnabled !== undefined ? { mealEnabled: Boolean(mealEnabled) } : {}),
          ...(mealName !== undefined
            ? { mealName: String(mealName).trim().slice(0, 50) || "Wedding Breakfast" }
            : {}),
          ...(mealLocation !== undefined
            ? { mealLocation: String(mealLocation).trim().slice(0, 200) || null }
            : {}),
          ...(eveningPartyEnabled !== undefined ? { eveningPartyEnabled: Boolean(eveningPartyEnabled) } : {}),
          ...(eveningPartyName !== undefined
            ? { eveningPartyName: String(eveningPartyName).trim().slice(0, 50) || "Evening Reception" }
            : {}),
          ...(eveningPartyLocation !== undefined
            ? { eveningPartyLocation: String(eveningPartyLocation).trim().slice(0, 200) || null }
            : {}),
          ...(rehearsalDinnerEnabled !== undefined ? { rehearsalDinnerEnabled: Boolean(rehearsalDinnerEnabled) } : {}),
          ...(rehearsalDinnerName !== undefined
            ? { rehearsalDinnerName: String(rehearsalDinnerName).trim().slice(0, 50) || "Rehearsal Dinner" }
            : {}),
          ...(rehearsalDinnerLocation !== undefined
            ? { rehearsalDinnerLocation: String(rehearsalDinnerLocation).trim().slice(0, 200) || null }
            : {}),
          // Meals enabled per event
          ...(ceremonyMealsEnabled !== undefined ? { ceremonyMealsEnabled: Boolean(ceremonyMealsEnabled) } : {}),
          ...(mealMealsEnabled !== undefined ? { mealMealsEnabled: Boolean(mealMealsEnabled) } : {}),
          ...(eveningPartyMealsEnabled !== undefined ? { eveningPartyMealsEnabled: Boolean(eveningPartyMealsEnabled) } : {}),
          ...(rehearsalDinnerMealsEnabled !== undefined ? { rehearsalDinnerMealsEnabled: Boolean(rehearsalDinnerMealsEnabled) } : {}),
        },
      })
    );

    await invalidateCache(`${weddingId}:wedding-config`);
    return apiJson(wedding);
  } catch (error) {
    return handleDbError(error);
  }
}

// PUT is an alias for PATCH (backwards compatibility with /api/settings)
export const PUT = PATCH;

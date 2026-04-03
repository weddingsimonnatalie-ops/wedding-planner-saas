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
      venueName,
      venueAddress,
      reminderEmail,
      sessionTimeout,
      sessionWarningTime,
      themeHue,
      totalBudget,
    } = body;

    const errors = validateFields([
      { value: coupleName, field: "coupleName" },
      { value: venueName, field: "venueName" },
      { value: venueAddress, field: "venueAddress" },
      { value: reminderEmail, field: "email" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const wedding = await withTenantContext(weddingId, (tx) =>
      tx.wedding.update({
        where: { id: weddingId },
        data: {
          ...(coupleName !== undefined ? { coupleName: coupleName.trim() || "Our Wedding" } : {}),
          ...(weddingDate !== undefined
            ? { weddingDate: weddingDate ? new Date(weddingDate) : null }
            : {}),
          ...(venueName !== undefined ? { venueName: venueName?.trim() || null } : {}),
          ...(venueAddress !== undefined ? { venueAddress: venueAddress?.trim() || null } : {}),
          ...(reminderEmail !== undefined ? { reminderEmail: reminderEmail?.trim() || null } : {}),
          ...(sessionTimeout !== undefined ? { sessionTimeout: Number(sessionTimeout) } : {}),
          ...(sessionWarningTime !== undefined
            ? { sessionWarningTime: Number(sessionWarningTime) }
            : {}),
          ...(themeHue !== undefined
            ? { themeHue: Math.max(0, Math.min(359, Math.round(Number(themeHue)))) }
            : {}),
          ...(totalBudget !== undefined
            ? { totalBudget: totalBudget !== null ? Math.max(0, Number(totalBudget)) : null }
            : {}),
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

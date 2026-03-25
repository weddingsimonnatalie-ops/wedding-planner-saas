export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";
import { getCached, invalidateCache } from "@/lib/cache";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req as NextRequest);
    if (!auth.authorized) return auth.response;

    const config = await getCached(
      "wedding-config",
      300_000,
      () => prisma.weddingConfig.findUnique({ where: { id: 1 } })
    );
    return apiJson(config);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin(request as NextRequest);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { coupleName, weddingDate, venueName, venueAddress, reminderEmail } = body;

    // Validate field lengths
    const errors = validateFields([
      { value: coupleName, field: "coupleName" },
      { value: venueName, field: "venueName" },
      { value: venueAddress, field: "venueAddress" },
      { value: reminderEmail, field: "email" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const config = await prisma.weddingConfig.upsert({
        where: { id: 1 },
        update: {
          coupleName: coupleName?.trim() ?? "Our Wedding",
          weddingDate: weddingDate ? new Date(weddingDate) : null,
          venueName: venueName?.trim() || null,
          venueAddress: venueAddress?.trim() || null,
          ...(reminderEmail !== undefined ? { reminderEmail: reminderEmail?.trim() || null } : {}),
        },
        create: {
          id: 1,
          coupleName: coupleName?.trim() ?? "Our Wedding",
          weddingDate: weddingDate ? new Date(weddingDate) : null,
          venueName: venueName?.trim() || null,
          venueAddress: venueAddress?.trim() || null,
          reminderEmail: reminderEmail?.trim() || null,
        },
    });

    invalidateCache("wedding-config");
    return NextResponse.json(config);

  } catch (error) {
    return handleDbError(error);
  }

}

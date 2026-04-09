export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { handleDbError } from "@/lib/db-error";

const INCLUDE = {
  supplier: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, colour: true } },
} as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const { completed } = await req.json();

    const existing = await withTenantContext(weddingId, (tx) =>
      tx.appointment.findUnique({ where: { id, weddingId } })
    );
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();

    const appointment = await withTenantContext(weddingId, (tx) =>
      tx.appointment.update({
        where: { id, weddingId },
        data: {
          isCompleted: Boolean(completed),
          completedAt: completed ? now : null,
        },
        include: INCLUDE,
      })
    );

    return NextResponse.json({ appointment });

  } catch (error) {
    return handleDbError(error);
  }
}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;
    const { id } = await params;

    const body = await req.json();
    const { title, startTime, durationMins, location, notes, eventType, supplierId } = body;

    // Validate eventType if provided
    const validEventTypes = ["PREP", "TRANSPORT", "CEREMONY", "PHOTO", "RECEPTION", "FOOD", "MUSIC", "GENERAL"];
    if (eventType && !validEventTypes.includes(eventType)) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    // Validate supplier if provided
    if (supplierId !== undefined && supplierId !== null) {
      const supplier = await withTenantContext(weddingId, (tx) =>
        tx.supplier.findUnique({ where: { id: supplierId, weddingId } })
      );
      if (!supplier) {
        return NextResponse.json({ error: "Invalid supplier" }, { status: 400 });
      }
    }

    const event = await withTenantContext(weddingId, (tx) =>
      tx.timelineEvent.update({
        where: { id, weddingId },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(startTime !== undefined && { startTime: new Date(startTime) }),
          ...(durationMins !== undefined && { durationMins }),
          ...(location !== undefined && { location: location?.trim() || null }),
          ...(notes !== undefined && { notes: notes?.trim() || null }),
          ...(eventType !== undefined && { eventType }),
          ...(supplierId !== undefined && { supplierId: supplierId || null }),
        },
        include: {
          supplier: { select: { id: true, name: true } },
        },
      })
    );

    return NextResponse.json(event);

  } catch (error) {
    return handleDbError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;
    const { id } = await params;

    await withTenantContext(weddingId, (tx) =>
      tx.timelineEvent.delete({
        where: { id, weddingId },
      })
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    return handleDbError(error);
  }
}
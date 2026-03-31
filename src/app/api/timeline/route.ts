export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const events = await withTenantContext(weddingId, (tx) =>
      tx.timelineEvent.findMany({
        where: { weddingId },
        include: {
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { startTime: "asc" },
      })
    );

    return apiJson({ events });

  } catch (error) {
    return handleDbError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const { title, startTime, durationMins, location, notes, eventType, supplierId } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!startTime) {
      return NextResponse.json({ error: "Start time is required" }, { status: 400 });
    }

    // Validate eventType if provided
    const validEventTypes = ["PREP", "TRANSPORT", "CEREMONY", "PHOTO", "RECEPTION", "FOOD", "MUSIC", "GENERAL"];
    if (eventType && !validEventTypes.includes(eventType)) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    // Validate supplier if provided
    if (supplierId) {
      const supplier = await withTenantContext(weddingId, (tx) =>
        tx.supplier.findUnique({ where: { id: supplierId, weddingId } })
      );
      if (!supplier) {
        return NextResponse.json({ error: "Invalid supplier" }, { status: 400 });
      }
    }

    const event = await withTenantContext(weddingId, (tx) =>
      tx.timelineEvent.create({
        data: {
          weddingId,
          title: title.trim(),
          startTime: new Date(startTime),
          durationMins: durationMins ?? 30,
          location: location?.trim() || null,
          notes: notes?.trim() || null,
          eventType: eventType || "GENERAL",
          supplierId: supplierId || null,
        },
        include: {
          supplier: { select: { id: true, name: true } },
        },
      })
    );

    return NextResponse.json(event, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }
}
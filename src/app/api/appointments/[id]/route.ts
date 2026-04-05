export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireRole(["ADMIN", "VIEWER"], _req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const appt = await withTenantContext(weddingId, (tx) =>
      tx.appointment.findUnique({
        where: { id, weddingId },
        include: {
          supplier: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, colour: true } },
        },
      })
    );

    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return apiJson(appt);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const { title, categoryId, date, location, notes, supplierId, reminderDays } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    // Validate field lengths
    const errors = validateFields([
      { value: title, field: "title", required: true },
      { value: location, field: "location" },
      { value: notes, field: "appointmentNotes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    if (categoryId !== undefined && categoryId !== null) {
        const category = await withTenantContext(weddingId, (tx) =>
          tx.planningCategory.findFirst({ where: { id: categoryId, weddingId } })
        );
        if (!category) return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }

    if (supplierId !== undefined && supplierId !== null) {
        const supplier = await withTenantContext(weddingId, (tx) =>
          tx.supplier.findUnique({ where: { id: supplierId, weddingId } })
        );
        if (!supplier) return NextResponse.json({ error: "Invalid supplierId" }, { status: 400 });
    }

    const appt = await withTenantContext(weddingId, (tx) =>
      tx.appointment.update({
        where: { id, weddingId },
        data: {
          title: title.trim(),
          categoryId: categoryId || null,
          date: new Date(date),
          location: location?.trim() || null,
          notes: notes?.trim() || null,
          supplierId: supplierId || null,
          reminderDays: reminderDays != null ? Number(reminderDays) : null,
          // Reset reminderSent if days changed
          reminderSent: false,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, colour: true } },
        },
      })
    );

    return NextResponse.json(appt);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    await withTenantContext(weddingId, (tx) =>
      tx.appointment.delete({ where: { id, weddingId } })
    );
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

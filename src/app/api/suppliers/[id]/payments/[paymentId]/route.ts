import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateFields } from "@/lib/validation";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, paymentId } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    const data = await req.json();

    // Validate supplier and payment exist and belong to this wedding
    const supplier = await withTenantContext(weddingId, (tx) =>
      tx.supplier.findUnique({ where: { id, weddingId } })
    );
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const existingPayment = await withTenantContext(weddingId, (tx) =>
      tx.payment.findUnique({ where: { id: paymentId, weddingId } })
    );
    if (!existingPayment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    // Validate field lengths
    const errors = validateFields([
      { value: data.label, field: "label" },
      { value: data.notes, field: "notes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const payment = await withTenantContext(weddingId, (tx) =>
      tx.payment.update({
        where: { id: paymentId, weddingId },
        data: {
          ...(data.label !== undefined ? { label: data.label?.trim() || "" } : {}),
          ...(data.amount !== undefined ? { amount: Number(data.amount) } : {}),
          ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.paidDate !== undefined ? { paidDate: data.paidDate ? new Date(data.paidDate) : null } : {}),
          ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        },
      })
    );

    return NextResponse.json(payment);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, paymentId } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Validate supplier and payment exist and belong to this wedding before deletion
    const supplier = await withTenantContext(weddingId, (tx) =>
      tx.supplier.findUnique({ where: { id, weddingId } })
    );
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const existingPayment = await withTenantContext(weddingId, (tx) =>
      tx.payment.findUnique({ where: { id: paymentId, weddingId } })
    );
    if (!existingPayment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    await withTenantContext(weddingId, (tx) =>
      tx.payment.delete({ where: { id: paymentId, weddingId } })
    );
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

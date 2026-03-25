import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, paymentId } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const data = await req.json();

    // Validate supplier and payment exist
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const existingPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existingPayment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    // Validate field lengths
    const errors = validateFields([
      { value: data.label, field: "label" },
      { value: data.notes, field: "notes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
        ...(data.label !== undefined ? { label: data.label?.trim() || "" } : {}),
        ...(data.amount !== undefined ? { amount: Number(data.amount) } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.paidDate !== undefined ? { paidDate: data.paidDate ? new Date(data.paidDate) : null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
    },
    });

    return NextResponse.json(payment);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, paymentId } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;

    // Validate supplier and payment exist before deletion
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const existingPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existingPayment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    await prisma.payment.delete({ where: { id: paymentId } });
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

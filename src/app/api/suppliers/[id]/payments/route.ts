import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateFields } from "@/lib/validation";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    const data = await req.json();
    if (!data.label?.trim()) return NextResponse.json({ error: "Label required" }, { status: 400 });
    if (!data.amount || isNaN(Number(data.amount))) return NextResponse.json({ error: "Valid amount required" }, { status: 400 });

    // Validate field lengths
    const errors = validateFields([
      { value: data.label, field: "label", required: true },
      { value: data.notes, field: "notes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    // Validate supplier exists and belongs to this wedding
    const supplier = await withTenantContext(weddingId, (tx) =>
      tx.supplier.findUnique({ where: { id, weddingId } })
    );
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const payment = await withTenantContext(weddingId, (tx) =>
      tx.payment.create({
        data: {
          weddingId,
          supplierId: id,
          label: data.label.trim(),
          amount: Number(data.amount),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes?.trim() || null,
        },
      })
    );

    return NextResponse.json(payment, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

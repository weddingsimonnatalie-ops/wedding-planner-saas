import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";

import { handleDbError } from "@/lib/db-error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);

    // Optional pagination — defaults to returning all results for backward compatibility
    const skip = searchParams.get("skip") ? parseInt(searchParams.get("skip")!, 10) : undefined;
    const take = searchParams.get("take") ? parseInt(searchParams.get("take")!, 10) : undefined;

    // Validate pagination parameters
    if (skip !== undefined && (isNaN(skip) || skip < 0)) {
      return NextResponse.json({ error: "Invalid skip parameter" }, { status: 400 });
    }
    if (take !== undefined && (isNaN(take) || take < 1 || take > 100)) {
      return NextResponse.json({ error: "Invalid take parameter (must be 1-100)" }, { status: 400 });
    }

    const payments = await prisma.payment.findMany({
        include: {
          supplier: { include: { category: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        ...(skip !== undefined ? { skip } : {}),
        ...(take !== undefined ? { take } : {}),
    });

    // Get payment IDs and supplier IDs for parallel queries
    const paymentIds = payments.map(p => p.id);
    const supplierIds = Array.from(new Set(payments.map(p => p.supplierId)));

    // Run receipts and paid-by-supplier queries in parallel (fixes sequential awaits)
    const [receipts, paidBySupplierResult] = await Promise.all([
      prisma.attachment.findMany({
        where: { paymentId: { in: paymentIds } },
      }),
      supplierIds.length > 0
        ? prisma.payment.groupBy({
            by: ["supplierId"],
            where: { supplierId: { in: supplierIds }, status: "PAID" },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
    ]);

    const receiptMap = new Map(receipts.map(r => [r.paymentId, r]));
    const paidBySupplier: Record<string, number> = Object.fromEntries(
      paidBySupplierResult.map((g: { supplierId: string; _sum: { amount: number | null } }) => [g.supplierId, g._sum.amount ?? 0])
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return apiJson(
        payments.map(p => {
          const effectiveStatus =
            p.status === "PENDING" && p.dueDate && new Date(p.dueDate) < today
              ? "OVERDUE"
              : p.status;
          const receipt = receiptMap.get(p.id);
          return {
            id: p.id,
            label: p.label,
            amount: p.amount,
            dueDate: p.dueDate?.toISOString() ?? null,
            paidDate: p.paidDate?.toISOString() ?? null,
            status: effectiveStatus,
            notes: p.notes,
            supplier: {
              id: p.supplier.id,
              name: p.supplier.name,
              contractValue: p.supplier.contractValue,
              totalPaid: paidBySupplier[p.supplier.id] ?? 0,
              category: p.supplier.category,
            },
            receipt: receipt ? {
              id: receipt.id,
              filename: receipt.filename,
              mimeType: receipt.mimeType,
              sizeBytes: receipt.sizeBytes,
              uploadedAt: receipt.uploadedAt.toISOString(),
            } : null,
          };
        })
    );

  } catch (error) {
    return handleDbError(error);
  }

}

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { SupplierDetail } from "@/components/suppliers/SupplierDetail";
import { requireServerContext } from "@/lib/server-context";
import { withTenantContext } from "@/lib/tenant";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireServerContext(["ADMIN", "VIEWER"]);
  const { weddingId } = ctx;

  // Auto-mark overdue payments for this supplier
  await withTenantContext(weddingId, (tx) =>
    tx.payment.updateMany({
      where: { supplierId: id, weddingId, status: "PENDING", dueDate: { lt: new Date() } },
      data: { status: "OVERDUE" },
    })
  );

  const supplier = await withTenantContext(weddingId, (tx) =>
    tx.supplier.findUnique({
      where: { id, weddingId },
      include: {
        payments: { orderBy: { dueDate: "asc" } },
        attachments: { orderBy: { uploadedAt: "desc" } },
        category: true,
      },
    })
  );

  if (!supplier) notFound();

  return <SupplierDetail initialSupplier={supplier as any} />;
}

export const dynamic = "force-dynamic";

import { SupplierList } from "@/components/suppliers/SupplierList";
import { requireServerContext } from "@/lib/server-context";
import { withTenantContext } from "@/lib/tenant";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function SuppliersPage({ searchParams }: PageProps) {
  const ctx = await requireServerContext(["ADMIN", "VIEWER"]);
  const { weddingId } = ctx;
  const { status } = await searchParams;

  // Auto-mark overdue payments across all suppliers for this wedding
  await withTenantContext(weddingId, (tx) =>
    tx.payment.updateMany({
      where: { weddingId, status: "PENDING", dueDate: { lt: new Date() } },
      data: { status: "OVERDUE" },
    })
  );

  const suppliers = await withTenantContext(weddingId, (tx) =>
    tx.supplier.findMany({
      where: { weddingId },
      include: { payments: true, category: true },
      orderBy: [{ name: "asc" }],
    })
  );

  return (
    <div className="flex flex-col">
      <SupplierList initialSuppliers={suppliers as any} initialStatus={status ?? ""} />
    </div>
  );
}

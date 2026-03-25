export const dynamic = "force-dynamic";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SupplierList } from "@/components/suppliers/SupplierList";

export default async function SuppliersPage() {
  const session = await getSession();
  if (!can.accessSuppliers(session?.user?.role ?? "VIEWER")) redirect("/");

  // Auto-mark overdue payments across all suppliers
  await prisma.payment.updateMany({
    where: { status: "PENDING", dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });

  const suppliers = await prisma.supplier.findMany({
    include: { payments: true, category: true },
    orderBy: [{ name: "asc" }],
  });

  return (
    <div className="flex flex-col">
      <SupplierList initialSuppliers={suppliers as any} />
    </div>
  );
}

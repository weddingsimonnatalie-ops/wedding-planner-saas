export const dynamic = "force-dynamic";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { SupplierDetail } from "@/components/suppliers/SupplierDetail";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!can.accessSuppliers(session?.user?.role ?? "VIEWER")) redirect("/");

  // Auto-mark overdue payments for this supplier
  await prisma.payment.updateMany({
    where: { supplierId: id, status: "PENDING", dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { dueDate: "asc" } },
      attachments: { orderBy: { uploadedAt: "desc" } },
      category: true,
    },
  });

  if (!supplier) notFound();

  return <SupplierDetail initialSupplier={supplier as any} />;
}

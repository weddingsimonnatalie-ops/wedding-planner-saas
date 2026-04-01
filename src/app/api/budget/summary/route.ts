export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { apiJson } from "@/lib/api-response";
import { withTenantContext } from "@/lib/tenant";
import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const result = await withTenantContext(weddingId, async (tx) => {
      // Get wedding total budget
      const wedding = await tx.wedding.findUnique({
        where: { id: weddingId },
        select: { totalBudget: true },
      });

      // Get all supplier categories with allocated amounts
      const categories = await tx.supplierCategory.findMany({
        where: { weddingId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          colour: true,
          allocatedAmount: true,
          suppliers: {
            select: {
              contractValue: true,
              payments: {
                where: { status: "PAID" },
                select: { amount: true },
              },
            },
          },
        },
      });

      // Get suppliers without a category (unallocated)
      const unallocatedSuppliers = await tx.supplier.findMany({
        where: { weddingId, categoryId: null },
        select: {
          contractValue: true,
          payments: {
            where: { status: "PAID" },
            select: { amount: true },
          },
        },
      });

      // Calculate per-category breakdown
      const categoryBreakdown = categories.map((cat) => {
        const contracted = cat.suppliers.reduce(
          (sum, s) => sum + (s.contractValue ?? 0),
          0
        );
        const paid = cat.suppliers.reduce(
          (sum, s) => sum + s.payments.reduce((p, pm) => p + pm.amount, 0),
          0
        );
        const allocated = cat.allocatedAmount ?? 0;
        const remaining = allocated - paid;

        return {
          id: cat.id,
          name: cat.name,
          colour: cat.colour,
          allocated,
          contracted,
          paid,
          remaining,
          isOverBudget: paid > allocated && allocated > 0,
          supplierCount: cat.suppliers.length,
        };
      });

      // Calculate unallocated totals
      const unallocatedContracted = unallocatedSuppliers.reduce(
        (sum, s) => sum + (s.contractValue ?? 0),
        0
      );
      const unallocatedPaid = unallocatedSuppliers.reduce(
        (sum, s) => sum + s.payments.reduce((p, pm) => p + pm.amount, 0),
        0
      );

      // Calculate overall totals
      const totalBudget = wedding?.totalBudget ?? null;
      const totalAllocated = categoryBreakdown.reduce((sum, c) => sum + c.allocated, 0);
      const totalContracted = categoryBreakdown.reduce((sum, c) => sum + c.contracted, 0) + unallocatedContracted;
      const totalPaid = categoryBreakdown.reduce((sum, c) => sum + c.paid, 0) + unallocatedPaid;

      return {
        totalBudget,
        totalAllocated,
        totalContracted,
        totalPaid,
        totalRemaining: totalBudget !== null ? totalBudget - totalPaid : totalAllocated - totalPaid,
        categories: categoryBreakdown,
        unallocated: {
          contracted: unallocatedContracted,
          paid: unallocatedPaid,
          supplierCount: unallocatedSuppliers.length,
        },
      };
    });

    return apiJson(result);

  } catch (error) {
    return handleDbError(error);
  }
}
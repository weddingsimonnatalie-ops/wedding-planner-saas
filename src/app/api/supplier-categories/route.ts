export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole } from "@/lib/api-auth";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";
import { getCached, invalidateCache } from "@/lib/cache";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const categories = await getCached(
      `${weddingId}:supplier-categories`,
      300_000,
      () => withTenantContext(weddingId, (tx) =>
        tx.supplierCategory.findMany({
          where: { weddingId },
          orderBy: { sortOrder: "asc" },
        })
      )
    );

    return apiJson(categories);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const data = await req.json();
    if (!data.name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: data.name, field: "categoryName", required: true },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const category = await withTenantContext(weddingId, async (tx) => {
      const maxOrder = await tx.supplierCategory.aggregate({
        where: { weddingId },
        _max: { sortOrder: true },
      });
      const nextOrder = (maxOrder._max.sortOrder ?? -10) + 10;

      return tx.supplierCategory.create({
        data: {
          weddingId,
          name: data.name.trim(),
          colour: data.colour ?? "#6366f1",
          sortOrder: data.sortOrder ?? nextOrder,
          ...(data.allocatedAmount !== undefined && data.allocatedAmount !== null && data.allocatedAmount !== ""
            ? { allocatedAmount: parseFloat(data.allocatedAmount) }
            : {}),
        },
      });
    });

    await invalidateCache(`${weddingId}:supplier-categories`);
    return NextResponse.json(category, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

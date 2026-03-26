export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { invalidateCache } from "@/lib/cache";
import { handleDbError } from "@/lib/db-error";

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const { ids } = await req.json();
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }

    await withTenantContext(weddingId, (tx) =>
      Promise.all(
        ids.map((id: string, index: number) =>
          tx.supplierCategory.update({
            where: { id, weddingId },
            data: { sortOrder: index * 10 },
          })
        )
      )
    );

    await invalidateCache(`${weddingId}:supplier-categories`);
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";
import { getCached, invalidateCache } from "@/lib/cache";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.authorized) return authResult.response;
    const { weddingId } = authResult;

    const categories = await getCached(
      `${weddingId}:timeline-categories`,
      300_000,
      () => withTenantContext(weddingId, (tx) =>
        tx.timelineCategory.findMany({ where: { weddingId }, orderBy: { sortOrder: "asc" } })
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
      const maxOrder = await tx.timelineCategory.aggregate({
        where: { weddingId },
        _max: { sortOrder: true },
      });
      const nextOrder = (maxOrder._max.sortOrder ?? -10) + 10;

      return tx.timelineCategory.create({
        data: {
          weddingId,
          name: data.name.trim(),
          colour: data.colour ?? "#6366f1",
          sortOrder: data.sortOrder ?? nextOrder,
        },
      });
    });

    await invalidateCache(`${weddingId}:timeline-categories`);
    return NextResponse.json(category, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }
}
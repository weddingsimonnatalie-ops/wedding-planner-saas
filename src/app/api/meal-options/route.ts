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

    const options = await getCached(
      `${weddingId}:meal-options`,
      300_000,
      () => withTenantContext(weddingId, (tx) =>
        tx.mealOption.findMany({
          where: { weddingId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        })
      )
    );
    return apiJson(options);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const { name, description, course, isActive, sortOrder } = await req.json();

    if (!name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: name, field: "mealOptionName", required: true },
      { value: description, field: "description" },
      { value: course, field: "courseName" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const option = await withTenantContext(weddingId, (tx) =>
      tx.mealOption.create({
        data: {
          weddingId,
          name: name.trim(),
          description: description?.trim() || null,
          course: course?.trim() || null,
          isActive: isActive !== false,
          sortOrder: sortOrder ?? 0,
        },
      })
    );

    await invalidateCache(`${weddingId}:meal-options`);
    return NextResponse.json(option, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { validateFields } from "@/lib/validation";
import { invalidateCache } from "@/lib/cache";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const data = await req.json();

    // Validate field lengths
    if (data.name !== undefined) {
      const errors = validateFields([
        { value: data.name, field: "categoryName", required: true },
      ]);
      if (errors.length > 0) {
        return NextResponse.json({ error: errors[0] }, { status: 400 });
      }
    }

    const category = await withTenantContext(weddingId, (tx) =>
      tx.supplierCategory.update({
        where: { id, weddingId },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.colour !== undefined ? { colour: data.colour } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
      })
    );

    await invalidateCache(`${weddingId}:supplier-categories`);
    return NextResponse.json(category);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const count = await withTenantContext(weddingId, (tx) =>
      tx.supplier.count({ where: { categoryId: id, weddingId } })
    );
    if (count > 0 && !force) {
        return NextResponse.json(
          { error: `${count} supplier${count === 1 ? "" : "s"} use this category`, count },
          { status: 409 }
        );
    }

    await withTenantContext(weddingId, async (tx) => {
      if (force && count > 0) {
        await tx.supplier.updateMany({
          where: { categoryId: id, weddingId },
          data: { categoryId: null },
        });
      }
      await tx.supplierCategory.delete({ where: { id, weddingId } });
    });

    await invalidateCache(`${weddingId}:supplier-categories`);
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

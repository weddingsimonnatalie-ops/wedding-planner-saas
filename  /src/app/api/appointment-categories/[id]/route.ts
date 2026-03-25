import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateFields } from "@/lib/validation";
import { invalidateCache } from "@/lib/cache";

import { handleDbError } from "@/lib/db-error";type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

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

    const category = await prisma.appointmentCategory.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.colour !== undefined ? { colour: data.colour } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
    });

    invalidateCache("appointment-categories");
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

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const count = await prisma.appointment.count({ where: { categoryId: id } });
    if (count > 0 && !force) {
        return NextResponse.json(
          { error: `${count} appointment${count === 1 ? "" : "s"} use this category`, count },
          { status: 409 }
        );
    }

    if (force && count > 0) {
        await prisma.appointment.updateMany({
          where: { categoryId: id },
          data: { categoryId: null },
        });
    }

    await prisma.appointmentCategory.delete({ where: { id } });
    invalidateCache("appointment-categories");
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateFields } from "@/lib/validation";
import { invalidateCache } from "@/lib/cache";

import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

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

    const option = await prisma.mealOption.update({
    where: { id: id },
    data: {
        name: name.trim(),
        description: description?.trim() || null,
        course: course?.trim() || null,
        isActive: Boolean(isActive),
        sortOrder: sortOrder ?? 0,
    },
    });

    invalidateCache("meal-options");
    return NextResponse.json(option);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;

    await prisma.mealOption.delete({ where: { id: id } });
    invalidateCache("meal-options");
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

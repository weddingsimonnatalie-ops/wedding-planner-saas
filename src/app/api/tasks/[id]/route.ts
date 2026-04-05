export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";
import { verifyWeddingCookieId, COOKIE_NAME } from "@/lib/wedding-cookie";

import { handleDbError } from "@/lib/db-error";const INCLUDE = {
  category: { select: { id: true, name: true, colour: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  supplier: { select: { id: true, name: true } },
} as const;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: _req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cookieValue = _req.cookies.get(COOKIE_NAME)?.value;
    if (!cookieValue) return NextResponse.json({ error: "No wedding context" }, { status: 401 });
    const weddingId = await verifyWeddingCookieId(cookieValue);
    if (!weddingId) return NextResponse.json({ error: "Invalid wedding context" }, { status: 401 });

    const task = await withTenantContext(weddingId, (tx) =>
      tx.task.findUnique({
        where: { id, weddingId },
        include: INCLUDE,
      })
    );

    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return apiJson(task);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const {
        title, notes, priority, dueDate, categoryId,
        assignedToId, supplierId, isRecurring, recurringInterval, recurringEndDate,
        isCompleted, completedAt,
    } = body;

    if (title !== undefined && !title?.trim()) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: title, field: "title" },
      { value: notes, field: "taskNotes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    if (categoryId !== undefined && categoryId !== null) {
        const category = await withTenantContext(weddingId, (tx) =>
          tx.planningCategory.findFirst({ where: { id: categoryId, weddingId } })
        );
        if (!category) return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }

    if (assignedToId !== undefined && assignedToId !== null) {
        const user = await prisma.user.findUnique({ where: { id: assignedToId } });
        if (!user) return NextResponse.json({ error: "Invalid assignedToId" }, { status: 400 });
    }

    if (supplierId !== undefined && supplierId !== null) {
        const supplier = await withTenantContext(weddingId, (tx) =>
          tx.supplier.findUnique({ where: { id: supplierId, weddingId } })
        );
        if (!supplier) return NextResponse.json({ error: "Invalid supplierId" }, { status: 400 });
    }

    const task = await withTenantContext(weddingId, (tx) =>
      tx.task.update({
        where: { id, weddingId },
        data: {
          ...(title !== undefined ? { title: title?.trim() || "" } : {}),
          ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
          ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
          ...(assignedToId !== undefined ? { assignedToId: assignedToId || null } : {}),
          ...(supplierId !== undefined ? { supplierId: supplierId || null } : {}),
          ...(isRecurring !== undefined ? { isRecurring: Boolean(isRecurring) } : {}),
          ...(recurringInterval !== undefined ? { recurringInterval: recurringInterval || null } : {}),
          ...(recurringEndDate !== undefined ? { recurringEndDate: recurringEndDate ? new Date(recurringEndDate) : null } : {}),
          ...(isCompleted !== undefined ? { isCompleted } : {}),
          ...(completedAt !== undefined ? { completedAt: completedAt ? new Date(completedAt) : null } : {}),
        },
        include: INCLUDE,
      })
    );

    return NextResponse.json(task);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    await withTenantContext(weddingId, (tx) =>
      tx.task.delete({ where: { id, weddingId } })
    );
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { TaskPriority } from "@prisma/client";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

const INCLUDE = {
  category: { select: { id: true, name: true, colour: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  supplier: { select: { id: true, name: true } },
} as const;

export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER"], req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const completed = searchParams.get("completed");
    const priority = searchParams.get("priority") as TaskPriority | null;
    const assignedToId = searchParams.get("assignedToId");
    const categoryId = searchParams.get("categoryId");
    const supplierId = searchParams.get("supplierId");
    const overdue = searchParams.get("overdue");

    // Optional pagination
    const skip = searchParams.get("skip") ? parseInt(searchParams.get("skip")!, 10) : undefined;
    const take = searchParams.get("take") ? parseInt(searchParams.get("take")!, 10) : undefined;

    // Validate pagination parameters
    if (skip !== undefined && (isNaN(skip) || skip < 0)) {
      return NextResponse.json({ error: "Invalid skip parameter" }, { status: 400 });
    }
    if (take !== undefined && (isNaN(take) || take < 1 || take > 500)) {
      return NextResponse.json({ error: "Invalid take parameter (must be 1-500)" }, { status: 400 });
    }

    const where: Record<string, unknown> = { weddingId };

    if (completed === "true") where.isCompleted = true;
    else if (completed === "false") where.isCompleted = false;

    if (priority && ["HIGH", "MEDIUM", "LOW"].includes(priority)) {
        where.priority = priority;
    }

    if (assignedToId) where.assignedToId = assignedToId;
    if (categoryId) where.categoryId = categoryId;
    if (supplierId) where.supplierId = supplierId;

    if (overdue === "true") {
        where.isCompleted = false;
        where.dueDate = { lt: new Date() };
    }

    const [total, tasks] = await withTenantContext(weddingId, (tx) =>
      Promise.all([
        tx.task.count({ where }),
        tx.task.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          ...(skip !== undefined ? { skip } : {}),
          ...(take !== undefined ? { take } : {}),
        }),
      ])
    );

    // Return with pagination metadata if paginated, otherwise return array for backwards compatibility
    if (skip !== undefined || take !== undefined) {
      return apiJson({
        tasks,
        total,
        hasMore: take !== undefined ? skip! + tasks.length < total : false,
      });
    }

    return apiJson(tasks);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"], req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  try {
    const body = await req.json();
    const {
        title, notes, priority, dueDate, categoryId,
        assignedToId, supplierId, isRecurring, recurringInterval, recurringEndDate,
    } = body;

    if (!title?.trim()) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: title, field: "title", required: true },
      { value: notes, field: "taskNotes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    // Run all validation queries in parallel (fixes sequential awaits)
    const [category, user, supplier] = await withTenantContext(weddingId, (tx) =>
      Promise.all([
        categoryId !== undefined && categoryId !== null
          ? tx.planningCategory.findFirst({ where: { id: categoryId, weddingId } })
          : null,
        assignedToId !== undefined && assignedToId !== null
          ? prisma.user.findUnique({ where: { id: assignedToId } })
          : null,
        supplierId !== undefined && supplierId !== null
          ? tx.supplier.findUnique({ where: { id: supplierId, weddingId } })
          : null,
      ])
    );

    // Check validation results
    if (categoryId !== undefined && categoryId !== null && !category) {
      return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }
    if (assignedToId !== undefined && assignedToId !== null && !user) {
      return NextResponse.json({ error: "Invalid assignedToId" }, { status: 400 });
    }
    if (supplierId !== undefined && supplierId !== null && !supplier) {
      return NextResponse.json({ error: "Invalid supplierId" }, { status: 400 });
    }

    const task = await withTenantContext(weddingId, (tx) =>
      tx.task.create({
        data: {
          weddingId,
          title: title.trim(),
          notes: notes?.trim() || null,
          priority: priority ?? "MEDIUM",
          dueDate: dueDate ? new Date(dueDate) : null,
          categoryId: categoryId || null,
          assignedToId: assignedToId || null,
          supplierId: supplierId || null,
          isRecurring: Boolean(isRecurring),
          recurringInterval: isRecurring && recurringInterval ? recurringInterval : null,
          recurringEndDate: isRecurring && recurringEndDate ? new Date(recurringEndDate) : null,
        },
        include: INCLUDE,
      })
    );

    return NextResponse.json(task, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

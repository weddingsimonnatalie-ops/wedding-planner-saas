export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

import { handleDbError } from "@/lib/db-error";const INCLUDE = {
  category: { select: { id: true, name: true, colour: true } },
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  supplier: { select: { id: true, name: true } },
} as const;

type Params = { params: Promise<{ id: string }> };

function nextOccurrenceDate(from: Date, interval: string): Date {
  const d = new Date(from);
  switch (interval) {
    case "DAILY":       d.setDate(d.getDate() + 1);       break;
    case "WEEKLY":      d.setDate(d.getDate() + 7);       break;
    case "FORTNIGHTLY": d.setDate(d.getDate() + 14);      break;
    case "MONTHLY":     d.setMonth(d.getMonth() + 1);     break;
  }
  return d;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;

    const { completed } = await req.json();

    const existing = await prisma.task.findUnique({ where: { id: id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();

    // Update the task
    const task = await prisma.task.update({
        where: { id: id },
        data: {
          isCompleted: Boolean(completed),
          completedAt: completed ? now : null,
        },
        include: INCLUDE,
    });

    // If completing a recurring task, create the next occurrence
    if (completed && existing.isRecurring && existing.recurringInterval) {
        const baseDue = existing.dueDate ?? now;
        const nextDue = nextOccurrenceDate(baseDue, existing.recurringInterval);

        // Only create if no end date, or next occurrence is before/on end date
        const shouldCreate =
          !existing.recurringEndDate || nextDue <= existing.recurringEndDate;

        if (shouldCreate) {
          const nextTask = await prisma.task.create({
            data: {
              title: existing.title,
              notes: existing.notes,
              priority: existing.priority,
              dueDate: nextDue,
              categoryId: existing.categoryId,
              assignedToId: existing.assignedToId,
              supplierId: existing.supplierId,
              isRecurring: true,
              recurringInterval: existing.recurringInterval,
              recurringEndDate: existing.recurringEndDate,
              isCompleted: false,
            },
            include: INCLUDE,
          });
          return NextResponse.json({ task, nextTask });
        }
    }

    return NextResponse.json({ task, nextTask: null });

  } catch (error) {
    return handleDbError(error);
  }

}

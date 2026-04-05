export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";
import { guestsToCsv } from "@/lib/csv";
import { zipSync, strToU8 } from "fflate";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(["ADMIN"], req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  // Fetch wedding config directly (Wedding is not a tenant-scoped RLS table)
  const config = await prisma.wedding.findUnique({
    where: { id: weddingId },
    select: {
      coupleName: true,
      weddingDate: true,
      reminderEmail: true,
    },
  });

  const data = await withTenantContext(weddingId, async (tx) => {
    const [guests, suppliers, payments, appointments, tasks, mealOptions, planningCategories] =
      await Promise.all([
        tx.guest.findMany({
          where: { weddingId },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          include: { table: { select: { name: true } } },
        }),
        tx.supplier.findMany({
          where: { weddingId },
          orderBy: { name: "asc" },
          include: {
            category: { select: { name: true } },
            payments: {
              select: {
                label: true,
                amount: true,
                dueDate: true,
                paidDate: true,
                status: true,
                notes: true,
              },
            },
          },
        }),
        tx.payment.findMany({
          where: { weddingId },
          orderBy: { dueDate: "asc" },
          include: { supplier: { select: { name: true } } },
        }),
        tx.appointment.findMany({
          where: { weddingId },
          orderBy: { date: "asc" },
          include: {
            supplier: { select: { name: true } },
            category: { select: { name: true } },
          },
        }),
        tx.task.findMany({
          where: { weddingId },
          orderBy: [{ isCompleted: "asc" }, { dueDate: "asc" }],
          include: {
            category: { select: { name: true } },
            assignedTo: { select: { name: true, email: true } },
            supplier: { select: { name: true } },
          },
        }),
        tx.mealOption.findMany({
          where: { weddingId },
          orderBy: { sortOrder: "asc" },
        }),
        tx.planningCategory.findMany({
          where: { weddingId },
          orderBy: { sortOrder: "asc" },
        }),
      ]);

    return {
      guests,
      suppliers,
      payments,
      appointments,
      tasks,
      mealOptions,
      planningCategories,
    };
  });

  const today = new Date().toISOString().split("T")[0];

  // guests.csv
  const guestsCsv = guestsToCsv(
    data.guests.map((g) => ({
      ...g,
      mealChoice: g.mealChoice ?? undefined,
    }))
  );

  // suppliers.json
  const suppliersJson = JSON.stringify(
    data.suppliers.map((s) => ({
      name: s.name,
      category: s.category?.name ?? null,
      status: s.status,
      contactName: s.contactName,
      email: s.email,
      phone: s.phone,
      website: s.website,
      contractValue: s.contractValue,
      notes: s.notes,
      payments: s.payments,
    })),
    null,
    2
  );

  // payments.json
  const paymentsJson = JSON.stringify(
    data.payments.map((p) => ({
      supplier: p.supplier.name,
      label: p.label,
      amount: p.amount,
      dueDate: p.dueDate,
      paidDate: p.paidDate,
      status: p.status,
      notes: p.notes,
    })),
    null,
    2
  );

  // appointments.json
  const appointmentsJson = JSON.stringify(
    data.appointments.map((a) => ({
      title: a.title,
      date: a.date,
      location: a.location,
      notes: a.notes,
      supplier: a.supplier?.name ?? null,
      category: a.category?.name ?? null,
      reminderDays: a.reminderDays,
    })),
    null,
    2
  );

  // tasks.json
  const tasksJson = JSON.stringify(
    data.tasks.map((t) => ({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      isCompleted: t.isCompleted,
      completedAt: t.completedAt,
      notes: t.notes,
      category: t.category?.name ?? null,
      assignedTo: t.assignedTo?.name ?? t.assignedTo?.email ?? null,
      supplier: t.supplier?.name ?? null,
      isRecurring: t.isRecurring,
      recurringInterval: t.recurringInterval,
      recurringEndDate: t.recurringEndDate,
    })),
    null,
    2
  );

  // config.json
  const configJson = JSON.stringify(
    {
      ...config,
      mealOptions: data.mealOptions.map((m) => ({
        name: m.name,
        course: m.course,
        description: m.description,
        isActive: m.isActive,
      })),
      planningCategories: data.planningCategories.map((c) => ({
        name: c.name,
        colour: c.colour,
        isActive: c.isActive,
        allocatedAmount: c.allocatedAmount,
      })),
    },
    null,
    2
  );

  // README.txt
  const coupleName = config?.coupleName ?? "Your wedding";
  const readmeTxt = [
    `Wedding Planner Data Export`,
    `===========================`,
    `Exported: ${new Date().toUTCString()}`,
    `Wedding: ${coupleName}`,
    ``,
    `Files included:`,
    `  guests.csv          All guests with RSVP status, meal choice, and table assignment`,
    `  suppliers.json      Supplier contacts, contracts, and payment schedules`,
    `  payments.json       All payments across all suppliers`,
    `  appointments.json   All appointments`,
    `  tasks.json          All tasks`,
    `  config.json         Wedding details, meal options, and categories`,
    ``,
    `This export contains all data associated with your wedding.`,
    `You can re-import guests.csv using the CSV import feature.`,
  ].join("\n");

  // Build zip
  const zip = zipSync({
    "guests.csv": strToU8(guestsCsv),
    "suppliers.json": strToU8(suppliersJson),
    "payments.json": strToU8(paymentsJson),
    "appointments.json": strToU8(appointmentsJson),
    "tasks.json": strToU8(tasksJson),
    "config.json": strToU8(configJson),
    "README.txt": strToU8(readmeTxt),
  });

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="wedding-export-${today}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

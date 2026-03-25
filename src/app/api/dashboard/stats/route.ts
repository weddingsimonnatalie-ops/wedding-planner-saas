export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // Auto-mark overdue
    await prisma.payment.updateMany({
        where: { status: "PENDING", dueDate: { lt: now } },
        data: { status: "OVERDUE" },
    });

    const [
        config,
        guestGroupBy,
        totalGuests,
        receptionEligible,
        assignedGuests,
        mealGroupBy,
        mealOptions,
        upcomingPayments,
        supplierGroupBy,
        contractedAgg,
        paidAgg,
        upcomingAppointments,
        tasksOverdue,
        tasksDueSoon,
        upcomingTasks,
    ] = await Promise.all([
        prisma.weddingConfig.findUnique({ where: { id: 1 } }),
        prisma.guest.groupBy({ by: ["rsvpStatus"], _count: { id: true } }),
        prisma.guest.count(),
        prisma.guest.count({
          where: {
            invitedToReception: true,
            NOT: { AND: [{ attendingReception: false }, { rsvpStatus: { notIn: ["DECLINED"] } }] },
          },
        }),
        prisma.guest.count({
          where: {
            invitedToReception: true,
            tableId: { not: null },
            NOT: { AND: [{ attendingReception: false }, { rsvpStatus: { notIn: ["DECLINED"] } }] },
          },
        }),
        prisma.guest.groupBy({
          by: ["mealChoice"],
          where: { rsvpStatus: "ACCEPTED", mealChoice: { not: null } },
          _count: { id: true },
        }),
        prisma.mealOption.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        prisma.payment.findMany({
          where: {
            status: { in: ["PENDING", "OVERDUE"] },
            OR: [
              { dueDate: { gte: now, lte: in60 } },
              { status: "OVERDUE" },
            ],
          },
          include: { supplier: { select: { id: true, name: true } } },
          orderBy: { dueDate: "asc" },
          take: 15,
        }),
        prisma.supplier.groupBy({ by: ["status"], _count: { id: true } }),
        prisma.supplier.aggregate({ _sum: { contractValue: true } }),
        prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
        prisma.appointment.findMany({
          where: { date: { gte: now, lte: in60 } },
          include: {
            supplier: { select: { id: true, name: true } },
            category: { select: { name: true, colour: true } },
          },
          orderBy: { date: "asc" },
          take: 10,
        }),
        prisma.task.count({
          where: { isCompleted: false, dueDate: { lt: now } },
        }),
        prisma.task.count({
          where: { isCompleted: false, dueDate: { gte: now, lte: in14 } },
        }),
        prisma.task.findMany({
          where: {
            isCompleted: false,
            OR: [
              { dueDate: { lt: now } },
              { dueDate: { gte: now, lte: in14 } },
            ],
          },
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
          orderBy: { dueDate: "asc" },
          take: 5,
        }),
    ]);

    // Guest breakdown
    const rsvpMap: Record<string, number> = {};
    guestGroupBy.forEach(g => { rsvpMap[g.rsvpStatus] = g._count.id; });

    // Meal name lookup
    const mealNameMap = Object.fromEntries(mealOptions.map(m => [m.id, m.name]));
    const meals = mealGroupBy
        .filter(m => m.mealChoice)
        .map(m => ({ name: mealNameMap[m.mealChoice!] ?? m.mealChoice!, count: m._count.id }))
        .sort((a, b) => b.count - a.count);

    // Supplier status map
    const supplierMap: Record<string, number> = {};
    supplierGroupBy.forEach(s => { supplierMap[s.status] = s._count.id; });

    const contracted = contractedAgg._sum.contractValue ?? 0;
    const paid = paidAgg._sum.amount ?? 0;

    return apiJson({
        wedding: {
          coupleName: config?.coupleName ?? "Our Wedding",
          weddingDate: config?.weddingDate ?? null,
        },
        guests: {
          total: totalGuests,
          accepted: rsvpMap["ACCEPTED"] ?? 0,
          partial:  rsvpMap["PARTIAL"]  ?? 0,
          declined: rsvpMap["DECLINED"] ?? 0,
          pending:  rsvpMap["PENDING"]  ?? 0,
          maybe:    rsvpMap["MAYBE"]    ?? 0,
          receptionEligible,
          assigned: assignedGuests,
        },
        meals,
        payments: upcomingPayments.map(p => ({
          id: p.id,
          label: p.label,
          amount: p.amount,
          dueDate: p.dueDate,
          status: p.status,
          supplierId: p.supplier.id,
          supplierName: p.supplier.name,
        })),
        suppliers: {
          ENQUIRY:   supplierMap["ENQUIRY"]   ?? 0,
          QUOTED:    supplierMap["QUOTED"]    ?? 0,
          BOOKED:    supplierMap["BOOKED"]    ?? 0,
          COMPLETE:  supplierMap["COMPLETE"]  ?? 0,
          CANCELLED: supplierMap["CANCELLED"] ?? 0,
        },
        budget: {
          contracted,
          paid,
          remaining: Math.max(0, contracted - paid),
        },
        appointments: upcomingAppointments.map(a => ({
          id: a.id,
          title: a.title,
          categoryName: a.category?.name ?? null,
          categoryColour: a.category?.colour ?? null,
          date: a.date,
          location: a.location,
          supplierId: a.supplierId,
          supplierName: a.supplier?.name ?? null,
        })),
        tasks: {
          overdue: tasksOverdue,
          dueSoon: tasksDueSoon,
          upcoming: upcomingTasks.map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            isCompleted: t.isCompleted,
            assignedToName: t.assignedTo?.name ?? t.assignedTo?.email ?? null,
          })),
        },
    });

  } catch (error) {
    return handleDbError(error);
  }

}

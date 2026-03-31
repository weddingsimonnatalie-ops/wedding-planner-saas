export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

/**
 * Combined dashboard badge counts for sidebar navigation.
 * Returns task, appointment, and payment counts in a single request.
 * Restricted to ADMIN + VIEWER to match nav item visibility.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(now);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [tasks, appointments, payments] = await withTenantContext(weddingId, (tx) =>
      Promise.all([
        // Tasks: overdue or due within 7 days
        tx.task.count({
          where: {
            weddingId,
            isCompleted: false,
            dueDate: { not: null, lte: weekFromNow },
          },
        }),
        // Appointments: in the next 7 days
        tx.appointment.count({
          where: {
            weddingId,
            date: { gte: now, lte: in7Days },
          },
        }),
        // Payments: overdue or due this month
        tx.payment.count({
          where: {
            weddingId,
            OR: [
              { status: "OVERDUE" },
              { status: "PENDING", dueDate: { lte: endOfMonth } },
            ],
          },
        }),
      ])
    );

    return apiJson({ tasks, appointments, payments });

  } catch (error) {
    return handleDbError(error);
  }
}
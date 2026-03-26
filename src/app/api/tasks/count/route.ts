export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { verifyWeddingCookieId, COOKIE_NAME } from "@/lib/wedding-cookie";

import { handleDbError } from "@/lib/db-error";

/**
 * Lightweight endpoint for task badge count.
 * Returns count of tasks that are overdue OR due within the next 7 days.
 * This matches the badge logic in LayoutShell.tsx.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
    if (!cookieValue) return NextResponse.json({ error: "No wedding context" }, { status: 401 });
    const weddingId = await verifyWeddingCookieId(cookieValue);
    if (!weddingId) return NextResponse.json({ error: "Invalid wedding context" }, { status: 401 });

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(now);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    // Count: incomplete tasks with due date within the next 7 days (or overdue)
    const count = await withTenantContext(weddingId, (tx) =>
      tx.task.count({
        where: {
          weddingId,
          isCompleted: false,
          dueDate: {
            not: null,
            lte: weekFromNow,
          },
        },
      })
    );

    return apiJson({ count });

  } catch (error) {
    return handleDbError(error);
  }
}

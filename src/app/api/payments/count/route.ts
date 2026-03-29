export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

// Returns count of overdue + due-this-month payments — used by the sidebar badge.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await withTenantContext(weddingId, (tx) =>
      tx.payment.count({
        where: {
          weddingId,
          OR: [
            { status: "OVERDUE" },
            { status: "PENDING", dueDate: { lte: endOfMonth } },
          ],
        },
      })
    );

    return apiJson({ count });
  } catch (error) {
    return handleDbError(error);
  }
}

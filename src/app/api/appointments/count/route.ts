export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

// Returns count of upcoming appointments in the next 7 days — used by the sidebar badge.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const count = await withTenantContext(weddingId, (tx) =>
      tx.appointment.count({
        where: {
          weddingId,
          date: { gte: now, lte: in7Days },
        },
      })
    );

    return apiJson({ count });
  } catch (error) {
    return handleDbError(error);
  }
}

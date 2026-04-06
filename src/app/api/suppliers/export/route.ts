export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { suppliersToCsv } from "@/lib/supplier-csv";
import { noCacheHeaders } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const suppliers = await withTenantContext(weddingId, (tx) =>
      tx.supplier.findMany({
        where: { weddingId },
        include: { category: { select: { name: true } } },
        orderBy: [{ name: "asc" }],
      })
    );

    const csv = suppliersToCsv(suppliers);

    const res = new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="suppliers-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
    noCacheHeaders(res.headers);
    return res;
  } catch (error) {
    return handleDbError(error);
  }
}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { guestsToCsv } from "@/lib/csv";
import { noCacheHeaders } from "@/lib/api-response";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;

    const guests = await prisma.guest.findMany({
        include: { table: { select: { name: true } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const csv = guestsToCsv(guests);

    const res = new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="guests-${new Date().toISOString().split("T")[0]}.csv"`,
        },
    });
    noCacheHeaders(res.headers);
    return res;

  } catch (error) {
    return handleDbError(error);
  }

}

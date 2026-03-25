import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";

import { handleDbError } from "@/lib/db-error";

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { ids } = await req.json();
    if (!Array.isArray(ids)) {
        return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }

    await Promise.all(
        ids.map((id: string, index: number) =>
          prisma.appointmentCategory.update({
            where: { id },
            data: { sortOrder: index * 10 },
          })
        )
    );

    invalidateCache("appointment-categories");
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

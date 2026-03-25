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

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { twoFactorEnabled: true },
    });

    const backupCodesRemaining = user?.twoFactorEnabled
        ? await prisma.backupCode.count({
            where: { userId: session.user.id, usedAt: null },
          })
        : 0;

    return apiJson({
        enabled: user?.twoFactorEnabled ?? false,
        backupCodesRemaining,
    });

  } catch (error) {
    return handleDbError(error);
  }

}

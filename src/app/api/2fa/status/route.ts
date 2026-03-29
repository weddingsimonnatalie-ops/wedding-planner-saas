export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { apiJson } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { twoFactorEnabled: true },
    });

    const backupCodesRemaining = user?.twoFactorEnabled
      ? await prisma.backupCode.count({
          where: { userId: auth.user.id, usedAt: null },
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

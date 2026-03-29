export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/totp";

import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/2fa/verify
 * Verifies the user's first TOTP code, enables 2FA, issues backup codes.
 * Body: { code: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;

  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.twoFactorEnabled) {
      return NextResponse.json({ error: "2FA is already enabled" }, { status: 400 });
    }
    if (!user.twoFactorSecret) {
      return NextResponse.json({ error: "No pending setup — call /api/2fa/setup first" }, { status: 400 });
    }

    if (!verifyTotpCode(code, user.twoFactorSecret)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Generate backup codes
    const plainCodes = generateBackupCodes(8);
    const hashes = await Promise.all(plainCodes.map(hashBackupCode));

    await prisma.$transaction([
      prisma.user.update({
        where: { id: auth.user.id },
        data: { twoFactorEnabled: true },
      }),
      prisma.backupCode.deleteMany({ where: { userId: auth.user.id } }),
      prisma.backupCode.createMany({
        data: hashes.map((codeHash) => ({ userId: auth.user.id, codeHash })),
      }),
    ]);

    return NextResponse.json({ backupCodes: plainCodes });

  } catch (error) {
    return handleDbError(error);
  }
}

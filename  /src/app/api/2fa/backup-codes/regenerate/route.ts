import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/totp";

import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/2fa/backup-codes/regenerate
 * Requires a valid TOTP code to regenerate all backup codes.
 * Body: { totpCode: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { totpCode } = await req.json();
    if (!totpCode) return NextResponse.json({ error: "TOTP code required" }, { status: 400 });

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
    }

    if (!verifyTotpCode(totpCode, user.twoFactorSecret)) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const plainCodes = generateBackupCodes(8);
    const hashes = await Promise.all(plainCodes.map(hashBackupCode));

    await prisma.$transaction([
        prisma.backupCode.deleteMany({ where: { userId: session.user.id } }),
        prisma.backupCode.createMany({
          data: hashes.map((codeHash) => ({ userId: session.user.id, codeHash })),
        }),
    ]);

    return NextResponse.json({ backupCodes: plainCodes });

  } catch (error) {
    return handleDbError(error);
  }

}

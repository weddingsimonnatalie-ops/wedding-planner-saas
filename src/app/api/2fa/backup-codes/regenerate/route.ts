export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/totp";
import { checkRateLimit } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/2fa/backup-codes/regenerate
 * Requires a valid TOTP code to regenerate all backup codes.
 * Body: { totpCode: string }
 * Rate limit: 5 per user per hour.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;

  // Rate limit: 5 per user per hour
  const rateKey = `2fa-backup-regen:${auth.user.id}`;
  const rateCheck = await checkRateLimit(rateKey, 5, 60 * 60 * 1000);
  if (rateCheck.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { totpCode } = await req.json();
    if (!totpCode) return NextResponse.json({ error: "TOTP code required" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
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

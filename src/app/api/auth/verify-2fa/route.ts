import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, verifyBackupCode } from "@/lib/totp";
import { logAttempt } from "@/lib/login-attempt";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify-2fa
 * Verify TOTP code or backup code during 2FA login flow.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { email, totpCode, backupCode } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!totpCode && !backupCode) {
      return NextResponse.json({ error: "TOTP code or backup code is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ error: "2FA not enabled for this user" }, { status: 400 });
    }

    // Verify TOTP code
    if (totpCode) {
      const valid = verifyTotpCode(totpCode, user.twoFactorSecret);
      if (!valid) {
        await logAttempt(email, false, req);
        return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
      }
    }

    // Verify backup code
    if (backupCode) {
      const backupCodes = await prisma.backupCode.findMany({
        where: { userId: user.id, usedAt: null },
      });

      let validCode = false;
      for (const bc of backupCodes) {
        const valid = await verifyBackupCode(backupCode, bc.codeHash);
        if (valid) {
          // Mark backup code as used
          await prisma.backupCode.update({
            where: { id: bc.id },
            data: { usedAt: new Date() },
          });
          validCode = true;
          break;
        }
      }

      if (!validCode) {
        await logAttempt(email, false, req);
        return NextResponse.json({ error: "Invalid backup code" }, { status: 400 });
      }
    }

    await logAttempt(email, true, req);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("2FA verification error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
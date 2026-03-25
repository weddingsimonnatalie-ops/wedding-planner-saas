import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/totp";
import bcrypt from "bcryptjs";
import { invalidateUserSessions } from "@/lib/session";

import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/2fa/disable
 * Requires the current TOTP code (or backup code) to confirm intent.
 * Body: { totpCode?: string; backupCode?: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { totpCode, backupCode } = await req.json();

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { twoFactorEnabled: true, twoFactorSecret: true },
        // include backup codes for verification
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
    }

    let verified = false;

    if (totpCode) {
        verified = verifyTotpCode(totpCode, user.twoFactorSecret);
    } else if (backupCode) {
        const unused = await prisma.backupCode.findMany({
          where: { userId: session.user.id, usedAt: null },
        });
        const normalised = backupCode.trim().toLowerCase();
        for (const bc of unused) {
          if (await bcrypt.compare(normalised, bc.codeHash)) {
            verified = true;
            break;
          }
        }
    }

    if (!verified) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    await prisma.$transaction([
        prisma.user.update({
          where: { id: session.user.id },
          data: { twoFactorEnabled: false, twoFactorSecret: null },
        }),
        prisma.backupCode.deleteMany({ where: { userId: session.user.id } }),
    ]);

    // Invalidate all sessions - user must re-login after disabling 2FA
    await invalidateUserSessions(session.user.id);

    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}
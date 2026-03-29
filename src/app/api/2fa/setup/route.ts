export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generateSecret, generateOtpauthUrl, encryptSecret } from "@/lib/totp";
import { checkRateLimit } from "@/lib/rate-limit";
import QRCode from "qrcode";

import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/2fa/setup
 * Generates a new TOTP secret, stores it encrypted (but does NOT enable 2FA
 * yet — that happens at /api/2fa/verify after the user confirms their code),
 * and returns a QR code data URL.
 * Rate limit: 5 setups per user per hour.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;

  // Rate limit: 5 setups per user per hour
  const rateKey = `2fa-setup:${auth.user.id}`;
  const rateCheck = await checkRateLimit(rateKey, 5, 60 * 60 * 1000);
  if (rateCheck.limited) {
    return NextResponse.json(
      { error: "Too many setup attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.twoFactorEnabled) {
      return NextResponse.json({ error: "2FA is already enabled" }, { status: 400 });
    }

    const secret = generateSecret();
    const otpauthUrl = generateOtpauthUrl(user.email, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    const encryptedSecret = encryptSecret(secret);

    // Persist the pending secret (twoFactorEnabled stays false until verified)
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { twoFactorSecret: encryptedSecret },
    });

    return NextResponse.json({ qrDataUrl, secret });

  } catch (error) {
    return handleDbError(error);
  }
}

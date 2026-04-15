export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateUserSessions } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { LENGTH_LIMITS } from "@/lib/validation";
import bcrypt from "bcryptjs";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * POST /api/auth/reset-password/[token]
 * Public endpoint. Validates the reset token and updates the user's password.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: "Invalid reset link." }, { status: 404 });
    }

    // Rate limit by token (5 per 15 min — prevents brute-force on token space)
    const rateCheck = await checkRateLimit(`reset-password:token:${token}`, 5, WINDOW_MS);
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";

    if (password.length < LENGTH_LIMITS.passwordMin) {
      return NextResponse.json(
        { error: `Password must be at least ${LENGTH_LIMITS.passwordMin} characters.` },
        { status: 400 }
      );
    }

    if (password.length > LENGTH_LIMITS.passwordMax) {
      return NextResponse.json(
        { error: `Password must be ${LENGTH_LIMITS.passwordMax} characters or less.` },
        { status: 400 }
      );
    }

    // Look up the reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!resetToken) {
      return NextResponse.json({ error: "This reset link is invalid." }, { status: 404 });
    }

    if (resetToken.usedAt) {
      return NextResponse.json(
        { error: "This reset link has already been used." },
        { status: 410 }
      );
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one." },
        { status: 410 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    // Mark token used and update password atomically
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.account.updateMany({
        where: { userId: resetToken.userId, providerId: "credential" },
        data: { password: hashed },
      }),
    ]);

    // Invalidate all existing sessions — user must log in with new password
    await invalidateUserSessions(resetToken.userId);

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[reset-password] Error:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

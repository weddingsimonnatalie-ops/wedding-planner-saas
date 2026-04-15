export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { randomBytes } from "crypto";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * POST /api/auth/forgot-password
 * Public endpoint. Sends a password reset email if the address is registered.
 * Always returns 200 regardless of whether the email exists (prevents user enumeration).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ ok: true });
    }

    // Rate limit by IP (10 per 15 min)
    const ip = extractIp(req);
    const ipCheck = await checkRateLimit(`forgot-password:ip:${ip}`, 10, WINDOW_MS);
    if (ipCheck.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Rate limit by email (3 per 15 min)
    const emailCheck = await checkRateLimit(`forgot-password:email:${email}`, 3, WINDOW_MS);
    if (emailCheck.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Look up user — silently return ok if not found (no enumeration)
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Delete any existing unused reset tokens for this user to prevent accumulation
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    });

    // Generate cryptographically secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        id: randomBytes(16).toString("hex"),
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Send email — fire and forget; don't reveal send failures to caller
    sendPasswordResetEmail(user.email, token).catch((err) => {
      console.error("[forgot-password] Failed to send reset email:", err);
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[forgot-password] Error:", error);
    // Return ok even on internal errors — don't leak state
    return NextResponse.json({ ok: true });
  }
}

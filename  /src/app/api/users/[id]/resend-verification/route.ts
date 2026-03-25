import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, generateVerificationToken } from "@/lib/email";

import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/users/[id]/resend-verification
 * Resend verification email to a user (admin only).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    // Check if email verification is enabled
    if (process.env.EMAIL_VERIFICATION_REQUIRED !== "true") {
      return NextResponse.json(
        { error: "Email verification is not enabled" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: id },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "User is already verified" }, { status: 400 });
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationTokenExpires,
      },
    });

    // Get couple name for email
    const config = await prisma.weddingConfig.findUnique({ where: { id: 1 } });
    const coupleName = config?.coupleName ?? "Wedding Planner";

    // Send verification email
    const result = await sendVerificationEmail(user.email, user.name, verificationToken, coupleName);

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Verification email sent" });

  } catch (error) {
    return handleDbError(error);
  }
}
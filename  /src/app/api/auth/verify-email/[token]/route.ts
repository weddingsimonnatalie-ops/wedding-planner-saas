import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/verify-email/[token]
 * Verify email address using the token from the verification email.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.redirect(new URL("/login?error=invalid", req.url));
    }

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpires: { gte: new Date() },
      },
    });

    if (!user) {
      return NextResponse.redirect(new URL("/login?error=expired", req.url));
    }

    // Mark email as verified and clear verification token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });

    return NextResponse.redirect(new URL("/login?verified=true", req.url));

  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.redirect(new URL("/login?error=unknown", req.url));
  }
}
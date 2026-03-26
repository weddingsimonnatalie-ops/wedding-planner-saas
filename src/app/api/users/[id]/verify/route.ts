export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/users/[id]/verify
 * Manually mark a user as verified (admin only).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Verify user is a member of the current wedding
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: id, weddingId } },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "User not found in this wedding" }, { status: 404 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationTokenExpires: null,
      },
      select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
    });

    // Fetch role from WeddingMember for response
    const updatedMember = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: id, weddingId } },
      select: { role: true },
    });

    return NextResponse.json({ ...user, role: updatedMember?.role ?? null });

  } catch (error) {
    return handleDbError(error);
  }
}

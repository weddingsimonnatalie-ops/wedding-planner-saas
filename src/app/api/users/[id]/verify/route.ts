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

    const user = await prisma.user.update({
      where: { id: id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationTokenExpires: null,
      },
      select: { id: true, name: true, email: true, role: true, emailVerified: true, createdAt: true },
    });

    return NextResponse.json(user);

  } catch (error) {
    return handleDbError(error);
  }
}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { apiJson } from "@/lib/api-response";
import { invalidateUserSessions } from "@/lib/session";

import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Cannot change own role
    if (auth.user.id === id) {
      return NextResponse.json({ error: "You cannot change your own role" }, { status: 403 });
    }

    const { role } = await req.json();

    if (!Object.values(UserRole).includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Verify the target user is a member of the current wedding
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: id, weddingId } },
      select: { id: true },
    });

    if (!member) {
      return NextResponse.json({ error: "User not found in this wedding" }, { status: 404 });
    }

    // Update WeddingMember.role (not User.role — that field no longer exists)
    const updatedMember = await prisma.weddingMember.update({
      where: { userId_weddingId: { userId: id, weddingId } },
      data: { role },
      include: {
        user: {
          select: { id: true, name: true, email: true, twoFactorEnabled: true, lockedUntil: true, createdAt: true },
        },
      },
    });

    // Invalidate all sessions for this user — role changes require re-login
    await invalidateUserSessions(id);

    return apiJson({ ...updatedMember.user, role: updatedMember.role });

  } catch (error) {
    return handleDbError(error);
  }

}

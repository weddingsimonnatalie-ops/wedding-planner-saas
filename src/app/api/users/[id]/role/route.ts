export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { apiJson } from "@/lib/api-response";
import { invalidateUserSessions } from "@/lib/session";

import { handleDbError } from "@/lib/db-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    // Cannot change own role
    if (auth.user.id === id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 403 });
    }

    const { role } = await req.json();

    if (!Object.values(UserRole).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const user = await prisma.user.update({
    where: { id: id },
    data: { role },
    select: { id: true, name: true, email: true, role: true, twoFactorEnabled: true, lockedUntil: true, createdAt: true },
    });

    // Invalidate all sessions for this user - role changes require re-login
    await invalidateUserSessions(id);

    return apiJson(user);

  } catch (error) {
    return handleDbError(error);
  }

}
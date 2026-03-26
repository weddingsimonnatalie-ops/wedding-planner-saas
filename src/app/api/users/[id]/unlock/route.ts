export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

import { handleDbError } from "@/lib/db-error";

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

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await prisma.user.update({
      where: { id },
      data: { lockedUntil: null },
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    return handleDbError(error);
  }

}

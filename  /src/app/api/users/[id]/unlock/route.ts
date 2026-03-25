import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

import { handleDbError } from "@/lib/db-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    // Validate user exists before unlock
    const user = await prisma.user.findUnique({ where: { id: id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await prisma.user.update({
    where: { id: id },
    data: { lockedUntil: null },
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    return handleDbError(error);
  }

}

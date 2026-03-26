export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { handleDbError } from "@/lib/db-error";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    // Verify invite belongs to this wedding before deleting
    const invite = await prisma.weddingInvite.findFirst({
      where: { id, weddingId: auth.weddingId },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    await prisma.weddingInvite.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleDbError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

import { handleDbError } from "@/lib/db-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, attachmentId } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;

    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const filePath = path.join(process.cwd(), "uploads", id, attachment.storedAs);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.attachment.delete({ where: { id: attachmentId } });
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

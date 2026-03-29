export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";
import { deleteFile } from "@/lib/s3";

import { handleDbError } from "@/lib/db-error";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, attachmentId } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.findFirst({ where: { id: attachmentId, supplierId: id, weddingId } })
    );
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await deleteFile(attachment.storedAs);

    await withTenantContext(weddingId, (tx) =>
      tx.attachment.delete({ where: { id: attachmentId } })
    );
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

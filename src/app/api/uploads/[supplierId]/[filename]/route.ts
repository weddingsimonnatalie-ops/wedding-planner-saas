export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import path from "path";
import { getDownloadUrl } from "@/lib/s3";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ supplierId: string; filename: string }> }
): Promise<NextResponse> {
  try {
    const { supplierId, filename } = await params;
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Use path.basename to prevent path traversal
    const storedAs = path.basename(filename);

    // Verify the supplier belongs to this wedding, then fetch the attachment
    // storedAs is now the full S3 key — match by the basename portion
    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.findFirst({
        where: {
          supplierId,
          weddingId,
          storedAs: { endsWith: `/${storedAs}` },
        },
      })
    );

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const presignedUrl = await getDownloadUrl(attachment.storedAs, 300);
    return NextResponse.redirect(presignedUrl, 302);

  } catch (error) {
    return handleDbError(error);
  }
}

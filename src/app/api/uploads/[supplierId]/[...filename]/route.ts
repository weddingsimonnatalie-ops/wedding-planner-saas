export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/s3";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ supplierId: string; filename: string[] }> }
): Promise<NextResponse> {
  try {
    const { supplierId, filename } = await params;
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Last segment is the UUID filename — use it to look up the attachment
    const basename = filename[filename.length - 1];

    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.findFirst({
        where: {
          supplierId,
          weddingId,
          storedAs: { endsWith: `/${basename}` },
        },
      })
    );

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Pass original filename so the presigned URL includes Content-Disposition: attachment,
    // ensuring the browser downloads the file rather than displaying it inline.
    const presignedUrl = await getDownloadUrl(attachment.storedAs, 300, attachment.filename);
    return NextResponse.redirect(presignedUrl, 302);

  } catch (error) {
    return handleDbError(error);
  }
}

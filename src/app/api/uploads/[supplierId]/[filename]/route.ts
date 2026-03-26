export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { noCacheHeaders } from "@/lib/api-response";
import { buildContentDisposition } from "@/lib/filename";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

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
    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.findFirst({
        where: {
          supplierId,
          storedAs,
          weddingId,
        },
      })
    );

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), "uploads", supplierId, storedAs);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = storedAs.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME[ext] ?? "application/octet-stream";
    const buffer = fs.readFileSync(filePath);

    // Use original filename for Content-Disposition (already sanitized on upload)
    // buildContentDisposition adds defense-in-depth sanitization
    const INLINE_TYPES = new Set(["pdf", "jpg", "jpeg", "png"]);
    const disposition = INLINE_TYPES.has(ext)
      ? buildContentDisposition(attachment.filename, "inline")
      : buildContentDisposition(attachment.filename, "attachment");

    const res = new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
      },
    });
    noCacheHeaders(res.headers);
    return res;

  } catch (error) {
    return handleDbError(error);
  }
}

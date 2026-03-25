export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { can } from "@/lib/permissions";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { noCacheHeaders } from "@/lib/api-response";
import { buildContentDisposition } from "@/lib/filename";

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
  _req: NextRequest,
  { params }: { params: Promise<{ supplierId: string; filename: string }> }
): Promise<NextResponse> {
  try {
    const { supplierId, filename } = await params;
    const session = await auth.api.getSession({ headers: _req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!can.accessSuppliers((session.user as { role: UserRole }).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Use path.basename to prevent path traversal
    const storedAs = path.basename(filename);

    // Fetch attachment from database to get the original filename
    const attachment = await prisma.attachment.findFirst({
      where: {
        supplierId: supplierId,
        storedAs,
      },
    });

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
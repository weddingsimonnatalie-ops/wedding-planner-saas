import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireUploadFeature } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { PDFDocument } from "pdf-lib";
import { sanitizeFilename } from "@/lib/filename";
import { withTenantContext } from "@/lib/tenant";
import { uploadFile } from "@/lib/s3";

import { handleDbError } from "@/lib/db-error";
const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const uploadGate = requireUploadFeature(auth.wedding.subscriptionStatus);
    if (uploadGate) return uploadGate;

    const { weddingId } = auth;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected || !ALLOWED[detected.mime]) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (detected.mime !== file.type) {
      return NextResponse.json({ error: "File type mismatch" }, { status: 400 });
    }

    let sanitizedBuffer = buffer;

    if (detected.mime === "application/pdf") {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      sanitizedBuffer = Buffer.from(await pdfDoc.save());
    }

    const ext = ALLOWED[detected.mime];
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });

    // Verify supplier exists and belongs to this wedding
    const supplier = await withTenantContext(weddingId, (tx) =>
      tx.supplier.findUnique({ where: { id, weddingId } })
    );
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const storedAs = `${crypto.randomUUID()}.${ext}`;
    const s3Key = `${weddingId}/suppliers/${id}/${storedAs}`;
    await uploadFile(s3Key, sanitizedBuffer, detected.mime);

    // Sanitize filename before storing in database
    const safeFilename = sanitizeFilename(file.name);

    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.create({
        data: {
          weddingId,
          supplierId: id,
          filename: safeFilename,
          storedAs: s3Key,
          mimeType: detected.mime,
          sizeBytes: sanitizedBuffer.length,
        },
      })
    );

    return NextResponse.json(attachment, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }
}

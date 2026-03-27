import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { sanitizeFilename } from "@/lib/filename";
import { withTenantContext } from "@/lib/tenant";
import { uploadFile, getDownloadUrl, deleteFile } from "@/lib/s3";
import { handleDbError } from "@/lib/db-error";

export const dynamic = "force-dynamic";

// Allowed MIME types for receipts
const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

// ── POST: Upload receipt ───────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Verify payment exists, belongs to this wedding, and get supplier info
    const payment = await withTenantContext(weddingId, (tx) =>
      tx.payment.findUnique({
        where: { id, weddingId },
        include: { supplier: { select: { id: true } } },
      })
    );

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected || !ALLOWED[detected.mime]) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    if (detected.mime !== file.type) {
      return NextResponse.json({ error: "File type mismatch" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });
    }

    // Delete existing receipt if any
    const existingReceipt = await withTenantContext(weddingId, (tx) =>
      tx.attachment.findFirst({
        where: { paymentId: id, weddingId },
      })
    );

    if (existingReceipt) {
      await deleteFile(existingReceipt.storedAs);
      await withTenantContext(weddingId, (tx) =>
        tx.attachment.delete({ where: { id: existingReceipt.id } })
      );
    }

    // Store new receipt
    const ext = ALLOWED[detected.mime];
    const storedAs = `${crypto.randomUUID()}.${ext}`;
    const s3Key = `${weddingId}/receipts/${id}/${storedAs}`;
    await uploadFile(s3Key, buffer, detected.mime);

    // Sanitize filename before storing in database
    const safeFilename = sanitizeFilename(file.name);

    // Create attachment record linked to payment
    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.create({
        data: {
          weddingId,
          supplierId: payment.supplier.id,
          paymentId: id,
          filename: safeFilename,
          storedAs: s3Key,
          mimeType: detected.mime,
          sizeBytes: buffer.length,
        },
      })
    );

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    return handleDbError(error);
  }
}

// ── GET: Serve receipt file ───────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Find receipt attachment for this payment, scoped to wedding
    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.findFirst({
        where: { paymentId: id, weddingId },
        include: { supplier: true },
      })
    );

    if (!attachment) {
      return NextResponse.json({ error: "No receipt found" }, { status: 404 });
    }

    // Verify payment exists and belongs to this wedding
    const payment = await withTenantContext(weddingId, (tx) =>
      tx.payment.findUnique({
        where: { id, weddingId },
      })
    );

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const presignedUrl = await getDownloadUrl(attachment.storedAs, 300, attachment.filename);
    return NextResponse.redirect(presignedUrl, 302);
  } catch (error) {
    return handleDbError(error);
  }
}

// ── DELETE: Remove receipt ────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Find receipt attachment scoped to wedding
    const attachment = await withTenantContext(weddingId, (tx) =>
      tx.attachment.findFirst({
        where: { paymentId: id, weddingId },
      })
    );

    if (!attachment) {
      return NextResponse.json({ error: "No receipt found" }, { status: 404 });
    }

    await deleteFile(attachment.storedAs);

    // Delete database record
    await withTenantContext(weddingId, (tx) =>
      tx.attachment.delete({ where: { id: attachment.id } })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleDbError(error);
  }
}

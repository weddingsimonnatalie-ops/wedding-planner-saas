import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { sanitizeFilename, buildContentDisposition } from "@/lib/filename";
import { noCacheHeaders } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

export const dynamic = "force-dynamic";

// Allowed MIME types for receipts
const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const MIME_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

// ── POST: Upload receipt ───────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    // Verify payment exists and get supplier info
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { supplier: { select: { id: true } } },
    });

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
    const existingReceipt = await prisma.attachment.findFirst({
      where: { paymentId: id },
    });

    if (existingReceipt) {
      // Delete file from filesystem
      const existingPath = path.join(
        process.cwd(),
        "uploads",
        payment.supplier.id,
        existingReceipt.storedAs
      );
      if (fs.existsSync(existingPath)) {
        fs.unlinkSync(existingPath);
      }
      // Delete database record
      await prisma.attachment.delete({ where: { id: existingReceipt.id } });
    }

    // Store new receipt
    const ext = ALLOWED[detected.mime];
    const storedAs = `${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "uploads", payment.supplier.id);
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, storedAs), buffer);

    // Sanitize filename before storing in database
    const safeFilename = sanitizeFilename(file.name);

    // Create attachment record linked to payment
    const attachment = await prisma.attachment.create({
      data: {
        supplierId: payment.supplier.id,
        paymentId: id,
        filename: safeFilename,
        storedAs,
        mimeType: detected.mime,
        sizeBytes: buffer.length,
      },
    });

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

    // Find receipt attachment for this payment
    const attachment = await prisma.attachment.findFirst({
      where: { paymentId: id },
      include: { supplier: true },
    });

    if (!attachment) {
      return NextResponse.json({ error: "No receipt found" }, { status: 404 });
    }

    // Verify payment exists
    const payment = await prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const filePath = path.join(
      process.cwd(),
      "uploads",
      attachment.supplierId,
      attachment.storedAs
    );

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = attachment.storedAs.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME_EXT[ext] ?? "application/octet-stream";
    const fileBuffer = fs.readFileSync(filePath);

    // Images and PDFs display inline
    const inlineTypes = new Set(["pdf", "jpg", "jpeg", "png"]);
    const disposition = inlineTypes.has(ext)
      ? buildContentDisposition(attachment.filename, "inline")
      : buildContentDisposition(attachment.filename, "attachment");

    const res = new NextResponse(fileBuffer, {
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

// ── DELETE: Remove receipt ────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    // Find receipt attachment
    const attachment = await prisma.attachment.findFirst({
      where: { paymentId: id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "No receipt found" }, { status: 404 });
    }

    // Delete file from filesystem
    const filePath = path.join(
      process.cwd(),
      "uploads",
      attachment.supplierId,
      attachment.storedAs
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete database record
    await prisma.attachment.delete({ where: { id: attachment.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleDbError(error);
  }
}
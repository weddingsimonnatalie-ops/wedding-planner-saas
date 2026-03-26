export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { apiJson } from "@/lib/api-response";
import { SupplierStatus } from "@prisma/client";
import { isValidSupplierStatus, validateFields, LENGTH_LIMITS } from "@/lib/validation";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Auto-mark overdue payments
    await withTenantContext(weddingId, (tx) =>
      tx.payment.updateMany({
        where: { supplierId: id, weddingId, status: "PENDING", dueDate: { lt: new Date() } },
        data: { status: "OVERDUE" },
      })
    );

    const supplier = await withTenantContext(weddingId, (tx) =>
      tx.supplier.findUnique({
        where: { id, weddingId },
        include: {
          payments: { orderBy: { dueDate: "asc" } },
          attachments: { orderBy: { uploadedAt: "desc" } },
          category: true,
        },
      })
    );

    if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return apiJson(supplier);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    const data = await req.json();

    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await withTenantContext(weddingId, (tx) =>
        tx.supplierCategory.findFirst({ where: { id: data.categoryId, weddingId } })
      );
      if (!category) return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }

    // Validate status if provided
    if (data.status !== undefined && data.status !== null && !isValidSupplierStatus(data.status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: data.name, field: "supplierName" },
      { value: data.contactName, field: "contactName" },
      { value: data.email, field: "email" },
      { value: data.phone, field: "phone" },
      { value: data.website, field: "website" },
      { value: data.notes, field: "notes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const supplier = await withTenantContext(weddingId, (tx) =>
      tx.supplier.update({
        where: { id, weddingId },
        data: {
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId || null } : {}),
          ...(data.name !== undefined ? { name: data.name?.trim() || "" } : {}),
          ...(data.contactName !== undefined ? { contactName: data.contactName?.trim() || null } : {}),
          ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
          ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
          ...(data.website !== undefined ? { website: data.website?.trim() || null } : {}),
          ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
          ...(data.contractValue !== undefined
            ? { contractValue: data.contractValue !== "" && data.contractValue !== null ? Number(data.contractValue) : null }
            : {}),
          ...(data.contractSigned !== undefined ? { contractSigned: Boolean(data.contractSigned) } : {}),
          ...(data.contractSignedAt !== undefined
            ? { contractSignedAt: data.contractSignedAt ? new Date(data.contractSignedAt) : null }
            : {}),
          ...(data.status !== undefined ? { status: data.status as SupplierStatus } : {}),
        },
        include: { category: true },
      })
    );

    return NextResponse.json(supplier);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Remove uploaded files
    const uploadDir = path.join(process.cwd(), "uploads", id);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }

    await withTenantContext(weddingId, (tx) =>
      tx.supplier.delete({ where: { id, weddingId } })
    );
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

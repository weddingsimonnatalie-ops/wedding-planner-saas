export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { apiJson } from "@/lib/api-response";
import { SupplierStatus } from "@prisma/client";
import { isValidSupplierStatus, validateFields, LENGTH_LIMITS } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: _req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Auto-mark overdue payments
    await prisma.payment.updateMany({
      where: { supplierId: id, status: "PENDING", dueDate: { lt: new Date() } },
      data: { status: "OVERDUE" },
    });

    const supplier = await prisma.supplier.findUnique({
      where: { id: id },
      include: {
        payments: { orderBy: { dueDate: "asc" } },
        attachments: { orderBy: { uploadedAt: "desc" } },
        category: true,
      },
    });

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

    const data = await req.json();

    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await prisma.supplierCategory.findUnique({ where: { id: data.categoryId } });
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

    const supplier = await prisma.supplier.update({
      where: { id: id },
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
    });

    return NextResponse.json(supplier);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(_req);
    if (!auth.authorized) return auth.response;

    // Remove uploaded files
    const uploadDir = path.join(process.cwd(), "uploads", id);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }

    await prisma.supplier.delete({ where: { id: id } });
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";
import { SupplierStatus } from "@prisma/client";
import type { SupplierCreateBody } from "@/types/api";
import { isValidSupplierStatus, validateFields, LENGTH_LIMITS } from "@/lib/validation";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER"], req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const status = searchParams.get("status");

    // Optional pagination — defaults to returning all results for backward compatibility
    const skip = searchParams.get("skip") ? parseInt(searchParams.get("skip")!, 10) : undefined;
    const take = searchParams.get("take") ? parseInt(searchParams.get("take")!, 10) : undefined;

    // Validate pagination parameters
    if (skip !== undefined && (isNaN(skip) || skip < 0)) {
      return NextResponse.json({ error: "Invalid skip parameter" }, { status: 400 });
    }
    if (take !== undefined && (isNaN(take) || take < 1 || take > 100)) {
      return NextResponse.json({ error: "Invalid take parameter (must be 1-100)" }, { status: 400 });
    }

    const suppliers = await withTenantContext(weddingId, (tx) =>
      tx.supplier.findMany({
        where: {
          weddingId,
          ...(category ? { categoryId: category } : {}),
          ...(status && isValidSupplierStatus(status) ? { status } : {}),
        },
        select: {
          id: true,
          categoryId: true,
          name: true,
          contactName: true,
          status: true,
          contractValue: true,
          category: { select: { id: true, name: true } },
          payments: { select: { amount: true, status: true } },
        },
        orderBy: [{ name: "asc" }],
        ...(skip !== undefined ? { skip } : {}),
        ...(take !== undefined ? { take } : {}),
      })
    );

    return apiJson(suppliers);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    const data: SupplierCreateBody = await req.json();
    if (!data.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: data.name, field: "supplierName", required: true },
      { value: data.contactName, field: "contactName" },
      { value: data.email, field: "email" },
      { value: data.phone, field: "phone" },
      { value: data.website, field: "website" },
      { value: data.notes, field: "notes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await withTenantContext(weddingId, (tx) =>
        tx.planningCategory.findFirst({ where: { id: data.categoryId!, weddingId } })
      );
      if (!category) return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }

    // Validate status against enum
    const status: SupplierStatus = isValidSupplierStatus(data.status) ? data.status : "ENQUIRY";

    const supplier = await withTenantContext(weddingId, (tx) =>
      tx.supplier.create({
        data: {
          weddingId,
          categoryId: data.categoryId || null,
          name: data.name!.trim(),
          contactName: data.contactName?.trim() || null,
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          website: data.website?.trim() || null,
          notes: data.notes?.trim() || null,
          contractValue: data.contractValue ? Number(data.contractValue) : null,
          status,
        },
        include: { category: true },
      })
    );

    return NextResponse.json(supplier, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

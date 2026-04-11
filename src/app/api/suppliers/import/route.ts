import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { parseSupplierCsv } from "@/lib/supplier-csv";
import { handleDbError } from "@/lib/db-error";
import { invalidateCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

type DupAction = "skip" | "update" | "create";

// POST with { csv: string } → returns preview
// POST with { csv: string, confirm: true, duplicateActions: Record<string, DupAction> } → creates/updates records
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    // Free Tier supplier cap: max 30 suppliers
    const currentSupplierCount = auth.wedding.subscriptionStatus === "FREE"
      ? await prisma.supplier.count({ where: { weddingId } })
      : 0;

    if (auth.wedding.subscriptionStatus === "FREE" && currentSupplierCount >= 30) {
      return NextResponse.json(
        { error: "Free Tier allows a maximum of 30 suppliers. Upgrade to import more." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { csv, confirm, duplicateActions } = body;

    if (typeof csv !== "string") {
      return NextResponse.json({ error: "csv is required" }, { status: 400 });
    }

    const { rows, errors } = parseSupplierCsv(csv);

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    // Fetch existing suppliers and categories for this wedding
    const [existingSuppliers, categories] = await withTenantContext(weddingId, async (tx) =>
      Promise.all([
        tx.supplier.findMany({
          where: { weddingId },
          select: {
            id: true,
            name: true,
            contactName: true,
            email: true,
            phone: true,
            website: true,
            categoryId: true,
            status: true,
            contractValue: true,
            contractSigned: true,
            notes: true,
          },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tx as any).planningCategory.findMany({
          where: { weddingId, isActive: true },
          select: { id: true, name: true },
        }),
      ])
    );

    const existingMap = new Map(
      existingSuppliers.map((s) => [s.name.toLowerCase().trim(), s])
    );

    const categoryMap = new Map<string, string>(
      categories.map((c: { id: string; name: string }) => [c.name.toLowerCase().trim(), c.id])
    );

    const rowsWithStatus = rows.map((row) => {
      const key = row.name.toLowerCase().trim();
      const existingSupplier = existingMap.get(key) ?? null;
      const isDuplicate = !!existingSupplier;
      const categoryId = row.category ? categoryMap.get(row.category.toLowerCase().trim()) : null;
      const categoryWarning = row.category && !categoryId ? `New category: "${row.category}"` : undefined;
      return { ...row, isDuplicate, existingSupplier, categoryId, categoryWarning };
    });

    if (!confirm) {
      return NextResponse.json({ preview: rowsWithStatus });
    }

    // Batch import
    const actions: Record<string, DupAction> = duplicateActions ?? {};

    // Collect unique category names that need to be created
    const categoryNames = new Set<string>();
    for (const row of rows) {
      if (row.category && !categoryMap.has(row.category.toLowerCase().trim())) {
        categoryNames.add(row.category.trim());
      }
    }

    // Create missing categories
    let categoriesCreated = 0;
    if (confirm && categoryNames.size > 0) {
      // Get max sortOrder for new categories
      const maxSortResult = await withTenantContext(weddingId, async (tx) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tx as any).planningCategory.aggregate({
          where: { weddingId },
          _max: { sortOrder: true },
        })
      );
      let nextSortOrder = (maxSortResult as { _max: { sortOrder: number | null } })._max.sortOrder ?? 0;

      for (const name of categoryNames) {
        await withTenantContext(weddingId, async (tx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (tx as any).planningCategory.create({
            data: {
              weddingId,
              name,
              colour: "#6366f1",
              sortOrder: nextSortOrder,
              isActive: true,
            },
          });
        });
        nextSortOrder++;
        categoriesCreated++;
      }
      await invalidateCache(`${weddingId}:planning-categories`);

      // Refresh category map after creating new ones
      const newCategories = await withTenantContext(weddingId, async (tx) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tx as any).planningCategory.findMany({
          where: { weddingId, isActive: true },
          select: { id: true, name: true },
        })
      );
      for (const c of newCategories) {
        categoryMap.set(c.name.toLowerCase().trim(), c.id);
      }
      // Update rowsWithStatus with new category IDs
      for (const row of rowsWithStatus) {
        if (row.category) {
          row.categoryId = categoryMap.get(row.category.toLowerCase().trim()) ?? null;
          row.categoryWarning = undefined; // Clear warning since category now exists
        }
      }
    }

    const toCreate: Array<{
      name: string;
      contactName: string | null;
      email: string | null;
      phone: string | null;
      website: string | null;
      categoryId: string | null;
      status: string;
      contractValue: number | null;
      contractSigned: boolean;
      notes: string | null;
    }> = [];

    const toUpdate: Array<{
      id: string;
      data: Record<string, unknown>;
    }> = [];

    let skipped = 0;
    let importErrors = 0;

    for (const row of rowsWithStatus) {
      if (row._error) {
        importErrors++;
        continue;
      }

      const action: DupAction = row.isDuplicate
        ? (actions[String(row._line)] ?? "skip")
        : "create";

      if (action === "skip") {
        skipped++;
        continue;
      }

      const supplierData = {
        name: row.name,
        contactName: row.contactName ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        website: row.website ?? null,
        categoryId: row.categoryId ?? null as string | null,
        status: row.status,
        contractValue: row.contractValue ?? null,
        contractSigned: row.contractSigned,
        notes: row.notes ?? null,
      };

      if (action === "create") {
        toCreate.push(supplierData);
      } else if (action === "update") {
        const key = row.name.toLowerCase().trim();
        const existing = existingMap.get(key);
        if (existing) {
          toUpdate.push({
            id: existing.id,
            data: {
              ...supplierData,
              // Preserve existing category if not specified in CSV
              categoryId: row.categoryId ?? existing.categoryId,
            },
          });
        } else {
          skipped++;
        }
      }
    }

    // Free Tier cap check: block import if it would exceed 30 suppliers
    if (auth.wedding.subscriptionStatus === "FREE" && currentSupplierCount + toCreate.length > 30) {
      return NextResponse.json(
        { error: `Free Tier allows a maximum of 30 suppliers. You have ${currentSupplierCount} suppliers and this import would add ${toCreate.length} more. Upgrade to add unlimited suppliers.` },
        { status: 403 }
      );
    }

    // Execute batched operations
    const result = await withTenantContext(weddingId, async (tx) => {
      let created = 0;
      if (toCreate.length > 0) {
        const createResult = await tx.supplier.createMany({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: toCreate.map((s) => ({ ...s, weddingId })) as any,
        });
        created = createResult.count;
      }

      let updated = 0;
      if (toUpdate.length > 0) {
        const updateResults = await Promise.all(
          toUpdate.map((u) =>
            tx.supplier.update({
              where: { id: u.id, weddingId },
              data: u.data,
            })
          )
        );
        updated = updateResults.length;
      }

      return { created, updated };
    });

    return NextResponse.json({
      created: result.created,
      updated: result.updated,
      skipped,
      errors: importErrors,
      categoriesCreated,
    });
  } catch (error) {
    return handleDbError(error);
  }
}
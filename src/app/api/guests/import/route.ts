import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrRsvpManager } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { parseGuestCsv } from "@/lib/csv";

import { handleDbError } from "@/lib/db-error";

type DupAction = "skip" | "update" | "create";

// POST with { csv: string } → returns preview
// POST with { csv: string, confirm: true, duplicateActions: Record<string, DupAction> } → creates/updates records
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdminOrRsvpManager(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const { csv, confirm, duplicateActions } = body;

    if (typeof csv !== "string") {
        return NextResponse.json({ error: "csv is required" }, { status: 400 });
    }

    const { rows, errors } = parseGuestCsv(csv);

    if (errors.length > 0) {
        return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    // Duplicate detection against existing DB records (scoped to this wedding)
    const existingGuests = await withTenantContext(weddingId, (tx) =>
      tx.guest.findMany({
          where: { weddingId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            groupName: true,
            isChild: true,
            rsvpStatus: true,
            invitedToCeremony: true,
            invitedToReception: true,
            invitedToAfterparty: true,
            notes: true,
          },
      })
    );

    const existingMap = new Map(
        existingGuests.map((g) => [
          `${g.firstName.toLowerCase()}|${g.lastName.toLowerCase()}`,
          g,
        ])
    );

    const rowsWithStatus = rows.map((row) => {
        const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`;
        const existingGuest = existingMap.get(key) ?? null;
        const isDuplicate = !!existingGuest;
        return { ...row, isDuplicate, existingGuest };
    });

    if (!confirm) {
        return NextResponse.json({ preview: rowsWithStatus });
    }

    // Batch import: collect all operations and execute in minimal transactions
    const actions: Record<string, DupAction> = duplicateActions ?? {};

    // Separate rows by action type
    const toCreate: Array<{
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      groupName: string | null;
      isChild: boolean;
      invitedToCeremony: boolean;
      invitedToReception: boolean;
      invitedToAfterparty: boolean;
      notes: string | null;
    }> = [];

    const toUpdate: Array<{
      id: string;
      data: {
        email?: string;
        phone?: string;
        groupName?: string;
        isChild: boolean;
        invitedToCeremony: boolean;
        invitedToReception: boolean;
        invitedToAfterparty: boolean;
        notes?: string;
      };
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

        const guestData = {
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email ?? null,
          phone: row.phone ?? null,
          groupName: row.groupName ?? null,
          isChild: row.isChild,
          invitedToCeremony: row.invitedToCeremony,
          invitedToReception: row.invitedToReception,
          invitedToAfterparty: row.invitedToAfterparty,
          notes: row.notes ?? null,
        };

        if (action === "create") {
          toCreate.push(guestData);
        } else if (action === "update") {
          const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`;
          const existing = existingMap.get(key);
          if (existing) {
            toUpdate.push({
              id: existing.id,
              data: {
                ...(row.email ? { email: row.email } : {}),
                ...(row.phone ? { phone: row.phone } : {}),
                ...(row.groupName ? { groupName: row.groupName } : {}),
                isChild: row.isChild,
                invitedToCeremony: row.invitedToCeremony,
                invitedToReception: row.invitedToReception,
                invitedToAfterparty: row.invitedToAfterparty,
                ...(row.notes ? { notes: row.notes } : {}),
              },
            });
          } else {
            skipped++;
          }
        }
    }

    // Execute batched operations in a single transaction
    const result = await withTenantContext(weddingId, async (tx) => {
      // Batch create all new guests
      let created = 0;
      if (toCreate.length > 0) {
        const createResult = await tx.guest.createMany({
          data: toCreate.map((g) => ({ ...g, weddingId })),
        });
        created = createResult.count;
      }

      // Batch update all existing guests
      let updated = 0;
      if (toUpdate.length > 0) {
        const updateResults = await Promise.all(
          toUpdate.map((u) =>
            tx.guest.update({
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
    });

  } catch (error) {
    return handleDbError(error);
  }

}

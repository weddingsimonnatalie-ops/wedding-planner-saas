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

    // Import with per-row duplicate handling
    const actions: Record<string, DupAction> = duplicateActions ?? {};
    let created = 0;
    let updated = 0;
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
          await withTenantContext(weddingId, (tx) =>
            tx.guest.create({ data: { ...guestData, weddingId } })
          );
          created++;
        } else if (action === "update") {
          const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`;
          const existing = existingMap.get(key);
          if (existing) {
            // Only overwrite fields that are non-empty in the CSV
            await withTenantContext(weddingId, (tx) =>
              tx.guest.update({
                where: { id: existing.id, weddingId },
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
              })
            );
            updated++;
          } else {
            skipped++;
          }
        }
    }

    return NextResponse.json({ created, updated, skipped, errors: importErrors });

  } catch (error) {
    return handleDbError(error);
  }

}

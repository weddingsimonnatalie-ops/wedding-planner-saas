export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { SeatingClient } from "@/components/seating/SeatingClient";
import { requireServerContext } from "@/lib/server-context";
import { withTenantContext } from "@/lib/tenant";

const GUEST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  groupName: true,
  rsvpStatus: true,
  mealChoice: true,
  invitedToCeremony: true,
  invitedToReception: true,
  invitedToAfterparty: true,
  attendingReception: true,
  seatNumber: true,
} as const;

export default async function SeatingPage() {
  const ctx = await requireServerContext();
  const { weddingId, role } = ctx;

  // Ensure a default room exists
  let room = await withTenantContext(weddingId, (tx) =>
    tx.room.findFirst({
      where: { weddingId },
      include: {
        elements: true,
        tables: { include: { guests: { select: GUEST_SELECT } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    })
  );

  if (!room) {
    room = await prisma.room.create({
      data: { weddingId, name: "Main Reception", widthMetres: 20, heightMetres: 15 },
      include: {
        elements: true,
        tables: { include: { guests: { select: GUEST_SELECT } }, orderBy: { createdAt: "asc" } },
      },
    });
  }

  const [unassignedGuests, mealOptions] = await withTenantContext(weddingId, (tx) =>
    Promise.all([
      tx.guest.findMany({
        where: {
          weddingId,
          tableId: null,
          invitedToReception: true,
          NOT: {
            AND: [
              { attendingReception: false },
              { rsvpStatus: { notIn: ["ACCEPTED", "PARTIAL"] } },
            ],
          },
        },
        select: GUEST_SELECT,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      tx.mealOption.findMany({
        where: { weddingId, isActive: true },
        select: { id: true, name: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ])
  );

  return (
    <div className="h-full flex flex-col">
      <SeatingClient
        initialRoom={room as any}
        initialTables={room.tables as any}
        initialUnassigned={unassignedGuests}
        mealOptions={mealOptions}
        role={role}
      />
    </div>
  );
}

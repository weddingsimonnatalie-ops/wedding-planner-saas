export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guests/GuestForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { can } from "@/lib/permissions";
import { requireServerContext } from "@/lib/server-context";
import { withTenantContext } from "@/lib/tenant";

export default async function EditGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireServerContext();
  const { weddingId, role } = ctx;

  const [guest, groups, mealOptions, mealChoices] = await withTenantContext(weddingId, (tx) =>
    Promise.all([
      tx.guest.findUnique({ where: { id, weddingId } }),
      tx.guest.findMany({
        select: { groupName: true },
        distinct: ["groupName"],
        where: { weddingId, groupName: { not: null } },
        orderBy: { groupName: "asc" },
      }).then((rows) => rows.map((r) => r.groupName!)),
      tx.mealOption.findMany({
        where: { weddingId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      tx.guestMealChoice.findMany({
        where: { guestId: id },
        select: { eventId: true, mealOptionId: true },
      }),
    ])
  );

  if (!guest) notFound();

  // Load table + its guests for seat occupancy if guest is assigned
  const tableWithGuests = guest.tableId
    ? await withTenantContext(weddingId, (tx) =>
        tx.table.findUnique({
          where: { id: guest.tableId!, weddingId },
          select: {
            id: true,
            name: true,
            capacity: true,
            guests: { select: { id: true, firstName: true, lastName: true, seatNumber: true } },
          },
        })
      )
    : null;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/guests" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">
          {guest.firstName} {guest.lastName}
        </h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <GuestForm
          guest={guest as any}
          groups={groups}
          mealOptions={mealOptions}
          mealChoices={mealChoices}
          tableWithGuests={tableWithGuests as any}
          readOnly={!can.editGuests(role)}
        />
      </div>
    </div>
  );
}

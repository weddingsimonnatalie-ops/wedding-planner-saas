export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guests/GuestForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";

export default async function EditGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [guest, groups, mealOptions] = await Promise.all([
    prisma.guest.findUnique({ where: { id } }),
    prisma.guest.findMany({
      select: { groupName: true },
      distinct: ["groupName"],
      where: { groupName: { not: null } },
      orderBy: { groupName: "asc" },
    }).then((rows) => rows.map((r) => r.groupName!)),
    prisma.mealOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!guest) notFound();

  // Load table + its guests for seat occupancy if guest is assigned
  const tableWithGuests = guest.tableId
    ? await prisma.table.findUnique({
        where: { id: guest.tableId },
        select: {
          id: true,
          name: true,
          capacity: true,
          guests: { select: { id: true, firstName: true, lastName: true, seatNumber: true } },
        },
      })
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
          tableWithGuests={tableWithGuests as any}
          readOnly={!can.editGuests(session?.user?.role ?? "VIEWER")}
        />
      </div>
    </div>
  );
}

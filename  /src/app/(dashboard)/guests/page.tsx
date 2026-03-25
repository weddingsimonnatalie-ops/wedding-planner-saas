export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { RsvpStatus } from "@prisma/client";
import { GuestList } from "@/components/guests/GuestList";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    group?: string;
    tableAssigned?: string;
    tableId?: string;
    event?: string;
    meal?: string;
    dietary?: string;
  }>;
}

export default async function GuestsPage({ searchParams }: PageProps) {
  const { search, status, group, tableAssigned, tableId, event, meal, dietary } = await searchParams;

  const overrideStatuses = { in: ["ACCEPTED", "PARTIAL"] };
  const eventFilter: Record<string, unknown> =
    event === "invited_ceremony"   ? { invitedToCeremony: true }
    : event === "invited_reception"  ? { invitedToReception: true }
    : event === "invited_afterparty" ? { invitedToAfterparty: true }
    : event === "attending_ceremony"  ? { invitedToCeremony: true,  OR: [{ attendingCeremony: true },  { attendingCeremony: null,  rsvpStatus: overrideStatuses }] }
    : event === "attending_reception" ? { invitedToReception: true, OR: [{ attendingReception: true }, { attendingReception: null, rsvpStatus: overrideStatuses }] }
    : event === "attending_afterparty"? { invitedToAfterparty: true,OR: [{ attendingAfterparty: true },{ attendingAfterparty: null,rsvpStatus: overrideStatuses }] }
    : event === "not_attending_ceremony"   ? { invitedToCeremony: true,  attendingCeremony: false }
    : event === "not_attending_reception"  ? { invitedToReception: true, attendingReception: false }
    : event === "not_attending_afterparty" ? { invitedToAfterparty: true,attendingAfterparty: false }
    : {};

  const [guests, mealOptions, tables] = await Promise.all([
    prisma.guest.findMany({
      where: {
        ...(status && status !== "ALL" ? { rsvpStatus: status as RsvpStatus } : {}),
        ...(group === "none" ? { OR: [{ groupName: null }, { groupName: "" }] } : group ? { groupName: group } : {}),
        ...(tableId ? { tableId } : tableAssigned === "yes" ? { tableId: { not: null } } : tableAssigned === "no" ? { tableId: null } : {}),
        ...eventFilter,
        ...(meal === "none" ? { mealChoice: null } : meal ? { mealChoice: meal } : {}),
        ...(dietary === "has_notes" ? { dietaryNotes: { not: null }, NOT: { dietaryNotes: "" } } : dietary === "no_notes" ? { OR: [{ dietaryNotes: null }, { dietaryNotes: "" }] } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { table: { select: { id: true, name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.mealOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.table.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Total counts (always unfiltered)
  const allGuests = await prisma.guest.findMany({
    select: { rsvpStatus: true, tableId: true },
  });

  const totalGuests = allGuests.length;
  const stats = {
    total: totalGuests,
    accepted: allGuests.filter((g) => g.rsvpStatus === "ACCEPTED").length,
    partial: allGuests.filter((g) => g.rsvpStatus === "PARTIAL").length,
    declined: allGuests.filter((g) => g.rsvpStatus === "DECLINED").length,
    pending: allGuests.filter((g) => g.rsvpStatus === "PENDING").length,
    maybe: allGuests.filter((g) => g.rsvpStatus === "MAYBE").length,
    unassigned: allGuests.filter((g) => !g.tableId).length,
  };

  // When any filter is active, derive stats from the filtered guest list
  const hasFilters = !!(search || status || group || tableAssigned || tableId || event || meal || dietary);
  const displayStats = hasFilters ? {
    total: guests.length,
    accepted: guests.filter((g) => g.rsvpStatus === "ACCEPTED").length,
    partial: guests.filter((g) => g.rsvpStatus === "PARTIAL").length,
    declined: guests.filter((g) => g.rsvpStatus === "DECLINED").length,
    pending: guests.filter((g) => g.rsvpStatus === "PENDING").length,
    maybe: guests.filter((g) => g.rsvpStatus === "MAYBE").length,
    unassigned: guests.filter((g) => !g.tableId).length,
  } : stats;

  // Distinct groups for filter dropdown
  const groupRows = await prisma.guest.findMany({
    select: { groupName: true },
    distinct: ["groupName"],
    where: { groupName: { not: null } },
    orderBy: { groupName: "asc" },
  });
  const groups = groupRows.map((r) => r.groupName!).filter(Boolean);

  return (
    <GuestList
      guests={guests as any}
      groups={groups}
      mealOptions={mealOptions}
      tables={tables}
      totalGuests={totalGuests}
      stats={displayStats}
      hasFilters={hasFilters}
      currentFilters={{ search, status, group, tableAssigned, tableId, event, meal, dietary }}
    />
  );
}

export const dynamic = "force-dynamic";

import { requireServerContext } from "@/lib/server-context";
import { withTenantContext } from "@/lib/tenant";
import { PrintDesigner } from "@/components/seating/PrintDesigner";

export default async function PrintDesignerPage() {
  const ctx = await requireServerContext(["ADMIN"]);
  const { weddingId } = ctx;

  const [wedding, tables, mealOptions] = await withTenantContext(weddingId, (tx) =>
    Promise.all([
      tx.wedding.findUnique({
        where: { id: weddingId },
        select: { coupleName: true, weddingDate: true, venueName: true },
      }),
      tx.table.findMany({
        where: { weddingId },
        include: {
          guests: {
            where: { weddingId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              seatNumber: true,
              mealChoice: true,
              dietaryNotes: true,
            },
            orderBy: [{ seatNumber: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
          },
        },
        orderBy: { name: "asc" },
      }),
      tx.mealOption.findMany({ where: { weddingId }, select: { id: true, name: true } }),
    ])
  );

  const mealMap = Object.fromEntries(mealOptions.map((m) => [m.id, m.name]));

  const tablesWithMealNames = tables.map((t) => ({
    id: t.id,
    name: t.name,
    capacity: t.capacity,
    guests: t.guests.map((g) => ({
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      seatNumber: g.seatNumber,
      mealChoice: g.mealChoice ? (mealMap[g.mealChoice] ?? g.mealChoice) : null,
      dietaryNotes: g.dietaryNotes,
    })),
  }));

  return (
    <div className="p-6 h-full">
      <h1 className="text-2xl font-semibold mb-4">Print Seating Chart</h1>
      <PrintDesigner
        weddingConfig={
          wedding
            ? {
                coupleName: wedding.coupleName,
                weddingDate: wedding.weddingDate,
                venueName: wedding.venueName,
              }
            : null
        }
        tables={tablesWithMealNames}
      />
    </div>
  );
}

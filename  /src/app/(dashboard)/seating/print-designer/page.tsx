export const dynamic = "force-dynamic";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PrintDesigner } from "@/components/seating/PrintDesigner";

export default async function PrintDesignerPage() {
  const session = await getSession();
  if (!can.editSeating(session?.user?.role ?? "VIEWER")) redirect("/");

  const [weddingConfig, tables, mealOptions] = await Promise.all([
    prisma.weddingConfig.findFirst(),
    prisma.table.findMany({
      include: {
        guests: {
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
    prisma.mealOption.findMany({ select: { id: true, name: true } }),
  ]);

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
          weddingConfig
            ? {
                coupleName: weddingConfig.coupleName,
                weddingDate: weddingConfig.weddingDate,
                venueName: weddingConfig.venueName,
              }
            : null
        }
        tables={tablesWithMealNames}
      />
    </div>
  );
}
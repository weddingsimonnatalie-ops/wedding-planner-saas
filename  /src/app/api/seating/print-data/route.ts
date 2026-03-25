export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
          where: { guests: { some: {} } },
          orderBy: { name: "asc" },
        }),
        prisma.mealOption.findMany({ select: { id: true, name: true } }),
    ]);

    const mealMap = Object.fromEntries(mealOptions.map((m) => [m.id, m.name]));

    return apiJson({
        weddingConfig: weddingConfig
          ? {
              coupleName: weddingConfig.coupleName,
              weddingDate: weddingConfig.weddingDate,
              venueName: weddingConfig.venueName,
            }
          : null,
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          capacity: t.capacity,
          guests: t.guests.map((g) => ({
            id: g.id,
            firstName: g.firstName,
            lastName: g.lastName,
            seatNumber: g.seatNumber,
            mealChoice: g.mealChoice,
            mealChoiceName: g.mealChoice ? (mealMap[g.mealChoice] ?? g.mealChoice) : null,
            dietaryNotes: g.dietaryNotes,
          })),
        })),
    });

  } catch (error) {
    return handleDbError(error);
  }

}

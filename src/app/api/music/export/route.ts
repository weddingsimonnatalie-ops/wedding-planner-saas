export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { tracksToCsv } from "@/lib/music-csv";

// GET /api/music/export - Export all playlists with tracks as CSV
export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  const playlists = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findMany({
      where: { weddingId },
      include: {
        tracks: {
          select: {
            title: true,
            artist: true,
            durationSec: true,
            url: true,
            notes: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    })
  );

  const csv = tracksToCsv(playlists);
  const date = new Date().toISOString().split("T")[0];

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="music-${date}.csv"`,
    },
  });
}
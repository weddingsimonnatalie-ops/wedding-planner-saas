export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";

// PUT /api/tracks/reorder - Batch reorder tracks within a playlist
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  const body = await req.json();
  const { playlistId, trackIds } = body as { playlistId: string; trackIds: string[] };

  if (!playlistId || !Array.isArray(trackIds)) {
    return NextResponse.json({ error: "playlistId and trackIds are required" }, { status: 400 });
  }

  // Verify playlist belongs to user's wedding
  const playlist = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findFirst({
      where: { id: playlistId, weddingId },
      select: { id: true },
    })
  );

  if (!playlist) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  // Update sortOrder for each track
  await withTenantContext(weddingId, async (tx) => {
    const updates = trackIds.map((trackId, index) =>
      tx.track.update({
        where: { id: trackId },
        data: { sortOrder: index },
      })
    );
    await Promise.all(updates);
  });

  return apiJson({ success: true });
}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";

// POST /api/playlists/[id]/tracks - Add track to playlist
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;
  const { id: playlistId } = await params;

  const body = await req.json();
  const { title, artist, durationSec, url, notes } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
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

  // Get the next sort order
  const existing = await withTenantContext(weddingId, async (tx) =>
    tx.track.findMany({
      where: { playlistId },
      select: { sortOrder: true },
      orderBy: { sortOrder: "desc" },
      take: 1,
    })
  );
  const nextSortOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

  const track = await withTenantContext(weddingId, async (tx) =>
    tx.track.create({
      data: {
        playlistId,
        title: title.trim(),
        artist: artist?.trim() || null,
        durationSec: durationSec ? parseInt(durationSec) : null,
        url: url?.trim() || null,
        notes: notes?.trim() || null,
        albumArt: body.albumArt?.trim() || null,
        deezerUrl: body.deezerUrl?.trim() || null,
        sortOrder: nextSortOrder,
      },
    })
  );

  return apiJson({ track });
}
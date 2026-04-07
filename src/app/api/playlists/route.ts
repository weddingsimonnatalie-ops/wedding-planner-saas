export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";

// GET /api/playlists - List all playlists for the wedding
export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  const playlists = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findMany({
      where: { weddingId },
      include: {
        _count: { select: { tracks: true } },
      },
      orderBy: { sortOrder: "asc" },
    })
  );

  return apiJson({ playlists });
}

// POST /api/playlists - Create a new playlist
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  const body = await req.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get the next sort order
  const existing = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findMany({
      where: { weddingId },
      select: { sortOrder: true },
      orderBy: { sortOrder: "desc" },
      take: 1,
    })
  );
  const nextSortOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

  const playlist = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.create({
      data: {
        weddingId,
        name: name.trim(),
        description: description?.trim() || null,
        sortOrder: nextSortOrder,
      },
      include: {
        _count: { select: { tracks: true } },
      },
    })
  );

  return apiJson({ playlist });
}
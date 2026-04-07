export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";

// GET /api/playlists/[id] - Get single playlist with tracks
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;
  const { id } = await params;

  const playlist = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findFirst({
      where: { id, weddingId },
      include: {
        tracks: {
          orderBy: { sortOrder: "asc" },
        },
      },
    })
  );

  if (!playlist) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  return apiJson({ playlist });
}

// PUT /api/playlists/[id] - Update playlist
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;
  const { id } = await params;

  const body = await req.json();
  const { name, description, sortOrder } = body;

  // Verify ownership
  const existing = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findFirst({
      where: { id, weddingId },
      select: { id: true },
    })
  );

  if (!existing) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  const updateData: { name?: string; description?: string | null; sortOrder?: number } = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  const playlist = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { tracks: true } },
      },
    })
  );

  return apiJson({ playlist });
}

// DELETE /api/playlists/[id] - Delete playlist
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;
  const { id } = await params;

  // Verify ownership
  const existing = await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findFirst({
      where: { id, weddingId },
      select: { id: true },
    })
  );

  if (!existing) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  await withTenantContext(weddingId, async (tx) =>
    tx.playlist.delete({ where: { id } })
  );

  return apiJson({ success: true });
}
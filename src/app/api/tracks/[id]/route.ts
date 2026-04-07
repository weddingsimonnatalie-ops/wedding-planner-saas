export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";

// PUT /api/tracks/[id] - Update track
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;
  const { id } = await params;

  const body = await req.json();
  const { title, artist, durationSec, url, notes, sortOrder } = body;

  // Verify track belongs to user's wedding
  const existing = await withTenantContext(weddingId, async (tx) =>
    tx.track.findFirst({
      where: { id, playlist: { weddingId } },
      select: { id: true },
    })
  );

  if (!existing) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const updateData: {
    title?: string;
    artist?: string | null;
    durationSec?: number | null;
    url?: string | null;
    notes?: string | null;
    sortOrder?: number;
  } = {};

  if (title !== undefined) updateData.title = title.trim();
  if (artist !== undefined) updateData.artist = artist?.trim() || null;
  if (durationSec !== undefined) updateData.durationSec = durationSec ? parseInt(durationSec) : null;
  if (url !== undefined) updateData.url = url?.trim() || null;
  if (notes !== undefined) updateData.notes = notes?.trim() || null;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  const track = await withTenantContext(weddingId, async (tx) =>
    tx.track.update({
      where: { id },
      data: updateData,
    })
  );

  return apiJson({ track });
}

// DELETE /api/tracks/[id] - Delete track
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;
  const { id } = await params;

  // Verify track belongs to user's wedding
  const existing = await withTenantContext(weddingId, async (tx) =>
    tx.track.findFirst({
      where: { id, playlist: { weddingId } },
      select: { id: true },
    })
  );

  if (!existing) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  await withTenantContext(weddingId, async (tx) =>
    tx.track.delete({ where: { id } })
  );

  return apiJson({ success: true });
}
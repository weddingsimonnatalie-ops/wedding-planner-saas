export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { parseMusicCsv, CsvTrackRow } from "@/lib/music-csv";

interface ExistingPlaylist {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  tracks: {
    id: string;
    title: string;
    artist: string | null;
  }[];
}

interface PreviewRow extends CsvTrackRow {
  _line: number;
  _error?: string;
  _status: "new" | "duplicate_playlist" | "duplicate_track";
  _existingPlaylist?: ExistingPlaylist;
  _existingTrackId?: string;
}

type PlaylistAction = "skip" | "update" | "create";
type TrackAction = "skip" | "update" | "add";

// POST /api/music/import - Import playlists and tracks from CSV
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const { weddingId } = auth;

  const body = await req.json();
  const { csv, confirm, playlistActions, trackActions } = body as {
    csv: string;
    confirm?: boolean;
    playlistActions?: Record<string, PlaylistAction>;
    trackActions?: Record<string, TrackAction>;
  };

  if (!csv) {
    return NextResponse.json({ error: "CSV content is required" }, { status: 400 });
  }

  // Parse CSV
  const { rows, errors } = parseMusicCsv(csv);

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No tracks found in CSV" }, { status: 400 });
  }

  // Get existing playlists with tracks for duplicate detection
  const existingPlaylists = (await withTenantContext(weddingId, async (tx) =>
    tx.playlist.findMany({
      where: { weddingId },
      include: {
        tracks: {
          select: {
            id: true,
            title: true,
            artist: true,
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    })
  )) as ExistingPlaylist[];

  // Build lookup maps
  const playlistMap = new Map<string, ExistingPlaylist>();
  for (const p of existingPlaylists) {
    playlistMap.set(p.name.toLowerCase().trim(), p);
  }

  // Analyze rows for duplicates
  const previewRows: PreviewRow[] = rows.map((row) => {
    const playlistKey = row.playlistName.toLowerCase().trim();
    const existingPlaylist = playlistMap.get(playlistKey) ?? null;

    // Check for track duplicate within playlist
    let existingTrackId: string | undefined;
    if (existingPlaylist && row.trackTitle) {
      const track = existingPlaylist.tracks.find(
        (t) =>
          t.title.toLowerCase() === row.trackTitle.toLowerCase() &&
          (row.artist ? t.artist?.toLowerCase() === row.artist.toLowerCase() : true)
      );
      if (track) {
        existingTrackId = track.id;
      }
    }

    const status = existingPlaylist
      ? existingTrackId
        ? "duplicate_track"
        : "duplicate_playlist"
      : "new";

    return {
      ...row,
      _line: row._line,
      _error: row._error,
      _status: status,
      _existingPlaylist: existingPlaylist ?? undefined,
      _existingTrackId: existingTrackId,
    };
  });

  // Preview phase - return analysis without making changes
  if (!confirm) {
    return NextResponse.json({ preview: previewRows, existingPlaylists });
  }

  // Confirm phase - process import with user actions
  const finalPlaylistActions = playlistActions ?? {};
  const finalTrackActions = trackActions ?? {};

  // Group rows by playlist
  const rowsByPlaylist = new Map<string, PreviewRow[]>();
  for (const row of previewRows) {
    const key = row.playlistName.toLowerCase().trim();
    if (!rowsByPlaylist.has(key)) {
      rowsByPlaylist.set(key, []);
    }
    rowsByPlaylist.get(key)!.push(row);
  }

  const result = await withTenantContext(weddingId, async (tx) => {
    let playlistsCreated = 0;
    let playlistsUpdated = 0;
    let tracksCreated = 0;
    let tracksUpdated = 0;
    let tracksSkipped = 0;
    const errors: string[] = [];

    // Get max sort order for new playlists
    const maxSortOrder = await tx.playlist.aggregate({
      where: { weddingId },
      _max: { sortOrder: true },
    });
    let nextPlaylistSort = maxSortOrder._max.sortOrder ?? -1;

    // Process each playlist group
    for (const [playlistKey, playlistRows] of rowsByPlaylist) {
      const existingPlaylist = playlistMap.get(playlistKey);
      const action = finalPlaylistActions[playlistKey] ?? "update";

      // Skip playlist if action is skip
      if (existingPlaylist && action === "skip") {
        tracksSkipped += playlistRows.length;
        continue;
      }

      // Determine playlist ID and whether to create
      let playlistId: string;
      let targetPlaylistName = playlistRows[0].playlistName;

      if (existingPlaylist && action === "create") {
        // Create new playlist with suffix
        let suffix = 2;
        let newName = `${targetPlaylistName} (${suffix})`;
        while (playlistMap.has(newName.toLowerCase().trim())) {
          suffix++;
          newName = `${targetPlaylistName} (${suffix})`;
        }
        nextPlaylistSort++;
        const newPlaylist = await tx.playlist.create({
          data: {
            weddingId,
            name: newName,
            description: playlistRows[0].playlistDescription,
            sortOrder: nextPlaylistSort,
          },
        });
        playlistId = newPlaylist.id;
        playlistsCreated++;
      } else if (existingPlaylist) {
        // Update existing playlist
        playlistId = existingPlaylist.id;
        // Update description if provided and different
        if (playlistRows[0].playlistDescription && playlistRows[0].playlistDescription !== existingPlaylist.description) {
          await tx.playlist.update({
            where: { id: playlistId },
            data: { description: playlistRows[0].playlistDescription },
          });
        }
        playlistsUpdated++;
      } else {
        // Create new playlist
        nextPlaylistSort++;
        const newPlaylist = await tx.playlist.create({
          data: {
            weddingId,
            name: targetPlaylistName,
            description: playlistRows[0].playlistDescription,
            sortOrder: nextPlaylistSort,
          },
        });
        playlistId = newPlaylist.id;
        playlistsCreated++;
      }

      // Get max track sort order for this playlist
      const maxTrackSort = await tx.track.aggregate({
        where: { playlistId },
        _max: { sortOrder: true },
      });
      let nextTrackSort = maxTrackSort._max.sortOrder ?? -1;

      // Process tracks
      for (const row of playlistRows) {
        const trackKey = `${playlistKey}:${row.trackTitle}:${row.artist ?? ""}`.toLowerCase();
        const trackAction = finalTrackActions[trackKey] ?? "add";

        // Find existing track if updating existing playlist
        const existingTrack = existingPlaylist?.tracks.find(
          (t) =>
            t.title.toLowerCase() === row.trackTitle.toLowerCase() &&
            (row.artist ? t.artist?.toLowerCase() === row.artist.toLowerCase() : !t.artist)
        );

        if (existingTrack) {
          if (trackAction === "skip") {
            tracksSkipped++;
            continue;
          } else if (trackAction === "update") {
            // Update existing track
            await tx.track.update({
              where: { id: existingTrack.id },
              data: {
                artist: row.artist ?? null,
                durationSec: row.durationSec ?? null,
                url: row.url ?? null,
                notes: row.notes ?? null,
                isrc: row.isrc ?? null,
              },
            });
            tracksUpdated++;
            continue;
          }
          // "add" falls through to create new
        }

        // Create new track
        nextTrackSort++;
        await tx.track.create({
          data: {
            playlistId,
            title: row.trackTitle,
            artist: row.artist ?? null,
            durationSec: row.durationSec ?? null,
            url: row.url ?? null,
            notes: row.notes ?? null,
            isrc: row.isrc ?? null,
            sortOrder: nextTrackSort,
          },
        });
        tracksCreated++;
      }
    }

    return {
      playlistsCreated,
      playlistsUpdated,
      tracksCreated,
      tracksUpdated,
      tracksSkipped,
      errors,
    };
  });

  return NextResponse.json(result);
}
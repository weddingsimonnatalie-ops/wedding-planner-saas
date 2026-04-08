export interface CsvTrackRow {
  playlistName: string;
  playlistDescription?: string;
  trackTitle: string;
  artist?: string;
  durationSec?: number;
  url?: string;
  notes?: string;
  isrc?: string;
}

export interface CsvParseResult {
  rows: (CsvTrackRow & { _error?: string; _line: number })[];
  errors: string[];
}

// ISRC format: 2 letters + 3 letters/digits + 2 digits + 5 digits (e.g., USWB11200587)
const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;

function validateIsrc(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const cleaned = val.trim().toUpperCase();
  if (!ISRC_REGEX.test(cleaned)) {
    return undefined; // Invalid format, ignore
  }
  return cleaned;
}

/** Parse duration string - accepts "200", "3:20", "03:20" */
function parseDuration(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();

  // Try MM:SS format
  const match = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }

  // Try seconds as number
  const seconds = parseInt(trimmed);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds;
  }

  return undefined;
}

/** Parse a CSV string. First row must be a header row. */
export function parseMusicCsv(content: string): CsvParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV file has no data rows"] };
  }

  // Parse header - case-insensitive matching with aliases
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => {
    for (const name of names) {
      const idx = header.indexOf(name.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const playlistNameIdx = col(["playlist name", "playlist", "playlistname"]);
  const playlistDescIdx = col(["playlist description", "description", "playlistdescription"]);
  const trackTitleIdx = col(["track title", "track", "title", "tracktitle", "song", "song title"]);
  const artistIdx = col(["artist", "artist name"]);
  const durationIdx = col(["duration (seconds)", "duration", "durationsec", "length", "duration (secs)"]);
  const urlIdx = col(["url", "link", "spotify url", "youtube url"]);
  const notesIdx = col(["notes", "note", "comments"]);
  const isrcIdx = col(["isrc", "isrc code", "recording code"]);

  const rows: CsvParseResult["rows"] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const vals = splitCsvLine(lines[i]);

    const playlistName = vals[playlistNameIdx]?.trim() ?? "";
    const trackTitle = vals[trackTitleIdx]?.trim() ?? "";

    // Playlist name and track title are required
    if (!playlistName || !trackTitle) {
      rows.push({
        playlistName: playlistName || "(missing)",
        trackTitle: trackTitle || "(missing)",
        artist: vals[artistIdx]?.trim() || undefined,
        durationSec: parseDuration(vals[durationIdx]),
        url: vals[urlIdx]?.trim() || undefined,
        notes: vals[notesIdx]?.trim() || undefined,
        isrc: validateIsrc(vals[isrcIdx]),
        _error: !playlistName ? "Playlist name is required" : "Track title is required",
        _line: lineNum,
      });
      continue;
    }

    rows.push({
      playlistName,
      playlistDescription: vals[playlistDescIdx]?.trim() || undefined,
      trackTitle,
      artist: vals[artistIdx]?.trim() || undefined,
      durationSec: parseDuration(vals[durationIdx]),
      url: vals[urlIdx]?.trim() || undefined,
      notes: vals[notesIdx]?.trim() || undefined,
      isrc: validateIsrc(vals[isrcIdx]),
      _line: lineNum,
    });
  }

  return { rows, errors };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export const CSV_TEMPLATE_HEADERS =
  "Playlist Name,Playlist Description,Track Title,Artist,Duration (seconds),URL,Notes,ISRC\n";

export const CSV_TEMPLATE_EXAMPLE =
  "Reception,Dance floor hits,Blinding Lights,The Weeknd,200,https://open.spotify.com/track/xxx,Opening track,USWB11200587\n" +
  "Reception,Dance floor hits,Happy,Pharrell Williams,233,,,\n" +
  "Ceremony,,Canon in D,Pachelbel,360,,,\n";

export function tracksToCsv(
  playlists: {
    name: string;
    description?: string | null;
    sortOrder: number;
    tracks: {
      title: string;
      artist?: string | null;
      durationSec?: number | null;
      url?: string | null;
      notes?: string | null;
      isrc?: string | null;
      sortOrder: number;
    }[];
  }[]
): string {
  const header = "Playlist Name,Playlist Description,Track Title,Artist,Duration (seconds),URL,Notes,ISRC";
  const rows: string[] = [];

  // Sort playlists by sortOrder, then tracks within each playlist
  const sortedPlaylists = [...playlists].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const playlist of sortedPlaylists) {
    const sortedTracks = [...playlist.tracks].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const track of sortedTracks) {
      rows.push(
        [
          playlist.name,
          playlist.description ?? "",
          track.title,
          track.artist ?? "",
          track.durationSec?.toString() ?? "",
          track.url ?? "",
          track.notes ?? "",
          track.isrc ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  return [header, ...rows].join("\n");
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
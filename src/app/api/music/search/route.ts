export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

interface DeezerTrack {
  id: number;
  title: string;
  artist: {
    name: string;
  };
  duration: number;
  album: {
    title: string;
    cover_medium: string;
  };
  preview: string;
  link: string;
}

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  album: string | null;
  albumArt: string | null;
  deezerUrl: string | null;
  preview: string | null;
}

// Ensure URL is HTTPS to avoid mixed content issues
function ensureHttps(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//, "https://");
}

// GET /api/music/search - Search Deezer for tracks
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to search Deezer" }, { status: 500 });
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return NextResponse.json({ results: [] });
    }

    // Map results to our format, ensuring HTTPS URLs
    const results: SearchResult[] = data.data.slice(0, 10).map((track: DeezerTrack) => ({
      id: String(track.id),
      title: track.title,
      artist: track.artist?.name || "Unknown Artist",
      durationSec: track.duration || null,
      album: track.album?.title || null,
      albumArt: ensureHttps(track.album?.cover_medium || null),
      deezerUrl: ensureHttps(track.link || null),
      preview: ensureHttps(track.preview || null),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Deezer search error:", error);
    return NextResponse.json({ error: "Failed to search for tracks" }, { status: 500 });
  }
}
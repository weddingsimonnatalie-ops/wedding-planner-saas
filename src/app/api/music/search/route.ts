export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// TheAudioDB free API key (public test key)
const AUDIO_DB_KEY = "2";

interface AudioDbTrack {
  idTrack: string;
  strTrack: string;
  strArtist: string;
  intDuration: string;
  strAlbum: string | null;
  strGenre: string | null;
  strMusicVid: string | null;
  strTrackThumb: string | null;
}

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  album: string | null;
  genre: string | null;
  youtubeUrl: string | null;
  thumbnail: string | null;
}

// GET /api/music/search - Search TheAudioDB for tracks
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist");
  const track = searchParams.get("track");

  if (!artist || !track) {
    return NextResponse.json({ error: "artist and track parameters required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://theaudiodb.com/api/v1/json/${AUDIO_DB_KEY}/searchtrack.php?s=${encodeURIComponent(artist)}&t=${encodeURIComponent(track)}`
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to search TheAudioDB" }, { status: 500 });
    }

    const data = await response.json();

    if (!data.track || !Array.isArray(data.track)) {
      return NextResponse.json({ results: [] });
    }

    // Map results to our format
    const results: SearchResult[] = data.track.map((t: AudioDbTrack) => ({
      id: t.idTrack,
      title: t.strTrack,
      artist: t.strArtist,
      durationSec: t.intDuration ? Math.floor(parseInt(t.intDuration) / 1000) : null,
      album: t.strAlbum,
      genre: t.strGenre,
      youtubeUrl: t.strMusicVid,
      thumbnail: t.strTrackThumb,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("TheAudioDB search error:", error);
    return NextResponse.json({ error: "Failed to search for tracks" }, { status: 500 });
  }
}
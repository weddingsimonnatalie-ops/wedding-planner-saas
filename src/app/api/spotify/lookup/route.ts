export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// Spotify Client Credentials flow - get access token
async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.access_token;
}

// Extract Spotify track ID from URL
function extractTrackId(url: string): string | null {
  // Support various Spotify URL formats:
  // https://open.spotify.com/track/1234567890abcdef
  // https://play.spotify.com/track/1234567890abcdef
  // spotify:track:1234567890abcdef
  const patterns = [
    /spotify\.com\/track\/([a-zA-Z0-9]+)/,
    /spotify:track:([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// GET /api/spotify/lookup - Look up track metadata from Spotify URL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL parameter required" }, { status: 400 });
  }

  const trackId = extractTrackId(url);
  if (!trackId) {
    return NextResponse.json({ error: "Invalid Spotify URL" }, { status: 400 });
  }

  const token = await getSpotifyToken();
  if (!token) {
    return NextResponse.json({ error: "Spotify not configured" }, { status: 503 });
  }

  try {
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Track not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to fetch from Spotify" }, { status: 500 });
    }

    const track = await response.json();

    return NextResponse.json({
      title: track.name,
      artist: track.artists?.map((a: { name: string }) => a.name).join(", ") || null,
      durationSec: Math.floor(track.duration_ms / 1000),
      album: track.album?.name || null,
      albumArt: track.album?.images?.[0]?.url || null,
    });
  } catch (error) {
    console.error("Spotify API error:", error);
    return NextResponse.json({ error: "Failed to fetch track" }, { status: 500 });
  }
}
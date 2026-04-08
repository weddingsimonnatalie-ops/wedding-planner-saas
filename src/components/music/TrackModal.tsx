"use client";

import { useState, useEffect } from "react";
import { X, Search, Loader2, Music } from "lucide-react";
import { fetchApi } from "@/lib/fetch";

interface Track {
  id?: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  url: string | null;
  notes: string | null;
  albumArt?: string | null;
  deezerUrl?: string | null;
  isrc?: string | null;
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
  isrc: string | null;
}

interface Props {
  playlistId: string;
  track?: Track | null;
  onClose: () => void;
  onSubmit: (data: Track) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+):(\d{2})$/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  const seconds = parseInt(input);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds;
  }
  return null;
}

export function TrackModal({ playlistId, track, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState(track?.title ?? "");
  const [artist, setArtist] = useState(track?.artist ?? "");
  const [durationInput, setDurationInput] = useState(
    track?.durationSec ? formatDuration(track.durationSec) : ""
  );
  const [url, setUrl] = useState(track?.url ?? "");
  const [notes, setNotes] = useState(track?.notes ?? "");
  const [albumArt, setAlbumArt] = useState(track?.albumArt ?? null);
  const [isrc, setIsrc] = useState(track?.isrc ?? null);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function handleSearch() {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchError("Please enter at least 2 characters");
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await fetchApi(`/api/music/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (data.error) {
        setSearchError(data.error);
      } else if (data.results.length === 0) {
        setSearchError("No results found. Try a different search.");
      } else {
        setSearchResults(data.results);
      }
    } catch {
      setSearchError("Failed to search. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  function handleSelectResult(result: SearchResult) {
    setTitle(result.title);
    setArtist(result.artist);
    if (result.durationSec) {
      setDurationInput(formatDuration(result.durationSec));
    }
    if (result.deezerUrl) {
      setUrl(result.deezerUrl);
    }
    if (result.albumArt) {
      setAlbumArt(result.albumArt);
    }
    if (result.isrc) {
      setIsrc(result.isrc);
    }
    setSearchResults([]);
    setSearchQuery("");
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    const durationSec = durationInput ? parseDuration(durationInput) : null;

    onSubmit({
      id: track?.id,
      title: title.trim(),
      artist: artist.trim() || null,
      durationSec,
      url: url.trim() || null,
      notes: notes.trim() || null,
      albumArt,
      isrc,
    });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Bottom sheet (mobile) / centred modal (desktop) */}
      <div
        className="relative w-full md:max-w-lg md:mx-4 bg-white rounded-t-2xl md:rounded-xl shadow-xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {track ? "Edit track" : "Add track"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          {/* Search section */}
          {!track && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Search for a song
              </h3>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Song or artist name..."
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching || searchQuery.trim().length < 2}
                  className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Search by song title, artist, or both
              </p>

              {/* Search results */}
              {searchError && (
                <p className="text-sm text-red-600 mt-2">{searchError}</p>
              )}

              {searchResults.length > 0 && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handleSelectResult(result)}
                      className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      {result.albumArt ? (
                        <img
                          src={result.albumArt}
                          alt=""
                          className="w-12 h-12 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Music className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{result.title}</p>
                        <p className="text-sm text-gray-500 truncate">
                          {result.artist}
                          {result.durationSec && ` · ${formatDuration(result.durationSec)}`}
                          {result.album && ` · ${result.album}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual entry form */}
          <form id="track-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Song title"
                autoFocus={!!track}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Artist
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Artist name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration
              </label>
              <input
                type="text"
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="3:45"
              />
              <p className="text-xs text-gray-400 mt-1">Format: MM:SS</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="YouTube or other link (optional)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Notes for the DJ (optional)"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 flex justify-end gap-3 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="track-form"
            disabled={!title.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {track ? "Save changes" : "Add track"}
          </button>
        </div>
      </div>
    </div>
  );
}
"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface Track {
  id?: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  url: string | null;
  notes: string | null;
}

interface Props {
  playlistId: string;
  track?: Track | null;
  onClose: () => void;
  onSubmit: (data: Track) => void;
}

export function TrackModal({ playlistId, track, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState(track?.title ?? "");
  const [artist, setArtist] = useState(track?.artist ?? "");
  const [durationInput, setDurationInput] = useState(
    track?.durationSec ? formatDuration(track.durationSec) : ""
  );
  const [url, setUrl] = useState(track?.url ?? "");
  const [notes, setNotes] = useState(track?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

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
    // Try parsing as just seconds
    const seconds = parseInt(input);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds;
    }
    return null;
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
        className="relative w-full md:max-w-lg md:mx-4 bg-white rounded-t-2xl md:rounded-xl shadow-xl flex flex-col h-[calc(100svh-env(safe-area-inset-top,0px))] md:h-auto md:max-h-[calc(100vh-4rem)]"
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
          <form id="track-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
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
                autoFocus
              />
            </div>

            {/* Artist */}
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

            {/* Duration */}
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

            {/* URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="YouTube, Spotify, or Apple Music link (optional)"
              />
            </div>

            {/* Notes */}
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

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </form>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t border-gray-200 flex justify-end gap-3 px-5 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
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
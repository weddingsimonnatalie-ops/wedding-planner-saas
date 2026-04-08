"use client";

import { useState } from "react";
import { X, Upload, CheckCircle, AlertCircle, AlertTriangle, Download } from "lucide-react";
import { CSV_TEMPLATE_HEADERS, CSV_TEMPLATE_EXAMPLE } from "@/lib/music-csv";

interface PreviewRow {
  _line: number;
  playlistName: string;
  playlistDescription?: string;
  trackTitle: string;
  artist?: string;
  durationSec?: number;
  url?: string;
  notes?: string;
  _error?: string;
  _status: "new" | "duplicate_playlist" | "duplicate_track";
}

interface ImportResult {
  playlistsCreated: number;
  playlistsUpdated: number;
  tracksCreated: number;
  tracksUpdated: number;
  tracksSkipped: number;
  errors: string[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const csvTemplateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE_HEADERS + CSV_TEMPLATE_EXAMPLE)}`;

export function MusicCsvImportModal({ onClose, onImported }: Props) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFile(file: File) {
    setError("");
    setPreview(null);
    setResult(null);
    setCsvText(null);
    setLoading(true);

    const csv = await file.text();

    try {
      const res = await fetch("/api/music/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Parse error");
        setLoading(false);
        return;
      }
      setPreview(data.preview);
      setCsvText(csv);
    } catch {
      setError("Failed to parse CSV");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!csvText) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/music/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        setLoading(false);
        return;
      }
      setResult(data);
    } catch {
      setError("Import failed");
    } finally {
      setLoading(false);
    }
  }

  const newRows = preview?.filter((r) => r._status === "new" && !r._error) ?? [];
  const duplicateRows = preview?.filter((r) => (r._status === "duplicate_playlist" || r._status === "duplicate_track") && !r._error) ?? [];
  const errorRows = preview?.filter((r) => r._error) ?? [];

  const trackCount = newRows.length + duplicateRows.length;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Import Music from CSV</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {!preview && !result && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Upload a CSV with columns: <strong>Playlist Name, Track Title</strong> (required), and optionally
                Playlist Description, Artist, Duration (seconds or MM:SS), URL, Notes.
              </p>
              <div className="flex gap-2 mb-4">
                <a
                  href={csvTemplateHref}
                  download="music-import-template.csv"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download template
                </a>
              </div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-10 cursor-pointer hover:border-primary transition-colors">
                <Upload className="w-8 h-8 text-gray-300 mb-2" />
                <span className="text-sm text-gray-500">Click to choose a CSV file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFile(e.target.files[0]);
                  }}
                />
              </label>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              {loading && <p className="mt-3 text-sm text-gray-400 text-center">Parsing…</p>}
            </div>
          )}

          {preview && !result && (
            <div className="space-y-5">
              {/* Category counts */}
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  {newRows.length} new track{newRows.length !== 1 ? "s" : ""}
                </span>
                {duplicateRows.length > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    {duplicateRows.length} duplicate{duplicateRows.length !== 1 ? "s" : ""} — existing tracks
                  </span>
                )}
                {errorRows.length > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    {errorRows.length} error{errorRows.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Group by playlist */}
              {newRows.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    New Tracks ({newRows.length})
                  </h3>
                  <div className="border border-green-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Playlist</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Track</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Artist</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {newRows.map((row) => (
                          <tr key={row._line}>
                            <td className="px-3 py-2">{row.playlistName}</td>
                            <td className="px-3 py-2 font-medium">{row.trackTitle}</td>
                            <td className="px-3 py-2 text-gray-500">{row.artist ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500">
                              {row.durationSec ? `${Math.floor(row.durationSec / 60)}:${(row.durationSec % 60).toString().padStart(2, "0")}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Duplicates */}
              {duplicateRows.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Duplicates — will be added to existing playlists ({duplicateRows.length})
                  </h3>
                  <div className="border border-amber-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Playlist</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Track</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Artist</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {duplicateRows.map((row) => (
                          <tr key={row._line} className="bg-amber-50/50">
                            <td className="px-3 py-2">{row.playlistName}</td>
                            <td className="px-3 py-2 font-medium">{row.trackTitle}</td>
                            <td className="px-3 py-2 text-gray-500">{row.artist ?? "—"}</td>
                            <td className="px-3 py-2">
                              <span className="text-amber-600">
                                {row._status === "duplicate_track" ? "Track exists" : "New to playlist"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Errors */}
              {errorRows.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Errors — will be skipped ({errorRows.length})
                  </h3>
                  <div className="border border-red-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Row</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Playlist</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Track</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {errorRows.map((row) => (
                          <tr key={row._line} className="bg-red-50/50">
                            <td className="px-3 py-2 text-gray-400">{row._line}</td>
                            <td className="px-3 py-2">{row.playlistName}</td>
                            <td className="px-3 py-2">{row.trackTitle}</td>
                            <td className="px-3 py-2 text-red-600">{row._error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {result && (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-900">Import complete</p>
              <div className="mt-3 space-y-1 text-sm text-gray-600">
                {result.playlistsCreated > 0 && (
                  <p className="text-green-600">
                    Created {result.playlistsCreated} new playlist{result.playlistsCreated !== 1 ? "s" : ""}
                  </p>
                )}
                {result.tracksCreated > 0 && (
                  <p className="text-green-600">
                    Added {result.tracksCreated} track{result.tracksCreated !== 1 ? "s" : ""}
                  </p>
                )}
                {result.tracksUpdated > 0 && (
                  <p className="text-amber-600">
                    Updated {result.tracksUpdated} track{result.tracksUpdated !== 1 ? "s" : ""}
                  </p>
                )}
                {result.tracksSkipped > 0 && (
                  <p className="text-gray-500">
                    Skipped {result.tracksSkipped} duplicate{result.tracksSkipped !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
          {!result ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {preview && trackCount > 0 && (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {loading ? "Importing…" : `Import ${trackCount} track${trackCount !== 1 ? "s" : ""}`}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onImported}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { X, Upload, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";

type DupAction = "skip" | "update" | "create";

interface ExistingSupplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  categoryId: string | null;
  status: string;
  contractValue: number | null;
  contractSigned: boolean;
  notes: string | null;
}

interface PreviewRow {
  _line: number;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  category?: string;
  status: string;
  contractValue?: number;
  contractSigned: boolean;
  notes?: string;
  isDuplicate: boolean;
  existingSupplier: ExistingSupplier | null;
  categoryId?: string | null;
  categoryWarning?: string;
  _error?: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  ENQUIRY: "Enquiry",
  QUOTED: "Quoted",
  BOOKED: "Booked",
  CANCELLED: "Cancelled",
  COMPLETE: "Complete",
};

function formatCurrency(val: number | undefined | null): string {
  if (val == null) return "—";
  return "£" + val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CsvImportModal({ onClose, onImported }: Props) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dupActions, setDupActions] = useState<Record<number, DupAction>>({});

  async function handleFile(file: File) {
    setError("");
    setPreview(null);
    setResult(null);
    setDupActions({});
    setCsvText(null);
    setLoading(true);

    const csv = await file.text();

    try {
      const res = await fetch("/api/suppliers/import", {
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
      // Initialise all duplicates to "skip"
      const initial: Record<number, DupAction> = {};
      for (const row of data.preview as PreviewRow[]) {
        if (row.isDuplicate && !row._error) initial[row._line] = "skip";
      }
      setDupActions(initial);
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
      const res = await fetch("/api/suppliers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, confirm: true, duplicateActions: dupActions }),
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

  function setAllDupActions(action: DupAction) {
    if (!preview) return;
    const next: Record<number, DupAction> = { ...dupActions };
    for (const row of preview) {
      if (row.isDuplicate && !row._error) next[row._line] = action;
    }
    setDupActions(next);
  }

  const newRows = preview?.filter((r) => !r._error && !r.isDuplicate) ?? [];
  const errorRows = preview?.filter((r) => r._error) ?? [];
  const dupRows = preview?.filter((r) => r.isDuplicate && !r._error) ?? [];

  const actionableCount = newRows.length + dupRows.filter((r) => dupActions[r._line] !== "skip").length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 pb-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85dvh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Import Suppliers from CSV</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {!preview && !result && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Upload a CSV with columns: <strong>Name</strong> (required), and optionally
                Contact Name, Email, Phone, Website, Category, Status (Enquiry/Quoted/Booked/Cancelled/Complete),
                Contract Value, Contract Signed (y/n), Notes.
              </p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-10 cursor-pointer hover:border-primary transition-colors">
                <Upload className="w-8 h-8 text-gray-300 mb-2" />
                <span className="text-sm text-gray-500">Click to choose a CSV file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
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
                  {newRows.length} new supplier{newRows.length !== 1 ? "s" : ""} — will be created
                </span>
                {dupRows.length > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    {dupRows.length} duplicate{dupRows.length !== 1 ? "s" : ""} — already exist
                  </span>
                )}
                {errorRows.length > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    {errorRows.length} error{errorRows.length !== 1 ? "s" : ""} — missing required fields
                  </span>
                )}
              </div>

              {/* New suppliers */}
              {newRows.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    New Suppliers ({newRows.length})
                  </h3>
                  <div className="border border-green-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Contact</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Category</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {newRows.map((row) => (
                          <tr key={row._line}>
                            <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                            <td className="px-3 py-2 text-gray-500">{row.contactName ?? "—"}</td>
                            <td className="px-3 py-2">
                              {row.category ? (
                                <span className={row.categoryWarning ? "text-amber-600" : "text-gray-500"}>
                                  {row.category}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                {STATUS_LABELS[row.status] ?? row.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{formatCurrency(row.contractValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Duplicates */}
              {dupRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Duplicates ({dupRows.length})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAllDupActions("skip")}
                        className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        Skip all duplicates
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllDupActions("update")}
                        className="px-2.5 py-1 text-xs border border-amber-300 text-amber-700 rounded hover:bg-amber-50 transition-colors"
                      >
                        Update all duplicates
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {dupRows.map((row) => (
                      <div key={row._line} className="border border-amber-200 rounded-lg overflow-hidden">
                        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-amber-200">
                          {/* Incoming CSV */}
                          <div className="p-3 bg-amber-50">
                            <p className="text-xs font-semibold text-amber-700 mb-1.5">CSV (incoming)</p>
                            <p className="text-sm font-medium text-gray-900">{row.name}</p>
                            {row.contactName && <p className="text-xs text-gray-500">{row.contactName}</p>}
                            {row.email && <p className="text-xs text-gray-500">{row.email}</p>}
                            {row.phone && <p className="text-xs text-gray-500">{row.phone}</p>}
                            {row.category && <p className="text-xs text-gray-500">Category: {row.category}</p>}
                            <p className="text-xs text-gray-500 mt-1">
                              Status: {STATUS_LABELS[row.status] ?? row.status}
                            </p>
                            <p className="text-xs text-gray-500">Value: {formatCurrency(row.contractValue)}</p>
                            {row.notes && <p className="text-xs text-gray-400 mt-1 italic">{row.notes}</p>}
                          </div>
                          {/* Existing DB record */}
                          <div className="p-3 bg-white">
                            <p className="text-xs font-semibold text-gray-500 mb-1.5">Existing record</p>
                            {row.existingSupplier && (
                              <>
                                <p className="text-sm font-medium text-gray-900">{row.existingSupplier.name}</p>
                                {row.existingSupplier.contactName && <p className="text-xs text-gray-500">{row.existingSupplier.contactName}</p>}
                                {row.existingSupplier.email && <p className="text-xs text-gray-500">{row.existingSupplier.email}</p>}
                                {row.existingSupplier.phone && <p className="text-xs text-gray-500">{row.existingSupplier.phone}</p>}
                                <p className="text-xs text-gray-500 mt-1">
                                  Status: {STATUS_LABELS[row.existingSupplier.status] ?? row.existingSupplier.status}
                                </p>
                                <p className="text-xs text-gray-500">Value: {formatCurrency(row.existingSupplier.contractValue)}</p>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Action selector */}
                        <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border-t border-amber-200">
                          <span className="text-xs text-gray-500 mr-1">Action:</span>
                          {(["skip", "update", "create"] as DupAction[]).map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => setDupActions((prev) => ({ ...prev, [row._line]: action }))}
                              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                                dupActions[row._line] === action
                                  ? action === "skip"
                                    ? "bg-gray-200 text-gray-700 font-medium"
                                    : action === "update"
                                    ? "bg-amber-500 text-white font-medium"
                                    : "bg-blue-500 text-white font-medium"
                                  : "border border-gray-200 text-gray-500 hover:bg-gray-100"
                              }`}
                            >
                              {action === "skip" ? "Skip" : action === "update" ? "Update existing" : "Import as new"}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
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
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {errorRows.map((row) => (
                          <tr key={row._line} className="bg-red-50/50">
                            <td className="px-3 py-2 text-gray-400">{row._line}</td>
                            <td className="px-3 py-2">{row.name || "—"}</td>
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
                {result.created > 0 && (
                  <p className="text-green-600">Created: {result.created} new supplier{result.created !== 1 ? "s" : ""}</p>
                )}
                {result.updated > 0 && (
                  <p className="text-amber-600">Updated: {result.updated} existing supplier{result.updated !== 1 ? "s" : ""}</p>
                )}
                {result.skipped > 0 && (
                  <p className="text-gray-500">Skipped: {result.skipped} duplicate{result.skipped !== 1 ? "s" : ""}</p>
                )}
                {result.errors > 0 && (
                  <p className="text-red-600">Errors: {result.errors} row{result.errors !== 1 ? "s" : ""} with missing required fields</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200">
          {!result ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {preview && actionableCount > 0 && (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {loading ? "Importing…" : `Import ${actionableCount} supplier${actionableCount !== 1 ? "s" : ""}`}
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
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, Upload, Camera, FileText, Trash2 } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function PaymentModal({ onClose, onCreated }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Receipt upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // ── Track dirty state for inactivity warning ───────────────────────────────
  const isDirty = useMemo(() => {
    return (
      supplierId !== "" ||
      label !== "" ||
      amount !== "" ||
      dueDate !== "" ||
      notes !== "" ||
      selectedFile !== null
    );
  }, [supplierId, label, amount, dueDate, notes, selectedFile]);

  useFormDirtyRegistration("payment-modal", "New Payment", isDirty);

  useEffect(() => {
    fetchApi("/api/suppliers")
      .then(r => r.json())
      .then((data: Supplier[]) => {
        setSuppliers(data);
        if (data.length > 0) setSupplierId(data[0].id);
      })
      .catch(() => {});
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Handle file selection
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Allowed: PDF, JPG, PNG");
      return;
    }

    // Validate file size (20 MB)
    if (file.size > 20 * 1024 * 1024) {
      setError("File too large. Maximum size: 20 MB");
      return;
    }

    setError("");
    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

  // Clear selected file
  function clearFile() {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // Upload receipt after payment creation
  async function uploadReceipt(paymentId: string): Promise<boolean> {
    if (!selectedFile) return true;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`/api/payments/${paymentId}/receipt`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        console.error("Receipt upload failed:", data.error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Receipt upload error:", err);
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) { setError("Please select a supplier"); return; }
    if (!label.trim()) { setError("Label is required"); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    setError("");
    setSaving(true);

    const res = await fetch(`/api/suppliers/${supplierId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        amount: Number(amount),
        dueDate: dueDate || null,
        notes: notes.trim() || null,
      }),
    });

    if (res.ok) {
      const payment = await res.json();

      // Upload receipt if selected
      if (selectedFile) {
        const uploadOk = await uploadReceipt(payment.id);
        if (!uploadOk) {
          // Payment created but receipt failed - still close modal
          console.warn("Payment created but receipt upload failed");
        }
      }

      onCreated();
    } else {
      setSaving(false);
      const data = await res.json();
      setError(data.error ?? "Failed to create payment");
    }
  }

  // Format file size
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier <span className="text-red-500">*</span>
            </label>
            {suppliers.length > 5 && (
              <input
                type="text"
                placeholder="Search suppliers…"
                className={`${inputCls} mb-1`}
                onChange={e => {
                  const filter = e.target.value.toLowerCase();
                  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(filter));
                  // Keep the dropdown showing all options but filter visually
                }}
              />
            )}
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className={inputCls}
              required
            >
              <option value="">— Select supplier —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label <span className="text-red-500">*</span>
            </label>
            <input
              required
              autoFocus
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Deposit, Final payment"
              className={inputCls}
            />
          </div>

          {/* Amount + Due date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (£) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes…"
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Receipt upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Receipt <span className="text-gray-400 font-normal">(optional)</span>
            </label>

            {!selectedFile ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Choose file
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute("capture", "environment");
                      fileInputRef.current.click();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Take photo with camera"
                >
                  <Camera className="w-4 h-4" />
                  Take photo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    className="w-16 h-16 object-cover rounded"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center">
                    <FileText className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{formatSize(selectedFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG (max 20 MB)</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving ? "Creating…" : uploading ? "Uploading receipt…" : "Create payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
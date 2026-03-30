"use client";

import { useState, useRef } from "react";
import { X, Upload, Camera, FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useWedding, getUploadBlockReason } from "@/context/WeddingContext";

interface PaymentInfo {
  id: string;
  label: string;
  supplier: { id: string; name: string };
}

interface Props {
  payment: PaymentInfo;
  onClose: () => void;
  onUploaded: () => void;
}

export function ReceiptUploadModal({ payment, onClose, onUploaded }: Props) {
  const { subscriptionStatus, role } = useWedding();
  const canUpload = subscriptionStatus === "ACTIVE" || subscriptionStatus === "PAST_DUE";
  const uploadBlockReason = getUploadBlockReason(subscriptionStatus);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Allowed: PDF, JPG, PNG");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("File too large. Maximum size: 20 MB");
      return;
    }

    setError("");
    setSelectedFile(file);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

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

  async function handleUpload() {
    if (!selectedFile) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`/api/payments/${payment.id}/receipt`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        onUploaded();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to upload receipt");
        setUploading(false);
      }
    } catch {
      setError("Failed to upload receipt");
      setUploading(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 pb-4 overflow-y-auto"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Upload receipt</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {payment.supplier.name} — {payment.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {!canUpload ? (
            <>
              <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                {uploadBlockReason}.{" "}
                {role === "ADMIN" && (
                  <Link href="/billing" className="text-primary hover:underline">
                    Upgrade now →
                  </Link>
                )}
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
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

              <p className="text-xs text-gray-400">PDF, JPG, or PNG (max 20 MB)</p>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
"use client";

import { X, Download, FileText } from "lucide-react";

interface Props {
  payment: {
    id: string;
    label: string;
    supplier: { id: string; name: string };
    receipt: {
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      uploadedAt: string;
    } | null;
  };
  onClose: () => void;
}

export function ReceiptViewModal({ payment, onClose }: Props) {
  const { receipt } = payment;

  // Receipt should always exist when this modal is rendered
  if (!receipt) return null;

  const isImage = receipt.mimeType.startsWith("image/");
  const isPdf = receipt.mimeType === "application/pdf";
  const receiptUrl = `/api/payments/${payment.id}/receipt`;

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function handleDownload() {
    window.open(receiptUrl, "_blank");
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 pb-4 overflow-y-auto"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Receipt</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {payment.supplier.name} — {payment.label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              {isPdf ? "Open PDF" : "Download"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {isImage ? (
            <div className="rounded-lg overflow-hidden bg-gray-100">
              <img
                src={receiptUrl}
                alt="Receipt"
                className="w-full h-auto max-h-[70vh] object-contain"
              />
            </div>
          ) : isPdf ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">{receipt.filename}</p>
              <p className="text-xs text-gray-500 mt-1">{formatSize(receipt.sizeBytes)}</p>
              <button
                type="button"
                onClick={handleDownload}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Open PDF
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">{receipt.filename}</p>
              <p className="text-xs text-gray-500 mt-1">{formatSize(receipt.sizeBytes)}</p>
              <button
                type="button"
                onClick={handleDownload}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Download file
              </button>
            </div>
          )}

          {/* File info */}
          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <span>{receipt.filename}</span>
            <span>{formatSize(receipt.sizeBytes)}</span>
            <span>Uploaded {formatDate(receipt.uploadedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
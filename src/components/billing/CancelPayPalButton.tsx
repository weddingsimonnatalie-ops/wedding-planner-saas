"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";

export function CancelPayPalButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleCancel() {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/billing/paypal-cancel", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "Failed to cancel subscription");
        setLoading(false);
        return;
      }

      // Refresh to show cancelled status
      router.refresh();
    } catch {
      alert("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (showConfirm) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Are you sure you want to cancel your subscription? Your access will end at the current billing period.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Keep subscription
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                Cancel subscription
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
    >
      <XCircle className="w-4 h-4" />
      Cancel PayPal subscription
    </button>
  );
}
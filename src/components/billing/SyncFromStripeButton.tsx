"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncFromStripeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to sync with Stripe");
      }

      const data = await res.json();

      if (data.skipped) {
        setMessage(data.skipped);
      } else if (data.changed) {
        setMessage("Subscription data updated");
      } else {
        setMessage("Already in sync");
      }

      // Refresh the page to show updated data
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4">
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Syncing..." : "Refresh from Stripe"}
      </button>
      {message && (
        <p className="mt-2 text-sm text-gray-500">{message}</p>
      )}
    </div>
  );
}
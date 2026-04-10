"use client";

import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export function SyncFromProviderButton({ provider }: { provider: "stripe" }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "unchanged" | "error">();
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSync() {
    if (loading) return;
    setLoading(true);
    setResult(undefined);
    setErrorMsg("");

    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setResult("error");
        setErrorMsg(data.error ?? "Sync failed");
        return;
      }

      setResult(data.changed ? "success" : "unchanged");
    } catch {
      setResult("error");
      setErrorMsg("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (result === "success") {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 mb-4">
        <CheckCircle2 className="w-4 h-4" />
        Subscription synced with Stripe
      </div>
    );
  }

  if (result === "unchanged") {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <CheckCircle2 className="w-4 h-4" />
        Already in sync with Stripe
      </div>
    );
  }

  if (result === "error") {
    return (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          {errorMsg}
        </div>
        <button
          type="button"
          onClick={() => {
            setResult(undefined);
            setErrorMsg("");
          }}
          className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={loading}
      className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <RefreshCw className="w-4 h-4" />
      )}
      {loading ? "Syncing…" : "Sync with Stripe"}
    </button>
  );
}
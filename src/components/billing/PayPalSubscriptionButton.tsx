"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle, RefreshCw, Loader2, Wallet } from "lucide-react";

interface Props {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "PAUSED";
  paypalSubscriptionId: string | null;
}

export function PayPalSubscriptionButton({ status, paypalSubscriptionId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // No subscription ID — need to set up new subscription
  if (!paypalSubscriptionId) {
    return (
      <button
        type="button"
        onClick={() => {
          // This will trigger the ActivateTrialButton flow which handles PayPal checkout
          // The parent should show ActivateTrialButton when hasSubscription is false
        }}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
      >
        <Wallet className="w-4 h-4" />
        Set up PayPal payment
      </button>
    );
  }

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

      router.refresh();
    } catch {
      alert("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleReactivate() {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/billing/paypal-reactivate", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        if (data.needsNewSubscription) {
          // Subscription was explicitly cancelled — can't reactivate
          alert("This subscription cannot be reactivated. Please set up a new subscription.");
        } else {
          alert(data.error ?? "Failed to reactivate subscription");
        }
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      alert("Network error. Please try again.");
      setLoading(false);
    }
  }

  // Cancelled — show reactivate option
  if (status === "CANCELLED") {
    if (showConfirm) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Would you like to reactivate your PayPal subscription? Your data will be restored.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReactivate}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reactivating…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Reactivate subscription
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <div>
            <p className="font-medium">Subscription cancelled</p>
            <p className="text-red-700 mt-1">
              Your data will be retained for 90 days. You can reactivate your subscription during this time.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reactivate subscription
        </button>
      </div>
    );
  }

  // Past due / Suspended — show reactivate
  if (status === "PAST_DUE") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-medium">Payment overdue</p>
            <p className="text-amber-700 mt-1">
              Your PayPal payment failed. Update your payment method at PayPal, then reactivate.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReactivate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Reactivating…
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Reactivate subscription
            </>
          )}
        </button>
      </div>
    );
  }

  // Active / Trialing — show cancel option
  if (showConfirm) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Are you sure you want to cancel your subscription? Your data will be retained for 90 days.
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
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, CheckCircle2, AlertCircle, CreditCard, Wallet } from "lucide-react";

type State = "idle" | "loading" | "success" | "error" | "checkout";

interface Props {
  provider: "STRIPE" | "PAYPAL";
  hasSubscription: boolean;
}

export function ActivateTrialButton({ provider, hasSubscription }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // PayPal-specific: if subscription exists, show message (no manual activation)
  if (provider === "PAYPAL" && hasSubscription) {
    return (
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <Wallet className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <span>
          Your PayPal subscription will activate automatically when the trial ends.
          No action needed.
        </span>
      </div>
    );
  }

  // No subscription on record — checkout was never completed.
  // Show a button to create a checkout session.
  if (!hasSubscription) {
    async function handleCheckout() {
      if (state === "checkout") return;
      setState("checkout");
      setErrorMsg("");

      try {
        const endpoint =
          provider === "STRIPE" ? "/api/billing/checkout" : "/api/billing/paypal-checkout";
        const res = await fetch(endpoint, { method: "POST" });
        const data = await res.json();

        if (!res.ok) {
          setState("error");
          setErrorMsg(data.error ?? "Failed to create checkout session");
          return;
        }

        // Redirect to checkout (Stripe or PayPal approval URL)
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        }
      } catch {
        setState("error");
        setErrorMsg("Network error. Please try again.");
      }
    }

    if (state === "error") {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setState("idle");
              setErrorMsg("");
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={handleCheckout}
        disabled={state === "checkout"}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "checkout" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Redirecting to checkout…
          </>
        ) : (
          <>
            {provider === "STRIPE" ? (
              <>
                <CreditCard className="w-4 h-4" />
                Complete billing setup
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4" />
                Set up PayPal payment
              </>
            )}
          </>
        )}
      </button>
    );
  }

  // Has subscription — Stripe only (PayPal already handled above)
  async function handleActivate() {
    if (state === "loading") return;
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/billing/activate", { method: "POST" });
      const data: { ok?: boolean; error?: string; noSubscription?: boolean } =
        await res.json();

      if (!res.ok) {
        setState("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setState("success");
      // Allow time for the invoice.payment_succeeded webhook to update the DB,
      // then refresh the server component so the billing page reflects ACTIVE status.
      setTimeout(() => router.refresh(), 4000);
    } catch {
      setState("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }

  if (state === "success") {
    return (
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-500" />
        <span>
          Payment processing — your subscription is being activated. This page
          will refresh in a moment.
        </span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <span>{errorMsg}</span>
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setState("idle");
              setErrorMsg("");
            }}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Try again
          </button>
          {/* If the error is payment-method related, direct them to the portal */}
          <a
            href="/api/billing/portal"
            className="text-sm text-primary hover:text-primary/80 font-medium underline underline-offset-2"
          >
            Update payment method →
          </a>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleActivate}
      disabled={state === "loading"}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {state === "loading" ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Processing…
        </>
      ) : (
        <>
          <Zap className="w-4 h-4" />
          Activate subscription now
        </>
      )}
    </button>
  );
}
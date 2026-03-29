"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, CheckCircle2, AlertCircle, CreditCard } from "lucide-react";

type State = "idle" | "loading" | "success" | "error" | "checkout";

interface Props {
  /**
   * Whether the wedding has a stripeSubscriptionId on record.
   * False means checkout was never completed — we need to create a checkout session.
   */
  hasSubscription: boolean;
}

export function ActivateTrialButton({ hasSubscription }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // No Stripe subscription on record — checkout was never completed.
  // Show a button to create a checkout session.
  if (!hasSubscription) {
    async function handleCheckout() {
      if (state === "checkout") return;
      setState("checkout");
      setErrorMsg("");

      try {
        const res = await fetch("/api/billing/checkout", { method: "POST" });
        const data = await res.json();

        if (!res.ok) {
          setState("error");
          setErrorMsg(data.error ?? "Failed to create checkout session");
          return;
        }

        // Redirect to Stripe Checkout
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
            <CreditCard className="w-4 h-4" />
            Complete billing setup
          </>
        )}
      </button>
    );
  }

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
            {hasSubscription ? "Update payment method →" : "Complete checkout →"}
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

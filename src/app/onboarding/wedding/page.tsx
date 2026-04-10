"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart, Calendar, Users, Banknote } from "lucide-react";

const CURRENCY_SYMBOLS = [
  { symbol: "£", label: "GBP" },
  { symbol: "$", label: "USD" },
  { symbol: "€", label: "EUR" },
  { symbol: "¥", label: "JPY" },
  { symbol: "₹", label: "INR" },
  { symbol: "Fr", label: "CHF" },
  { symbol: "kr", label: "NOK" },
] as const;

function OnboardingWeddingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [coupleName, setCoupleName] = useState("");
  const [weddingDate, setWeddingDate] = useState("");
  const [currencySymbol, setCurrencySymbol] = useState("£");
  const [customCurrency, setCustomCurrency] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pre-populate from existing wedding config if any
  useEffect(() => {
    fetch("/api/weddings/current")
      .then((r) => r.json())
      .then((data) => {
        if (data.coupleName && data.coupleName !== "Our Wedding") {
          setCoupleName(data.coupleName);
        }
        if (data.weddingDate) {
          setWeddingDate(new Date(data.weddingDate).toISOString().split("T")[0]);
        }
        if (data.currencySymbol) {
          const isCommon = CURRENCY_SYMBOLS.some(c => c.symbol === data.currencySymbol);
          if (isCommon) {
            setCurrencySymbol(data.currencySymbol);
          } else {
            setCurrencySymbol(data.currencySymbol);
            setCustomCurrency(data.currencySymbol);
          }
        }
      })
      .catch(() => {
        // Non-fatal — form just starts empty
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coupleName.trim()) {
      setError("Please enter the couple's names");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/weddings/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleName: coupleName.trim(),
          weddingDate: weddingDate || null,
          currencySymbol: currencySymbol || "£",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save — please try again");
        setLoading(false);
        return;
      }

      router.push("/onboarding/invite");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-primary text-white text-xs font-medium flex items-center justify-center">1</div>
          <div className="w-12 h-0.5 bg-gray-200" />
          <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-xs font-medium flex items-center justify-center">2</div>
          <div className="w-12 h-0.5 bg-gray-200" />
          <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-xs font-medium flex items-center justify-center">3</div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center mb-4">
              <Heart className="w-7 h-7 text-white fill-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Tell us about your wedding</h1>
            <p className="text-sm text-gray-500 mt-1">You can update these details any time in Settings</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Couple&apos;s names <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                value={coupleName}
                onChange={(e) => setCoupleName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="Jane & John"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Wedding date
                </span>
              </label>
              <input
                type="date"
                value={weddingDate}
                onChange={(e) => setWeddingDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5" />
                  Currency symbol
                </span>
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {CURRENCY_SYMBOLS.map(({ symbol, label }) => (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => {
                      setCurrencySymbol(symbol);
                      setCustomCurrency("");
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors focus:outline-none ${
                      currencySymbol === symbol && !customCurrency
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {symbol} <span className="text-xs text-gray-400">{label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={5}
                  placeholder="Custom…"
                  value={customCurrency}
                  onChange={(e) => {
                    setCustomCurrency(e.target.value);
                    if (e.target.value.trim()) setCurrencySymbol(e.target.value.trim());
                  }}
                  className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {customCurrency && (
                  <span className="text-xs text-gray-500">Using &ldquo;{customCurrency}&rdquo;</span>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push("/onboarding/invite")}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Skip for now
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {loading ? "Saving…" : "Save & continue"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingWeddingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100"><div className="text-gray-500">Loading…</div></div>}>
      <OnboardingWeddingContent />
    </Suspense>
  );
}

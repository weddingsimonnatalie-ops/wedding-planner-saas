"use client";

import { useState } from "react";
import { Check } from "lucide-react";

const COMMON_SYMBOLS = [
  { symbol: "£", label: "Pound Sterling (£)" },
  { symbol: "$", label: "Dollar ($)" },
  { symbol: "€", label: "Euro (€)" },
  { symbol: "¥", label: "Yen / Yuan (¥)" },
  { symbol: "₹", label: "Indian Rupee (₹)" },
  { symbol: "₩", label: "Korean Won (₩)" },
  { symbol: "Fr", label: "Swiss Franc (Fr)" },
  { symbol: "kr", label: "Scandinavian Krone (kr)" },
  { symbol: "zł", label: "Polish Złoty (zł)" },
  { symbol: "R$", label: "Brazilian Real (R$)" },
] as const;

interface CurrencySymbolPickerProps {
  initialSymbol: string;
}

export function CurrencySymbolPicker({ initialSymbol }: CurrencySymbolPickerProps) {
  const [active, setActive] = useState(initialSymbol);
  const [custom, setCustom] = useState(
    COMMON_SYMBOLS.some((s) => s.symbol === initialSymbol) ? "" : initialSymbol
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(symbol: string) {
    const trimmed = symbol.trim();
    if (!trimmed) return;
    setActive(trimmed);
    setSaved(false);
    setError("");
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currencySymbol: trimmed }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError("Failed to save. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {COMMON_SYMBOLS.map(({ symbol, label }) => (
          <button
            key={symbol}
            type="button"
            title={label}
            disabled={saving}
            onClick={() => {
              setCustom("");
              save(symbol);
            }}
            className={`min-w-[2.75rem] h-10 px-3 rounded-lg border text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 flex items-center justify-center gap-1 ${
              active === symbol && !custom
                ? "border-primary bg-primary/10 text-primary"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            {active === symbol && !custom && <Check className="w-3 h-3 shrink-0" strokeWidth={3} />}
            {symbol}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          maxLength={5}
          placeholder="Custom…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="w-28 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          disabled={saving || !custom.trim()}
          onClick={() => save(custom)}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-gray-300 disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      <div className="flex items-center gap-3 h-5">
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && <span className="text-xs text-green-600">Currency symbol saved</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <p className="text-xs text-gray-400">
        The symbol is shown throughout the planner next to all monetary amounts.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check } from "lucide-react";

const PALETTE = [
  { hue: 330, label: "Blush Pink" },
  { hue: 350, label: "Rose" },
  { hue: 0,   label: "Coral Red" },
  { hue: 20,  label: "Terracotta" },
  { hue: 40,  label: "Champagne Gold" },
  { hue: 55,  label: "Buttercup" },
  { hue: 130, label: "Sage Green" },
  { hue: 160, label: "Mint" },
  { hue: 200, label: "Dusty Blue" },
  { hue: 240, label: "Periwinkle" },
  { hue: 270, label: "Lavender" },
  { hue: 290, label: "Mauve" },
] as const;

interface ThemeColorPickerProps {
  initialHue: number;
}

export function ThemeColorPicker({ initialHue }: ThemeColorPickerProps) {
  const [activeHue, setActiveHue] = useState(initialHue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function applyHue(hue: number) {
    setActiveHue(hue);
    setSaved(false);
    setError("");

    // Live preview — update CSS variable immediately
    document.documentElement.style.setProperty("--primary", `${hue} 60% 55%`);
    document.documentElement.style.setProperty("--ring", `${hue} 60% 55%`);

    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeHue: hue }),
    });
    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError("Failed to save colour. Please try again.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {PALETTE.map(({ hue, label }) => {
          const bg = `hsl(${hue} 60% 55%)`;
          const isActive = activeHue === hue;
          return (
            <button
              key={hue}
              type="button"
              title={label}
              onClick={() => applyHue(hue)}
              disabled={saving}
              style={{ backgroundColor: bg, ...(isActive ? { boxShadow: `0 0 0 3px white, 0 0 0 5px ${bg}` } : {}) }}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none disabled:opacity-50"
            >
              {isActive && <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 h-5">
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && <span className="text-xs text-green-600">Colour saved</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <p className="text-xs text-gray-400">
        Changes apply immediately — your whole planner updates to the new colour.
      </p>
    </div>
  );
}

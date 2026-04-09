"use client";

import { useState, useRef, useEffect } from "react";
import { LayoutGrid } from "lucide-react";
import { DASHBOARD_PRESETS, type DashboardPresetId } from "./DashboardPresets";

interface LayoutPickerProps {
  currentLayout: DashboardPresetId;
  onLayoutChange: (id: DashboardPresetId) => void;
}

export function LayoutPicker({ currentLayout, onLayoutChange }: LayoutPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(id: DashboardPresetId) {
    const previous = currentLayout;
    onLayoutChange(id);
    setOpen(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboardLayout: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      onLayoutChange(previous); // rollback on failure
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Change dashboard layout"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Dashboard Layout
          </p>
          {DASHBOARD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleSelect(preset.id)}
              className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                currentLayout === preset.id ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${currentLayout === preset.id ? "text-primary" : "text-gray-900"}`}>
                  {preset.name}
                </span>
                {currentLayout === preset.id && (
                  <span className="text-xs text-primary">✓</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
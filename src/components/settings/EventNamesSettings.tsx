"use client";

import { useState } from "react";

interface EventNamesSettingsProps {
  initialConfig: {
    ceremonyEnabled: boolean;
    ceremonyName: string;
    mealEnabled: boolean;
    mealName: string;
    eveningPartyEnabled: boolean;
    eveningPartyName: string;
    rehearsalDinnerEnabled: boolean;
    rehearsalDinnerName: string;
  };
}

export function EventNamesSettings({ initialConfig }: EventNamesSettingsProps) {
  const [events, setEvents] = useState({
    ceremony: { enabled: initialConfig.ceremonyEnabled, name: initialConfig.ceremonyName },
    meal: { enabled: initialConfig.mealEnabled, name: initialConfig.mealName },
    eveningParty: { enabled: initialConfig.eveningPartyEnabled, name: initialConfig.eveningPartyName },
    rehearsalDinner: { enabled: initialConfig.rehearsalDinnerEnabled, name: initialConfig.rehearsalDinnerName },
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Count enabled events for validation
  const enabledCount = Object.values(events).filter((e) => e.enabled).length;

  async function saveField(field: string, value: boolean | string) {
    setSaving(field);
    setSaved(null);
    setError(null);

    const body: Record<string, unknown> = {};
    body[field] = value;

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(null);

    if (res.ok) {
      setSaved(field);
      setTimeout(() => setSaved(null), 2500);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save. Please try again.");
      setTimeout(() => setError(null), 5000);
    }
  }

  function handleToggle(eventKey: keyof typeof events, enabledField: string) {
    const newValue = !events[eventKey].enabled;

    // Prevent disabling the last enabled event
    if (!newValue && enabledCount <= 1) {
      setError("At least one event must be enabled");
      setTimeout(() => setError(null), 3000);
      return;
    }

    updateEvent(eventKey, "enabled", newValue);
    saveField(enabledField, newValue);
  }

  function updateEvent(eventKey: keyof typeof events, field: "enabled" | "name", value: boolean | string) {
    setEvents((prev) => ({
      ...prev,
      [eventKey]: { ...prev[eventKey], [field]: value },
    }));
  }

  const eventRows = [
    {
      key: "rehearsalDinner" as const,
      label: "Rehearsal Dinner",
      enabledField: "rehearsalDinnerEnabled" as const,
      nameField: "rehearsalDinnerName" as const,
      description: "Optional pre-wedding dinner (common in US)",
    },
    {
      key: "ceremony" as const,
      label: "Ceremony",
      enabledField: "ceremonyEnabled" as const,
      nameField: "ceremonyName" as const,
      description: "The main ceremony event",
    },
    {
      key: "meal" as const,
      label: "Meal (Wedding Breakfast)",
      enabledField: "mealEnabled" as const,
      nameField: "mealName" as const,
      description: "The first meal after the ceremony",
    },
    {
      key: "eveningParty" as const,
      label: "Evening Party (Reception)",
      enabledField: "eveningPartyEnabled" as const,
      nameField: "eveningPartyName" as const,
      description: "The evening celebration",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="divide-y divide-gray-100">
        {eventRows.map((row) => (
          <div key={row.key} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium text-gray-900">{row.label}</span>
                  <button
                    type="button"
                    onClick={() => handleToggle(row.key, row.enabledField)}
                    disabled={saving === row.enabledField}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                      events[row.key].enabled
                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                    } disabled:opacity-50`}
                    title={events[row.key].enabled ? "Click to hide" : "Click to show"}
                  >
                    {events[row.key].enabled ? "Shown" : "Hidden"}
                  </button>
                </div>
                <p className="text-xs text-gray-500">{row.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={50}
                  value={events[row.key].name}
                  onChange={(e) => updateEvent(row.key, "name", e.target.value)}
                  onBlur={() => {
                    if (events[row.key].name.trim()) {
                      saveField(row.nameField, events[row.key].name.trim());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  disabled={saving === row.nameField}
                  className="w-48 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  placeholder={row.label}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 h-5">
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && <span className="text-xs text-green-600">Saved</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <p className="text-xs text-gray-400">
        Toggle events on/off to show or hide them on RSVP forms and guest lists. At least one event must be enabled.
        UK weddings typically use &quot;Wedding Breakfast&quot; for the meal and &quot;Evening Reception&quot; for the party.
      </p>
    </div>
  );
}
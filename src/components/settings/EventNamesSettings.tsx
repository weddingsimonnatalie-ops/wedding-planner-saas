"use client";

import { useState } from "react";

interface EventNamesSettingsProps {
  initialConfig: {
    ceremonyEnabled: boolean;
    ceremonyName: string;
    ceremonyLocation?: string | null;
    ceremonyMealsEnabled?: boolean;
    mealEnabled: boolean;
    mealName: string;
    mealLocation?: string | null;
    mealMealsEnabled?: boolean;
    eveningPartyEnabled: boolean;
    eveningPartyName: string;
    eveningPartyLocation?: string | null;
    eveningPartyMealsEnabled?: boolean;
    rehearsalDinnerEnabled: boolean;
    rehearsalDinnerName: string;
    rehearsalDinnerLocation?: string | null;
    rehearsalDinnerMealsEnabled?: boolean;
  };
}

export function EventNamesSettings({ initialConfig }: EventNamesSettingsProps) {
  const [events, setEvents] = useState({
    ceremony: {
      enabled: initialConfig.ceremonyEnabled,
      name: initialConfig.ceremonyName,
      location: initialConfig.ceremonyLocation ?? "",
      mealsEnabled: initialConfig.ceremonyMealsEnabled ?? false,
    },
    meal: {
      enabled: initialConfig.mealEnabled,
      name: initialConfig.mealName,
      location: initialConfig.mealLocation ?? "",
      mealsEnabled: initialConfig.mealMealsEnabled ?? true,
    },
    eveningParty: {
      enabled: initialConfig.eveningPartyEnabled,
      name: initialConfig.eveningPartyName,
      location: initialConfig.eveningPartyLocation ?? "",
      mealsEnabled: initialConfig.eveningPartyMealsEnabled ?? false,
    },
    rehearsalDinner: {
      enabled: initialConfig.rehearsalDinnerEnabled,
      name: initialConfig.rehearsalDinnerName,
      location: initialConfig.rehearsalDinnerLocation ?? "",
      mealsEnabled: initialConfig.rehearsalDinnerMealsEnabled ?? false,
    },
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

  function updateEvent(eventKey: keyof typeof events, field: "enabled" | "name" | "location" | "mealsEnabled", value: boolean | string) {
    setEvents((prev) => ({
      ...prev,
      [eventKey]: { ...prev[eventKey], [field]: value },
    }));
  }

  function handleMealsToggle(eventKey: keyof typeof events, mealsField: string) {
    const newValue = !events[eventKey].mealsEnabled;
    updateEvent(eventKey, "mealsEnabled", newValue);
    saveField(mealsField, newValue);
  }

  const eventRows = [
    {
      key: "rehearsalDinner" as const,
      label: "Rehearsal Dinner",
      enabledField: "rehearsalDinnerEnabled" as const,
      nameField: "rehearsalDinnerName" as const,
      locationField: "rehearsalDinnerLocation" as const,
      mealsField: "rehearsalDinnerMealsEnabled" as const,
      description: "Optional pre-wedding dinner (common in US)",
    },
    {
      key: "ceremony" as const,
      label: "Ceremony",
      enabledField: "ceremonyEnabled" as const,
      nameField: "ceremonyName" as const,
      locationField: "ceremonyLocation" as const,
      mealsField: "ceremonyMealsEnabled" as const,
      description: "The main ceremony event",
    },
    {
      key: "meal" as const,
      label: "Meal (Wedding Breakfast)",
      enabledField: "mealEnabled" as const,
      nameField: "mealName" as const,
      locationField: "mealLocation" as const,
      mealsField: "mealMealsEnabled" as const,
      description: "The first meal after the ceremony",
    },
    {
      key: "eveningParty" as const,
      label: "Evening Party (Reception)",
      enabledField: "eveningPartyEnabled" as const,
      nameField: "eveningPartyName" as const,
      locationField: "eveningPartyLocation" as const,
      mealsField: "eveningPartyMealsEnabled" as const,
      description: "The evening celebration",
    },
  ];

  return (
    <div className="space-y-3">
      {eventRows.map((row) => (
        <div key={row.key} className="p-4 rounded-lg border border-gray-100 bg-gray-50/30">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-medium text-gray-900">{row.label}</span>
            <button
              type="button"
              onClick={() => handleToggle(row.key, row.enabledField)}
              disabled={saving === row.enabledField}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex-shrink-0 ${
                events[row.key].enabled
                  ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                  : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
              } disabled:opacity-50`}
              title={events[row.key].enabled ? "Click to hide" : "Click to show"}
            >
              {events[row.key].enabled ? "Shown" : "Hidden"}
            </button>
            {events[row.key].enabled && (
              <button
                type="button"
                onClick={() => handleMealsToggle(row.key, row.mealsField)}
                disabled={saving === row.mealsField}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex-shrink-0 ${
                  events[row.key].mealsEnabled
                    ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                } disabled:opacity-50`}
                title={events[row.key].mealsEnabled ? "Click to disable meal selection" : "Click to enable meal selection"}
              >
                {events[row.key].mealsEnabled ? "Meals on" : "Meals off"}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">{row.description}</p>
          <div className="space-y-2">
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
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                placeholder="Event name"
              />
              <input
                type="text"
                maxLength={200}
                value={events[row.key].location}
                onChange={(e) => updateEvent(row.key, "location", e.target.value)}
                onBlur={() => saveField(row.locationField, events[row.key].location.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                disabled={saving === row.locationField}
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                placeholder="Location (optional)"
              />
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 h-5">
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && <span className="text-xs text-green-600">Saved</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <p className="text-xs text-gray-400">
        Toggle events on/off to show or hide them on RSVP forms and guest lists. Enable &quot;Meals&quot; to allow guests to select meal options for that event. At least one event must be enabled.
        UK weddings typically use &quot;Wedding Breakfast&quot; for the meal and &quot;Evening Reception&quot; for the party.
      </p>
    </div>
  );
}
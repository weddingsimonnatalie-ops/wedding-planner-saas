"use client";

import { useState } from "react";
import { Globe, Check } from "lucide-react";

// Common timezones grouped by region
const TIMEZONES = [
  { region: "Europe", zones: [
    { value: "Europe/London", label: "London (GMT/BST)" },
    { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
    { value: "Europe/Paris", label: "Paris (CET)" },
    { value: "Europe/Berlin", label: "Berlin (CET)" },
    { value: "Europe/Rome", label: "Rome (CET)" },
    { value: "Europe/Madrid", label: "Madrid (CET)" },
    { value: "Europe/Amsterdam", label: "Amsterdam (CET)" },
    { value: "Europe/Athens", label: "Athens (EET)" },
  ]},
  { region: "Americas", zones: [
    { value: "America/New_York", label: "New York (EST/EDT)" },
    { value: "America/Chicago", label: "Chicago (CST/CDT)" },
    { value: "America/Denver", label: "Denver (MST/MDT)" },
    { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
    { value: "America/Toronto", label: "Toronto (EST/EDT)" },
    { value: "America/Vancouver", label: "Vancouver (PST/PDT)" },
    { value: "America/Mexico_City", label: "Mexico City (CST)" },
    { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  ]},
  { region: "Asia & Pacific", zones: [
    { value: "Asia/Tokyo", label: "Tokyo (JST)" },
    { value: "Asia/Shanghai", label: "Shanghai (CST)" },
    { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
    { value: "Asia/Singapore", label: "Singapore (SGT)" },
    { value: "Asia/Dubai", label: "Dubai (GST)" },
    { value: "Asia/Kolkata", label: "Mumbai (IST)" },
    { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
    { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
  ]},
  { region: "UTC", zones: [
    { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  ]},
];

interface TimezonePickerProps {
  initialTimezone: string;
}

export function TimezonePicker({ initialTimezone }: TimezonePickerProps) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = async (newTimezone: string) => {
    setTimezone(newTimezone);
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/weddings/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: newTimezone }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // Handle error silently
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="w-5 h-5 text-gray-400" />
        <select
          value={timezone}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
        >
          {TIMEZONES.map((group) => (
            <optgroup key={group.region} label={group.region}>
              {group.zones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Dates and countdowns will be calculated using this timezone.
      </p>
    </div>
  );
}
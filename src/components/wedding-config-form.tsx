"use client";

import { useState } from "react";
// Matches the fields from the Wedding model used in this form
interface WeddingConfigLike {
  coupleName: string;
  weddingDate: Date | null;
  venueName: string | null;
  venueAddress: string | null;
}

interface WeddingConfigFormProps {
  config: WeddingConfigLike | null;
}

export function WeddingConfigForm({ config }: WeddingConfigFormProps) {
  const [coupleName, setCoupleName] = useState(
    config?.coupleName ?? "Our Wedding"
  );
  const [weddingDate, setWeddingDate] = useState(
    config?.weddingDate
      ? new Date(config.weddingDate).toISOString().split("T")[0]
      : ""
  );
  const [venueName, setVenueName] = useState(config?.venueName ?? "");
  const [venueAddress, setVenueAddress] = useState(
    config?.venueAddress ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coupleName,
        weddingDate: weddingDate || null,
        venueName: venueName || null,
        venueAddress: venueAddress || null,
      }),
    });

    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError("Failed to save. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Couple name / event title
        </label>
        <input
          type="text"
          value={coupleName}
          onChange={(e) => setCoupleName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="Alex & Jordan"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Wedding date
        </label>
        <input
          type="date"
          value={weddingDate}
          onChange={(e) => setWeddingDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Venue name
        </label>
        <input
          type="text"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="The Grand Hall"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Venue address
        </label>
        <textarea
          value={venueAddress}
          onChange={(e) => setVenueAddress(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          placeholder="123 Main Street, London"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
      </div>
    </form>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Heart, Calendar, MapPin, Users } from "lucide-react";

export default function OnboardingWeddingPage() {
  const router = useRouter();
  const [coupleName, setCoupleName] = useState("");
  const [weddingDate, setWeddingDate] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
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
        if (data.venueName) setVenueName(data.venueName);
        if (data.venueAddress) setVenueAddress(data.venueAddress);
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
          venueName: venueName.trim() || null,
          venueAddress: venueAddress.trim() || null,
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
                  <MapPin className="w-3.5 h-3.5" />
                  Venue name
                </span>
              </label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="The Grand Hotel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Venue address
              </label>
              <input
                type="text"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="123 High Street, London"
              />
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

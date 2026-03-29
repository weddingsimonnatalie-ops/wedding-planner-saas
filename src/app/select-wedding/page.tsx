"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";

interface WeddingOption {
  weddingId: string;
  coupleName: string;
  weddingDate: string | null;
  subscriptionStatus: string;
  role: string;
}

export default function SelectWeddingPage() {
  const [weddings, setWeddings] = useState<WeddingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/weddings/select")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          if (data.length === 0) {
            window.location.href = "/register";
          } else {
            setWeddings(data);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load weddings.");
        setLoading(false);
      });
  }, []);

  async function select(weddingId: string) {
    setSelecting(weddingId);
    try {
      const res = await fetch("/api/weddings/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weddingId }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        setError("Failed to select wedding. Please try again.");
        setSelecting(null);
      }
    } catch {
      setError("Failed to select wedding. Please try again.");
      setSelecting(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center mb-4">
              <Heart className="w-7 h-7 text-white fill-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Select a Wedding</h1>
            <p className="text-sm text-gray-500 mt-1">Choose which wedding to manage</p>
          </div>

          {loading && (
            <div className="text-center text-gray-400 py-4">Loading…</div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <div className="space-y-3">
            {weddings.map((w) => (
              <button
                key={w.weddingId}
                onClick={() => select(w.weddingId)}
                disabled={selecting !== null}
                className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
              >
                <div className="font-semibold text-gray-900">{w.coupleName}</div>
                {w.weddingDate && (
                  <div className="text-sm text-gray-500 mt-0.5">
                    {new Date(w.weddingDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">{w.role}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

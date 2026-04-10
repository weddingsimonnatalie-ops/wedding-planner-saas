"use client";

import { useEffect, useState } from "react";
import { Users, Trash2, Crown, ArrowRight } from "lucide-react";

const FREE_TIER_GUEST_LIMIT = 30;

type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  groupName: string | null;
};

export default function DowngradeGatePage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/guests?all=true")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.guests ?? [];
        setGuests(list);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load guests");
        setLoading(false);
      });
  }, []);

  const excessCount = guests.length - FREE_TIER_GUEST_LIMIT;
  const mustRemove = Math.max(0, excessCount - selected.size);

  const toggleGuest = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/guests/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds: Array.from(selected) }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete guests");
      }

      // Reload to check if we're now within the limit
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete guests");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Too many guests for Free Tier
              </h1>
              <p className="text-sm text-gray-500">
                You have {guests.length} guests. Free Tier allows up to {FREE_TIER_GUEST_LIMIT}.
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-6">
            Remove guests until you have {FREE_TIER_GUEST_LIMIT} or fewer, or upgrade to a paid plan for unlimited guests.
          </p>

          {/* Upgrade option */}
          <form action="/api/billing/checkout" method="POST" className="mb-6">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Crown className="w-4 h-4" />
              Upgrade to unlimited — £12/month
            </button>
          </form>

          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">
              Or remove guests to continue on Free Tier
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Select {excessCount} or more guests to remove.{" "}
              {selected.size > 0 && (
                <span className={mustRemove > 0 ? "text-amber-600" : "text-green-600"}>
                  {selected.size} selected — {mustRemove > 0 ? `${mustRemove} more needed` : "ready to remove"}
                </span>
              )}
            </p>

            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}

            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {guests.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    onChange={() => toggleGuest(g.id)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-900">
                    {g.firstName} {g.lastName}
                  </span>
                  {g.groupName && (
                    <span className="text-xs text-gray-400 ml-auto">{g.groupName}</span>
                  )}
                </label>
              ))}
            </div>

            <button
              onClick={handleDelete}
              disabled={selected.size === 0 || deleting}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Removing..." : `Remove ${selected.size} guest${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
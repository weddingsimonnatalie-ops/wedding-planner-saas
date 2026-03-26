"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, ArrowRight, CheckCircle, Plus } from "lucide-react";
import { UserRole } from "@prisma/client";

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: "ADMIN", label: "Admin", description: "Full access to everything" },
  { value: "VIEWER", label: "Viewer", description: "Read-only access" },
  { value: "RSVP_MANAGER", label: "RSVP Manager", description: "Manage guests & RSVPs" },
];

interface SentInvite {
  email: string;
  role: UserRole;
}

export default function OnboardingInvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("ADMIN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send invite");
        setLoading(false);
        return;
      }
      setSentInvites((prev) => [...prev, { email, role }]);
      setEmail("");
      setRole("ADMIN");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-primary/40 text-white text-xs font-medium flex items-center justify-center">1</div>
          <div className="w-12 h-0.5 bg-primary/40" />
          <div className="w-8 h-8 rounded-full bg-primary text-white text-xs font-medium flex items-center justify-center">2</div>
          <div className="w-12 h-0.5 bg-gray-200" />
          <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-xs font-medium flex items-center justify-center">3</div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Invite your partner or planner</h1>
            <p className="text-sm text-gray-500 mt-1 text-center">
              Send an invite so they can join your wedding planning team
            </p>
          </div>

          {/* Sent invites list */}
          {sentInvites.length > 0 && (
            <ul className="mb-6 space-y-2">
              {sentInvites.map((inv, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Invite sent to <strong>{inv.email}</strong> ({ROLE_OPTIONS.find(r => r.value === inv.role)?.label})</span>
                </li>
              ))}
            </ul>
          )}

          {/* Invite form */}
          <form onSubmit={handleSend} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="partner@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      role === opt.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {loading ? "Sending…" : "Send invite"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => router.push("/onboarding/done")}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {sentInvites.length > 0 ? "Continue" : "Skip for now"}
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-center text-gray-400 mt-3">
            You can invite more people later from Settings → Users
          </p>
        </div>
      </div>
    </div>
  );
}

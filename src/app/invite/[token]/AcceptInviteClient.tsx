"use client";

import { useState } from "react";
import { UserRole } from "@prisma/client";
import { signIn } from "@/lib/auth-client";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import Link from "next/link";

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Admin",
  VIEWER: "Viewer",
  RSVP_MANAGER: "RSVP Manager",
};

const ROLE_DESCRIPTION: Record<UserRole, string> = {
  ADMIN: "Full access — manage guests, seating, suppliers, payments, and settings",
  VIEWER: "Read-only access to all wedding information",
  RSVP_MANAGER: "Can manage guests and RSVP responses",
};

interface Props {
  token: string;
  coupleName: string;
  role: UserRole;
  inviteEmail: string | null;
  isLoggedIn: boolean;
  loggedInEmail: string | null;
}

export function AcceptInviteClient({
  token,
  coupleName,
  role,
  inviteEmail,
  isLoggedIn,
  loggedInEmail,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(inviteEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Existing user — logged in path
  async function handleAccept() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/accept/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to accept invite");
        setLoading(false);
        return;
      }
      setDone(true);
      // Redirect after a brief moment so the success state is visible
      setTimeout(() => { window.location.href = "/"; }, 800);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // New user — registration path
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/accept/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existingAccount) {
          setError("An account with that email already exists. Log in below to accept the invite.");
        } else {
          setError(data.error ?? "Failed to accept invite");
        }
        setLoading(false);
        return;
      }

      // Sign in with Better Auth to establish the session cookie
      const signInResult = await signIn.email({ email, password });
      if (signInResult.error) {
        setError("Account created but sign-in failed. Please log in manually.");
        setLoading(false);
        return;
      }

      setDone(true);
      setTimeout(() => { window.location.href = "/"; }, 800);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <CheckCircle className="w-10 h-10 text-green-500" />
        <p className="text-sm font-medium text-gray-700">Joined! Taking you to the dashboard…</p>
      </div>
    );
  }

  // Role badge
  const roleBadge = (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Your role</p>
      <p className="text-sm font-semibold text-gray-900">{ROLE_LABEL[role]}</p>
      <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTION[role]}</p>
    </div>
  );

  if (isLoggedIn) {
    // User is already logged in — show a confirm button
    return (
      <div>
        {roleBadge}
        <p className="text-sm text-gray-600 mb-4 text-center">
          Signed in as <strong>{loggedInEmail}</strong>
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleAccept}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Joining…" : `Join ${coupleName}'s wedding`}
        </button>
        <p className="text-xs text-center text-gray-400 mt-3">
          Wrong account?{" "}
          <Link
            href={`/login?callbackUrl=/invite/${token}`}
            className="text-primary hover:underline"
          >
            Sign in with a different account
          </Link>
        </p>
      </div>
    );
  }

  // User is not logged in — show registration form (or login link if account exists)
  return (
    <div>
      {roleBadge}
      <p className="text-sm text-gray-600 mb-4">
        Create an account to join the wedding planning team.
      </p>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}
      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Jane Smith"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            readOnly={!!inviteEmail}
            placeholder="jane@example.com"
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${inviteEmail ? "bg-gray-50 text-gray-500 cursor-default" : ""}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Setting up your account…" : "Create account & join"}
        </button>
      </form>
      <p className="text-sm text-center text-gray-500 mt-6">
        Already have an account?{" "}
        <Link
          href={`/login?callbackUrl=/invite/${token}`}
          className="text-primary hover:underline font-medium"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

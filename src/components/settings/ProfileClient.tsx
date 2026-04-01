"use client";

import { useState, useEffect } from "react";
import { TwoFactorSettings } from "@/components/settings/TwoFactorSettings";
import { UserRole } from "@prisma/client";

interface Props {
  user: { id: string; name: string | null; email: string; role: UserRole };
}

const roleBadgeClass: Record<UserRole, string> = {
  ADMIN: "text-purple-700 bg-purple-50 border border-purple-200",
  VIEWER: "text-blue-700 bg-blue-50 border border-blue-200",
  RSVP_MANAGER: "text-green-700 bg-green-50 border border-green-200",
};

const roleLabel: Record<UserRole, string> = {
  ADMIN: "Admin",
  VIEWER: "Viewer",
  RSVP_MANAGER: "RSVP Manager",
};

interface ActivityEntry {
  id: string;
  success: boolean;
  createdAt: string;
  ipAddress: string | null;
  browser: string;
  os: string;
  device: string;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((todayStart.getTime() - dateStart.getTime()) / 86400000);

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  return `${diffDays} days ago at ${time}`;
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div
      className={`fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${
        ok ? "bg-green-600" : "bg-red-600"
      }`}
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {msg}
    </div>
  );
}

export function ProfileClient({ user }: Props) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [emailPassword, setEmailPassword] = useState("");

  // Track if email is being changed
  const emailChanged = email !== user.email;

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/activity")
      .then((r) => r.json())
      .then((data) => {
        setActivity(Array.isArray(data) ? data : []);
        setActivityLoading(false);
      })
      .catch(() => {
        setActivity([]);
        setActivityLoading(false);
      });
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");

    // Require password when changing email
    if (emailChanged && !emailPassword) {
      setProfileError("Please enter your current password to change your email");
      return;
    }

    setProfileLoading(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: emailChanged ? emailPassword : undefined }),
    });
    const data = await res.json();
    setProfileLoading(false);
    if (!res.ok) {
      setProfileError(data.error ?? "Failed to save");
    } else {
      setEmailPassword("");
      showToast("Profile updated");
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match");
      return;
    }
    if (newPw.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    setPwLoading(true);
    const res = await fetch(`/api/users/${user.id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    const data = await res.json();
    setPwLoading(false);
    if (!res.ok) {
      setPwError(data.error ?? "Failed to change password");
    } else {
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      showToast("Password changed");
    }
  }

  return (
    <div className="space-y-6">
      {/* Role */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-3">Your role</h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${roleBadgeClass[user.role]}`}>
            {roleLabel[user.role]}
          </span>
          {user.role !== "ADMIN" && (
            <p className="text-sm text-gray-500">Contact an admin to change your role.</p>
          )}
        </div>
      </div>

      {/* Profile details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Profile details</h2>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          {emailChanged && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current password <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-1">Required to change your email</p>
              <input
                type="password"
                required
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                autoComplete="current-password"
                placeholder="Enter your current password"
              />
            </div>
          )}
          {profileError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {profileError}
            </p>
          )}
          <button
            type="submit"
            disabled={profileLoading}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {profileLoading ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Change password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3 max-w-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
            <input
              type="password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <input
              type="password"
              required
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              autoComplete="new-password"
            />
          </div>
          {pwError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {pwError}
            </p>
          )}
          <button
            type="submit"
            disabled={pwLoading}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {pwLoading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>

      {/* Two-factor authentication */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-1">
          Two-factor authentication
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Add an extra layer of security by requiring a code from your authenticator
          app each time you sign in.
        </p>
        <TwoFactorSettings />
      </div>

      {/* Recent login activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">Recent login activity</h2>

        {/* Warning banner for recent failed attempts */}
        {activity && (() => {
          const cutoff = new Date(Date.now() - 86400000);
          const recentFails = activity.filter(
            (a) => !a.success && new Date(a.createdAt) > cutoff
          );
          return recentFails.length > 0 ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <span className="mt-0.5 shrink-0">&#9888;</span>
              <span>
                <strong>{recentFails.length} failed login attempt{recentFails.length !== 1 ? "s" : ""} detected</strong>{" "}
                in the last 24 hours. If this wasn&apos;t you, consider changing your password.
              </span>
            </div>
          ) : null;
        })()}

        {activityLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-5 w-5 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3.5 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-28 rounded bg-gray-100" />
                </div>
                <div className="h-3.5 w-32 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : !activity || activity.length === 0 ? (
          <p className="text-sm text-gray-500">No login activity yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-base leading-none">
                    {a.success ? (
                      <span className="text-green-500">&#10003;</span>
                    ) : (
                      <span className="text-red-500">&#10007;</span>
                    )}
                  </span>
                  <div>
                    <p className="text-sm text-gray-900">{formatRelativeDate(a.createdAt)}</p>
                    {!a.success && (
                      <p className="text-xs text-red-600 mt-0.5">Failed attempt</p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500 text-right shrink-0">
                  <p className="whitespace-nowrap">{a.browser} &middot; {a.os}</p>
                  {a.ipAddress && (
                    <p className="text-xs text-gray-400 mt-0.5">{a.ipAddress}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activity && activity.length > 0 && (
          <p className="mt-4 text-xs text-gray-400">Showing last {activity.length} login{activity.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Eye, EyeOff, Heart } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ResetPasswordPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/auth/reset-password/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
        return;
      }

      if (res.status === 404 || res.status === 410) {
        setError(data.error ?? "This reset link is invalid or has already been used. Please request a new one.");
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
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
            <h1 className="text-2xl font-semibold text-gray-900">Reset password</h1>
            <p className="text-sm text-gray-500 mt-1">Choose a new password for your account</p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                Your password has been reset successfully.
              </div>
              <Link
                href="/login?reason=password-reset"
                className="block w-full text-center py-2.5 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="••••••••"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Must be 8–128 characters</p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || password.length < 8}
                className="w-full py-2.5 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 transition-colors"
              >
                {loading ? "Saving…" : "Set new password"}
              </button>

              <Link
                href="/forgot-password"
                className="block w-full text-center text-sm text-gray-500 hover:text-gray-700"
              >
                Request a new reset link
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

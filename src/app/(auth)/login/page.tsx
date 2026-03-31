"use client";

import { Suspense, useState } from "react";
import { signIn } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart, ChevronLeft, MonitorSmartphone } from "lucide-react";

// ---------------------------------------------------------------------------
// Step 1 — credentials
// ---------------------------------------------------------------------------

interface Step1Props {
  onNeedsTotp: (email: string, password: string, rememberDevice: boolean) => void;
  onDone: (rememberDevice: boolean) => void;
}

function CredentialsStep({ onNeedsTotp, onDone }: Step1Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [lockError, setLockError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setVerificationError("");
    setLockError("");
    setLoading(true);

    // Preflight: check password + find out if 2FA is required
    const pre = await fetch("/api/auth/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const preData = await pre.json();
    setLoading(false);

    if (pre.status === 423) {
      const until = new Date(preData.lockedUntil);
      const timeStr = until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLockError(`Too many failed login attempts. Your account has been locked until ${timeStr}.`);
      return;
    }

    if (!preData.valid) {
      setError("Invalid email or password.");
      return;
    }

    if (preData.requires2FA) {
      onNeedsTotp(email, password, rememberDevice);
    } else {
      // No 2FA — sign in directly with Better Auth
      setLoading(true);
      try {
        const result = await signIn.email({ email, password });
        if (result.error) {
          setLoading(false);
          if (result.error.message?.includes("verify")) {
            setVerificationError(result.error.message);
          } else {
            setError("Sign-in failed. Please try again.");
          }
        } else {
          onDone(rememberDevice);
        }
      } catch (err) {
        setLoading(false);
        setError("Sign-in failed. Please try again.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="••••••••"
        />
      </div>

      {lockError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
          <p className="font-semibold mb-0.5">🔒 Account temporarily locked</p>
          <p>{lockError}</p>
        </div>
      )}

      {verificationError && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
          <p className="font-semibold mb-0.5">✉️ Email verification required</p>
          <p>{verificationError}</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id="rememberDevice"
          checked={rememberDevice}
          onChange={(e) => setRememberDevice(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label htmlFor="rememberDevice" className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">Remember this device</span>
          <span className="block text-gray-500">Skip 2FA and stay logged in for 30 days</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 transition-colors"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — TOTP / backup code
// ---------------------------------------------------------------------------

interface Step2Props {
  email: string;
  password: string;
  rememberDevice: boolean;
  onBack: () => void;
  onDone: (rememberDevice: boolean) => void;
}

function TotpStep({ email, password, rememberDevice, onBack, onDone }: Step2Props) {
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // For 2FA, we still use the preflight + verify flow
    // The preflight already validated the password, now verify TOTP/backup code
    const extra = useBackup ? { backupCode: code } : { totpCode: code };

    try {
      const result = await signIn.email({
        email,
        password,
        // Better Auth doesn't have built-in 2FA for credentials, so we need custom handling
        // For now, call our custom verify-2fa API
      });

      // Call custom 2FA verification API
      const verifyRes = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...extra }),
      });

      setLoading(false);

      if (verifyRes.ok) {
        // Now complete sign-in
        const signInResult = await signIn.email({ email, password });
        if (signInResult.error) {
          setError("Sign-in failed after verification.");
        } else {
          onDone(rememberDevice);
        }
      } else {
        setError(useBackup ? "Invalid backup code." : "Invalid authenticator code.");
      }
    } catch (err) {
      setLoading(false);
      setError("Verification failed. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 -mt-1 mb-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <p className="text-sm text-gray-600">
        {useBackup
          ? "Enter one of your 8-character backup codes (e.g. abcd-1234)."
          : "Enter the 6-digit code from your authenticator app."}
      </p>

      <div>
        <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
          {useBackup ? "Backup code" : "Authenticator code"}
        </label>
        <input
          id="code"
          type="text"
          inputMode={useBackup ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent tracking-widest text-center"
          placeholder={useBackup ? "xxxx-xxxx" : "000000"}
          maxLength={useBackup ? 9 : 6}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 transition-colors"
      >
        {loading ? "Verifying…" : "Verify"}
      </button>

      <button
        type="button"
        onClick={() => { setUseBackup(!useBackup); setCode(""); setError(""); }}
        className="w-full text-sm text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
      >
        {useBackup ? "Use authenticator app instead" : "Use a backup code instead"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main login form (orchestrates steps)
// ---------------------------------------------------------------------------

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const reason = searchParams.get("reason");
  const verified = searchParams.get("verified");
  const error = searchParams.get("error");

  type Step = "credentials" | "totp";
  const [step, setStep] = useState<Step>("credentials");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [pendingRememberDevice, setPendingRememberDevice] = useState(false);

  function handleNeedsTotp(email: string, password: string, rememberDevice: boolean) {
    setPendingEmail(email);
    setPendingPassword(password);
    setPendingRememberDevice(rememberDevice);
    setStep("totp");
  }

  async function handleDone(rememberDevice: boolean) {
    // Set the signed weddingId cookie based on the user's memberships.
    // This returns a redirect URL: "/" for one wedding, "/select-wedding" for
    // multiple, or "/register" for none.
    // MUST be called BEFORE trust-device because requireRole() needs the weddingId cookie.
    let destination = callbackUrl;
    try {
      const res = await fetch("/api/auth/set-wedding", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.redirect) destination = data.redirect;
      }
    } catch (err) {
      console.error("Failed to set wedding context:", err);
    }

    // If remember device is checked, call the trust-device API
    // This must come AFTER set-wedding because requireRole() checks the weddingId cookie.
    if (rememberDevice) {
      try {
        await fetch("/api/auth/trust-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch (err) {
        // Non-critical error, continue with login
        console.error("Failed to set trusted device:", err);
      }
    }

    // Use window.location.href for a full page reload so the session and
    // weddingId cookies are read correctly by middleware on first navigation.
    window.location.href = destination;
  }

  const timeoutBanner = reason === "timeout" && (
    <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 text-sm text-blue-800 mb-4">
      <span className="shrink-0 mt-0.5">ℹ</span>
      <span>Your session expired due to inactivity. Please sign in again.</span>
    </div>
  );

  const verifiedBanner = verified === "true" && (
    <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-800 mb-4">
      <span className="shrink-0 mt-0.5">✓</span>
      <span>Your email has been verified. You can now sign in.</span>
    </div>
  );

  const errorBanner = error === "expired" && (
    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800 mb-4">
      <span className="shrink-0 mt-0.5">⚠</span>
      <span>The verification link has expired. Please contact an administrator to resend the verification email.</span>
    </div>
  ) || error === "invalid" && (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800 mb-4">
      <span className="shrink-0 mt-0.5">✖</span>
      <span>Invalid verification link. Please check the link or contact an administrator.</span>
    </div>
  ) || error === "unknown" && (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800 mb-4">
      <span className="shrink-0 mt-0.5">✖</span>
      <span>An error occurred during verification. Please try again or contact an administrator.</span>
    </div>
  );

  if (step === "totp") {
    return (
      <>
        {timeoutBanner}
        {verifiedBanner}
        {errorBanner}
        <TotpStep
          email={pendingEmail}
          password={pendingPassword}
          rememberDevice={pendingRememberDevice}
          onBack={() => setStep("credentials")}
          onDone={handleDone}
        />
      </>
    );
  }

  return (
    <>
      {timeoutBanner}
      {verifiedBanner}
      {errorBanner}
      <CredentialsStep
        onNeedsTotp={handleNeedsTotp}
        onDone={handleDone}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center mb-4">
              <Heart className="w-7 h-7 text-white fill-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Wedding Planner</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
          </div>

          <Suspense fallback={<div className="h-40" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
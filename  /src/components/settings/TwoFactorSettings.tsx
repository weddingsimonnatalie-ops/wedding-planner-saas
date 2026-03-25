"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, ShieldOff, Copy, Check, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/fetch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Status {
  enabled: boolean;
  backupCodesRemaining: number;
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function BackupCodesList({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = codes.join("\n");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    } catch {
      // copy failed — codes are visible on screen for manual copy
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-sm font-medium text-amber-800">Save these backup codes now</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Each code can be used once. Store them somewhere safe — they will not be shown again.
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-sm grid grid-cols-2 gap-2">
        {codes.map((c) => (
          <span key={c} className="text-gray-800 tracking-wider">{c}</span>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy all"}
        </button>
        <button
          onClick={onDone}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Done — I&apos;ve saved these
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup flow
// ---------------------------------------------------------------------------

type SetupStep = "idle" | "qr" | "verify" | "backup-codes";

function SetupFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<SetupStep>("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/2fa/setup", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Setup failed"); return; }
    setQrDataUrl(data.qrDataUrl);
    setSecret(data.secret);
    setStep("qr");
  }

  async function verifyCode() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Verification failed"); return; }
    setBackupCodes(data.backupCodes);
    setStep("backup-codes");
  }

  if (step === "idle") {
    return (
      <button
        onClick={startSetup}
        disabled={loading}
        className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {loading ? "Setting up…" : "Enable two-factor authentication"}
      </button>
    );
  }

  if (step === "qr") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Scan this QR code with Google Authenticator, Authy, or your phone&apos;s built-in
          authenticator. Then enter the 6-digit code below to confirm.
        </p>

        {qrDataUrl && (
          <img src={qrDataUrl} alt="QR code" className="w-44 h-44 border border-gray-200 rounded-lg" />
        )}

        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">Can&apos;t scan? Enter code manually</summary>
          <code className="block mt-1 font-mono tracking-wider bg-gray-50 border border-gray-200 rounded px-2 py-1 break-all">
            {secret}
          </code>
        </details>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Verification code
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="000000"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setStep("idle")}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={verifyCode}
            disabled={loading || code.length !== 6}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "Verifying…" : "Confirm & enable"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "backup-codes") {
    return <BackupCodesList codes={backupCodes} onDone={onComplete} />;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Disable flow
// ---------------------------------------------------------------------------

function DisableFlow({ onComplete }: { onComplete: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleDisable() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totpCode: code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onComplete();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
      >
        <ShieldOff className="w-4 h-4" />
        Disable 2FA
      </button>
    );
  }

  return (
    <div className="space-y-3 border border-red-200 bg-red-50 rounded-lg p-4">
      <p className="text-sm font-medium text-red-800">Confirm disable 2FA</p>
      <p className="text-xs text-red-700">
        Enter your current 6-digit authenticator code to disable two-factor authentication.
      </p>
      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-36 px-3 py-2 border border-red-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent bg-white"
        placeholder="000000"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => { setOpen(false); setCode(""); setError(""); }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDisable}
          disabled={loading || code.length !== 6}
          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {loading ? "Disabling…" : "Disable 2FA"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regenerate backup codes
// ---------------------------------------------------------------------------

function RegenerateBackupCodes({ onComplete }: { onComplete: () => void }) {
  const [code, setCode] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleRegenerate() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/2fa/backup-codes/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totpCode: code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    setNewCodes(data.backupCodes);
  }

  if (newCodes.length > 0) {
    return (
      <BackupCodesList
        codes={newCodes}
        onDone={() => { setNewCodes([]); setOpen(false); onComplete(); }}
      />
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
      >
        <RefreshCw className="w-4 h-4" />
        Regenerate backup codes
      </button>
    );
  }

  return (
    <div className="space-y-3 border border-gray-200 bg-gray-50 rounded-lg p-4">
      <p className="text-sm font-medium text-gray-800">Regenerate backup codes</p>
      <p className="text-xs text-gray-600">
        This will invalidate all existing backup codes. Enter your authenticator code to confirm.
      </p>
      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        placeholder="000000"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => { setOpen(false); setCode(""); setError(""); }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleRegenerate}
          disabled={loading || code.length !== 6}
          className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {loading ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function TwoFactorSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshStatus() {
    setLoading(true);
    const res = await fetchApi("/api/2fa/status");
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  }

  useEffect(() => { refreshStatus(); }, []);

  if (loading) {
    return <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {status?.enabled ? (
          <>
            <ShieldCheck className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-700">
              Two-factor authentication is enabled
            </span>
          </>
        ) : (
          <>
            <ShieldOff className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500">
              Two-factor authentication is not enabled
            </span>
          </>
        )}
      </div>

      {status?.enabled ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {status.backupCodesRemaining} backup code
            {status.backupCodesRemaining !== 1 ? "s" : ""} remaining
          </p>
          <RegenerateBackupCodes onComplete={refreshStatus} />
          <DisableFlow onComplete={refreshStatus} />
        </div>
      ) : (
        <SetupFlow onComplete={refreshStatus} />
      )}
    </div>
  );
}

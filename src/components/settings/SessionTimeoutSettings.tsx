"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";

interface Props {
  initialTimeoutMinutes: number;
  initialWarningMinutes: number;
}

// Constants matching API validation
const MIN_TIMEOUT = 5;
const MAX_TIMEOUT = 480;
const MIN_WARNING = 1;
const MAX_WARNING = 30;

const TIMEOUT_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
];

const WARNING_OPTIONS = [
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
];

export function SessionTimeoutSettings({
  initialTimeoutMinutes,
  initialWarningMinutes,
}: Props) {
  const [timeoutMinutes, setTimeoutMinutes] = useState(initialTimeoutMinutes);
  const [warningMinutes, setWarningMinutes] = useState(initialWarningMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Sync if props change (shouldn't normally)
  useEffect(() => {
    setTimeoutMinutes(initialTimeoutMinutes);
    setWarningMinutes(initialWarningMinutes);
  }, [initialTimeoutMinutes, initialWarningMinutes]);

  async function handleSave() {
    setError("");
    setSuccess(false);

    // Validate warning < timeout
    if (warningMinutes >= timeoutMinutes) {
      setError("Warning time must be less than timeout duration");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/settings/session-timeout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeoutMinutes, warningMinutes }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Timeout duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Session timeout
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Users will be logged out after this period of inactivity
        </p>
        <select
          value={timeoutMinutes}
          onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          {TIMEOUT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Warning time */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Warning time
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Show a warning this many minutes before logout
        </p>
        <select
          value={warningMinutes}
          onChange={(e) => setWarningMinutes(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          {WARNING_OPTIONS.filter((opt) => opt.value < timeoutMinutes).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {warningMinutes >= timeoutMinutes && (
          <p className="text-xs text-red-600 mt-1">
            Warning time must be less than session timeout
          </p>
        )}
      </div>

      {/* Trusted device info */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          <span className="font-medium">Note:</span> Users who check "Remember this device" on login
          will not be logged out due to inactivity. Their trusted device cookie lasts 30 days, allowing
          them to stay logged in without timeout. This is intended for personal devices only.
        </p>
      </div>

      {/* Error / Success */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Settings saved
        </p>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || warningMinutes >= timeoutMinutes}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
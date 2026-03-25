"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { signOut } from "@/lib/auth-client";
import { useBroadcastChannel, InactivityMessage } from "@/hooks/useBroadcastChannel";
import { useFormDirty } from "@/context/FormDirtyContext";
import { UnsavedWorkModal } from "./UnsavedWorkModal";

// ─── Configuration (defaults, will be overridden by server settings) ─────────
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const DEFAULT_WARNING_MS = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_MS = 5000; // 5 seconds — debounce activity events

// Generate a random ID (fallback for non-secure contexts where crypto.randomUUID is unavailable)
function generateTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: generate a random string
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Activity events that reset the timer
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function InactivityTimer() {
  const [showWarning, setShowWarning] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [countdown, setCountdown] = useState(DEFAULT_WARNING_MS / 1000);
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MS);
  const [warningMs, setWarningMs] = useState(DEFAULT_WARNING_MS);
  const [isTrustedDevice, setIsTrustedDevice] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Unique tab ID for cross-tab communication
  const tabIdRef = useRef<string>("");
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityTime = useRef<number>(Date.now());

  // Cross-tab communication
  const { postMessage, onMessage } = useBroadcastChannel<InactivityMessage>("inactivity-sync");

  // Form dirty state
  const { hasDirtyForms, getDirtyFormNames, clearAll } = useFormDirty();

  // Generate unique tab ID on mount
  useEffect(() => {
    tabIdRef.current = generateTabId();
  }, []);

  // Calculate warning trigger time
  const warnAtMs = timeoutMs - warningMs;

  const clearAllTimers = useCallback(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
  }, []);

  const startLogoutCountdown = useCallback(() => {
    // Clear any existing interval first (prevent stacking)
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    setCountdown(warningMs / 1000);
    countdownInterval.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownInterval.current) clearInterval(countdownInterval.current);
          countdownInterval.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [warningMs]);

  const resetTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setShowUnsavedWarning(false);
    setCountdown(warningMs / 1000);

    warnTimer.current = setTimeout(() => {
      // Check for unsaved forms before showing warning
      if (hasDirtyForms()) {
        setShowUnsavedWarning(true);
        // Broadcast to other tabs
        postMessage({ type: "logout-warning", timestamp: Date.now(), tabId: tabIdRef.current });
      } else {
        setShowWarning(true);
        startLogoutCountdown();
        // Broadcast warning to other tabs
        postMessage({ type: "logout-warning", timestamp: Date.now(), tabId: tabIdRef.current });
      }
    }, warnAtMs);

    logoutTimer.current = setTimeout(() => {
      // Broadcast logout to other tabs before signing out
      postMessage({ type: "logout", timestamp: Date.now(), tabId: tabIdRef.current });
      signOut()
        .catch(() => {
          console.error("signOut failed during inactivity timeout");
        })
        .finally(() => {
          clearAll();
          window.location.href = "/login?reason=timeout";
        });
    }, timeoutMs);
  }, [clearAllTimers, startLogoutCountdown, warnAtMs, timeoutMs, warningMs, postMessage, hasDirtyForms, clearAll]);

  // Fetch timeout settings and trusted device status on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        // Fetch both in parallel
        const [timeoutRes, trustedRes] = await Promise.all([
          fetch("/api/settings/session-timeout"),
          fetch("/api/auth/trust-device/check"),
        ]);

        if (timeoutRes.ok) {
          const timeoutData = await timeoutRes.json();
          setTimeoutMs((timeoutData.timeoutMinutes || 60) * 60 * 1000);
          setWarningMs((timeoutData.warningMinutes || 5) * 60 * 1000);
        }

        if (trustedRes.ok) {
          const trustedData = await trustedRes.json();
          setIsTrustedDevice(trustedData.trusted || false);
        }
      } catch (error) {
        console.error("Error fetching inactivity settings:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, []);

  // Listen for messages from other tabs
  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      // Ignore messages from this tab
      if (message.tabId === tabIdRef.current) return;

      switch (message.type) {
        case "activity":
          // Another tab had activity, reset our timer too
          resetTimer();
          break;

        case "logout-warning":
          // Another tab is showing warning, show it here too
          if (hasDirtyForms()) {
            setShowUnsavedWarning(true);
          } else {
            setShowWarning(true);
            startLogoutCountdown();
          }
          break;

        case "extend-session":
          // Another tab clicked "Stay logged in", dismiss warning and reset timer
          setShowWarning(false);
          setShowUnsavedWarning(false);
          resetTimer();
          break;

        case "logout":
          // Another tab triggered logout, redirect this tab too
          clearAll();
          window.location.href = "/login?reason=timeout";
          break;
      }
    });

    return unsubscribe;
  }, [onMessage, resetTimer, startLogoutCountdown, hasDirtyForms, clearAll]);

  // Mount: start timers and attach activity listeners
  useEffect(() => {
    // Don't start timers until settings are loaded
    if (isLoading) return;

    // Trusted devices bypass the inactivity timeout entirely
    if (isTrustedDevice) return;

    resetTimer();

    const handleActivity = () => {
      // Debounce: only reset if enough time has passed since last activity
      const now = Date.now();
      if (now - lastActivityTime.current < DEBOUNCE_MS) {
        return;
      }
      lastActivityTime.current = now;

      // Reset local timer
      resetTimer();

      // Broadcast activity to other tabs
      postMessage({ type: "activity", timestamp: now, tabId: tabIdRef.current });
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      document.addEventListener(evt, handleActivity, { passive: true })
    );

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach((evt) =>
        document.removeEventListener(evt, handleActivity)
      );
    };
  }, [resetTimer, clearAllTimers, isLoading, isTrustedDevice, postMessage]);

  async function handleStayLoggedIn() {
    // Reset local timer
    resetTimer();

    // Broadcast to other tabs to dismiss warning and reset
    postMessage({ type: "extend-session", timestamp: Date.now(), tabId: tabIdRef.current });
  }

  function handleLogOutNow() {
    clearAllTimers();

    // Broadcast logout to other tabs
    postMessage({ type: "logout", timestamp: Date.now(), tabId: tabIdRef.current });

    clearAll(); // Clear dirty form state

    signOut()
      .catch(() => {
        console.error("signOut failed during inactivity logout");
      })
      .finally(() => {
        window.location.href = "/login";
      });
  }

  function handleDiscardAndLogout() {
    setShowUnsavedWarning(false);
    handleLogOutNow();
  }

  function handleCancelUnsaved() {
    setShowUnsavedWarning(false);
    resetTimer();
  }

  // Don't render until settings are loaded
  if (isLoading) return null;

  // Trusted devices bypass the inactivity timeout entirely
  if (isTrustedDevice) return null;

  // Show unsaved work warning instead of regular warning
  if (showUnsavedWarning) {
    return (
      <UnsavedWorkModal
        formNames={getDirtyFormNames()}
        onDiscard={handleDiscardAndLogout}
        onCancel={handleCancelUnsaved}
      />
    );
  }

  if (!showWarning) return null;

  return (
    // Backdrop — clicking it counts as activity and resets the timer
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleStayLoggedIn}
    >
      {/* Dialog — stop click propagation so backdrop handler doesn't re-fire */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon + title */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl leading-none">&#9203;</span>
          <h2 className="text-lg font-semibold text-gray-900">Session expiring soon</h2>
        </div>

        {/* Body */}
        <p className="text-sm text-gray-600 mb-1">
          You&apos;ve been inactive for {Math.round((timeoutMs - warningMs) / 60000)} minutes. Your session
          will expire in:
        </p>
        <p className="text-3xl font-mono font-bold text-amber-600 mb-5">
          {formatCountdown(countdown)}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleStayLoggedIn}
            className="flex-1 py-2.5 px-4 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Stay logged in
          </button>
          <button
            type="button"
            onClick={handleLogOutNow}
            className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            Log out now
          </button>
        </div>
      </div>
    </div>
  );
}
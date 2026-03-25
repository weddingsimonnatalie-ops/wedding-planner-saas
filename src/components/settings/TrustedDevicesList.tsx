"use client";

import { useState, useEffect } from "react";
import { Monitor, Smartphone, Tablet, Trash2, MonitorSmartphone, Loader2, AlertTriangle } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";

interface TrustedDevice {
  id: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  os: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipAddress: string | null;
}

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  desktop: <Monitor className="w-5 h-5" />,
  laptop: <MonitorSmartphone className="w-5 h-5" />,
  tablet: <Tablet className="w-5 h-5" />,
  mobile: <Smartphone className="w-5 h-5" />,
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return formatDate(dateStr);
}

export function TrustedDevicesList() {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revokingId, setRevolvingId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<TrustedDevice | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/trust-devices");
      if (!res.ok) {
        throw new Error("Failed to load devices");
      }
      const data = await res.json();
      setDevices(data.devices || []);
    } catch {
      setError("Failed to load trusted devices");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(device: TrustedDevice) {
    setRevolvingId(device.id);
    try {
      const res = await fetch(`/api/auth/trust-device/${device.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to revoke device");
      }
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
    } catch {
      setError("Failed to revoke device");
    } finally {
      setRevolvingId(null);
      setConfirmRevoke(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {error}
        <button
          onClick={loadDevices}
          className="ml-2 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No trusted devices. When you log in with "Remember this device" checked,
        it will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {devices.map((device) => {
        const icon = DEVICE_ICONS[device.deviceType] || <Monitor className="w-5 h-5" />;
        const isRevoking = revokingId === device.id;

        return (
          <div
            key={device.id}
            className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {/* Device icon */}
            <div className="text-gray-400 mt-0.5">{icon}</div>

            {/* Device info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">
                  {device.deviceName}
                </span>
                {device.browser && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {device.browser}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {device.os && <span>{device.os} · </span>}
                Last used {formatRelative(device.lastUsedAt)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Added {formatDate(device.createdAt)}
                {device.ipAddress && <span> · IP: {device.ipAddress}</span>}
              </div>
              <div className="text-xs text-amber-600 mt-1">
                Expires {formatDate(device.expiresAt)}
              </div>
            </div>

            {/* Revoke button */}
            <button
              onClick={() => setConfirmRevoke(device)}
              disabled={isRevoking}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              title="Revoke this device"
            >
              {isRevoking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        );
      })}

      {/* Confirmation modal */}
      {confirmRevoke && (
        <ConfirmModal
          message={
            <span>
              Revoke <strong>{confirmRevoke.deviceName}</strong>? You&apos;ll need to log in
              again on that device if you want it to be trusted.
            </span>
          }
          onConfirm={() => handleRevoke(confirmRevoke)}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}

      {/* Info box */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-800">
            <p className="font-medium mb-1">About trusted devices</p>
            <p>
              Trusted devices stay logged in longer before being timed out. You can
              revoke access at any time. If you revoke your current device, you&apos;ll
              need to check the "Remember this device" box again next time you log in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
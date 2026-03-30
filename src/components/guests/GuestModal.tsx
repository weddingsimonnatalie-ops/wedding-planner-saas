"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useRefresh } from "@/context/RefreshContext";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";

interface Props {
  onClose: () => void;
  groups: string[];
}

export function GuestModal({ onClose, groups }: Props) {
  const router = useRouter();
  const { triggerRefresh } = useRefresh();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [groupName, setGroupName] = useState("");
  const [isChild, setIsChild]     = useState(false);
  const [ceremony, setCeremony]   = useState(true);
  const [reception, setReception] = useState(true);
  const [afterparty, setAfterparty] = useState(false);
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  // ── Track dirty state for inactivity warning ───────────────────────────────
  const isDirty = useMemo(() => {
    // Check if any field has been filled in
    return (
      firstName !== "" ||
      lastName !== "" ||
      email !== "" ||
      phone !== "" ||
      groupName !== "" ||
      isChild || // defaults to false
      !ceremony || // defaults to true
      !reception || // defaults to true
      afterparty || // defaults to false
      notes !== ""
    );
  }, [firstName, lastName, email, phone, groupName, isChild, ceremony, reception, afterparty, notes]);

  useFormDirtyRegistration("guest-modal", "New Guest", isDirty);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const res = await fetch("/api/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        groupName: groupName || null,
        isChild,
        invitedToCeremony: ceremony,
        invitedToReception: reception,
        invitedToAfterparty: afterparty,
        notes: notes || null,
      }),
    });

    setSaving(false);

    if (res.ok) {
      router.refresh();
      triggerRefresh();
      onClose();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to save guest");
    }
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";
  const grouplistId = "guest-modal-group-suggestions";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 pb-4 overflow-y-auto"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add guest</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First name <span className="text-red-500">*</span>
              </label>
              <input
                required
                autoFocus
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last name <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Group + child */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
              <input
                list={grouplistId}
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="e.g. Bride's Family"
                className={inputCls}
              />
              <datalist id={grouplistId}>
                {groups.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div className="flex items-center sm:pt-7">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChild}
                  onChange={e => setIsChild(e.target.checked)}
                  className="w-4 h-4 rounded text-primary"
                />
                <span className="text-sm text-gray-700">Is a child</span>
              </label>
            </div>
          </div>

          {/* Invited to */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Invited to</label>
            <div className="flex flex-wrap gap-4">
              {[
                { label: "Ceremony",   val: ceremony,   set: setCeremony },
                { label: "Reception",  val: reception,  set: setReception },
                { label: "Afterparty", val: afterparty, set: setAfterparty },
              ].map(({ label, val, set }) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={e => set(e.target.checked)}
                    className="w-4 h-4 rounded text-primary"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (internal)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving ? "Adding…" : "Add guest"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

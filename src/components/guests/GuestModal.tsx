"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/context/RefreshContext";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";
import { ModalShell } from "@/components/ui/ModalShell";
import { useWedding } from "@/context/WeddingContext";
import { getEvents } from "@/lib/eventNames";

interface Props {
  onClose: () => void;
  groups: string[];
}

export function GuestModal({ onClose, groups }: Props) {
  const router = useRouter();
  const { triggerRefresh } = useRefresh();
  const { eventNames } = useWedding();
  const events = getEvents(eventNames);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [groupName, setGroupName] = useState("");
  const [isChild, setIsChild]     = useState(false);
  const [ceremony, setCeremony]   = useState(true);
  const [reception, setReception] = useState(true);
  const [afterparty, setAfterparty] = useState(false);
  const [rehearsalDinner, setRehearsalDinner] = useState(false);
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
      rehearsalDinner || // defaults to false
      notes !== ""
    );
  }, [firstName, lastName, email, phone, groupName, isChild, ceremony, reception, afterparty, rehearsalDinner, notes]);

  useFormDirtyRegistration("guest-modal", "New Guest", isDirty);

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
        invitedToRehearsalDinner: rehearsalDinner,
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

  // Map event keys to state setters
  const eventStateMap: Record<string, { val: boolean; set: (v: boolean) => void }> = {
    ceremony: { val: ceremony, set: setCeremony },
    meal: { val: reception, set: setReception },
    eveningParty: { val: afterparty, set: setAfterparty },
    rehearsalDinner: { val: rehearsalDinner, set: setRehearsalDinner },
  };

  return (
    <ModalShell
      title="Add guest"
      onClose={onClose}
      formId="guest-modal-form"
      submitLabel={saving ? "Adding…" : "Add guest"}
      submitDisabled={saving}
    >
      <form id="guest-modal-form" onSubmit={handleSubmit} className="p-5 space-y-4">
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
              {events.map((event) => {
                const state = eventStateMap[event.key];
                if (!state) return null;
                return (
                  <label key={event.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.val}
                      onChange={e => state.set(e.target.checked)}
                      className="w-4 h-4 rounded text-primary"
                    />
                    <span className="text-sm text-gray-700">{event.name}</span>
                  </label>
                );
              })}
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

      </form>
    </ModalShell>
  );
}

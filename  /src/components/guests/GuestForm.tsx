"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RsvpStatusBadge } from "./RsvpStatusBadge";
import { ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  groupName: string | null;
  isChild: boolean;
  invitedToCeremony: boolean;
  invitedToReception: boolean;
  invitedToAfterparty: boolean;
  notes: string | null;
  rsvpStatus: string;
  isManualOverride: boolean;
  attendingCeremony: boolean | null;
  attendingReception: boolean | null;
  attendingAfterparty: boolean | null;
  attendingCeremonyMaybe: boolean;
  attendingReceptionMaybe: boolean;
  attendingAfterpartyMaybe: boolean;
  mealChoice: string | null;
  dietaryNotes: string | null;
  rsvpToken: string;
  tableId: string | null;
  seatNumber: number | null;
}

interface MealOption {
  id: string;
  name: string;
  course: string | null;
}

interface TableWithGuests {
  id: string;
  name: string;
  capacity: number;
  guests: Array<{ id: string; firstName: string; lastName: string; seatNumber: number | null }>;
}

interface Props {
  guest?: Guest;
  groups: string[];
  mealOptions: MealOption[];
  tableWithGuests?: TableWithGuests | null;
  readOnly?: boolean;
}

const ALL_STATUSES = ["PENDING", "ACCEPTED", "PARTIAL", "DECLINED", "MAYBE"] as const;

export function GuestForm({ guest, groups, mealOptions, tableWithGuests, readOnly = false }: Props) {
  const roCls = readOnly ? "bg-gray-50 cursor-not-allowed opacity-75" : "";
  const router = useRouter();
  const isEdit = !!guest;

  // ── Local guest state — updated after every save so reactive reads stay fresh ──
  const [localGuest, setLocalGuest] = useState<Guest | undefined>(guest);

  // ── Profile fields ────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(guest?.firstName ?? "");
  const [lastName, setLastName] = useState(guest?.lastName ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [groupName, setGroupName] = useState(guest?.groupName ?? "");
  const [isChild, setIsChild] = useState(guest?.isChild ?? false);
  const [ceremony, setCeremony] = useState(guest?.invitedToCeremony ?? true);
  const [reception, setReception] = useState(guest?.invitedToReception ?? true);
  const [afterparty, setAfterparty] = useState(guest?.invitedToAfterparty ?? false);
  const [notes, setNotes] = useState(guest?.notes ?? "");

  // ── Meal fields (edit only, saved via main form) ──────────────────────────
  const [mealChoice, setMealChoice] = useState(guest?.mealChoice ?? "");
  const [dietaryNotes, setDietaryNotes] = useState(guest?.dietaryNotes ?? "");

  // ── Track dirty state for inactivity warning ───────────────────────────────
  const isDirty = useMemo(() => {
    if (isEdit) {
      // Edit mode: compare current values to original
      const g = guest!;
      return (
        firstName !== g.firstName ||
        lastName !== g.lastName ||
        (email || "") !== (g.email || "") ||
        (phone || "") !== (g.phone || "") ||
        (groupName || "") !== (g.groupName || "") ||
        isChild !== g.isChild ||
        ceremony !== g.invitedToCeremony ||
        reception !== g.invitedToReception ||
        afterparty !== g.invitedToAfterparty ||
        (notes || "") !== (g.notes || "") ||
        (mealChoice || "") !== (g.mealChoice || "") ||
        (dietaryNotes || "") !== (g.dietaryNotes || "")
      );
    } else {
      // New guest mode: check if any field has a value
      return (
        firstName !== "" ||
        lastName !== "" ||
        email !== "" ||
        phone !== "" ||
        groupName !== "" ||
        !isChild || // defaults to false, so true is a change
        !ceremony || // defaults to true, so false is a change
        !reception || // defaults to true, so false is a change
        afterparty || // defaults to false, so true is a change
        notes !== ""
      );
    }
  }, [isEdit, guest, firstName, lastName, email, phone, groupName, isChild, ceremony, reception, afterparty, notes, mealChoice, dietaryNotes]);

  // Register dirty state with global context
  const formId = isEdit && guest ? `guest-${guest.id}` : "guest-new";
  const formName = isEdit && guest ? `Guest: ${guest.firstName} ${guest.lastName}` : "New Guest";
  useFormDirtyRegistration(formId, formName, isDirty);

  // ── RSVP override (immediate PATCH, not part of main form save) ───────────
  const [displayStatus, setDisplayStatus] = useState(guest?.rsvpStatus ?? "PENDING");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOverrideOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Sync all form state from a freshly fetched guest record ───────────────
  function syncFromFresh(fresh: Guest) {
    setLocalGuest(fresh);
    setFirstName(fresh.firstName);
    setLastName(fresh.lastName);
    setEmail(fresh.email ?? "");
    setPhone(fresh.phone ?? "");
    setGroupName(fresh.groupName ?? "");
    setIsChild(fresh.isChild);
    setCeremony(fresh.invitedToCeremony);
    setReception(fresh.invitedToReception);
    setAfterparty(fresh.invitedToAfterparty);
    setNotes(fresh.notes ?? "");
    setMealChoice(fresh.mealChoice ?? "");
    setDietaryNotes(fresh.dietaryNotes ?? "");
    setDisplayStatus(fresh.rsvpStatus);
    setDisplaySeat(fresh.seatNumber ?? null);
  }

  async function refetchAndSync() {
    const res = await fetch(`/api/guests/${guest!.id}`, { cache: "no-store" });
    if (res.ok) syncFromFresh(await res.json());
  }

  async function handleOverride(status: string) {
    setOverrideOpen(false);
    setOverriding(true);
    const res = await fetch(`/api/guests/${guest!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvpStatus: status }),
    });
    if (res.ok) {
      await refetchAndSync();
      router.refresh();
    }
    setOverriding(false);
  }

  // ── Seat number (immediate PATCH) ────────────────────────────────────────
  const [displaySeat, setDisplaySeat] = useState<number | null>(guest?.seatNumber ?? null);
  const [seatSaving, setSeatSaving] = useState(false);
  const [seatError, setSeatError] = useState("");

  async function handleSeatChange(val: string) {
    const seat = val === "" ? null : Number(val);
    setSeatSaving(true);
    setSeatError("");
    const res = await fetch(`/api/guests/${guest!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatNumber: seat }),
    });
    setSeatSaving(false);
    if (res.ok) {
      setDisplaySeat(seat);
    } else {
      const d = await res.json();
      setSeatError(d.error ?? "Failed to save seat");
    }
  }

  // ── Resend email ──────────────────────────────────────────────────────────
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null);

  async function handleResendEmail() {
    if (!guest?.email) return;
    if (!window.confirm(`Resend RSVP email to ${guest.email}?`)) return;
    setSendingEmail(true);
    const res = await fetch("/api/email/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId: guest.id }),
    });
    setSendingEmail(false);
    const data = await res.json();
    setEmailToast({ msg: data.message ?? (res.ok ? "Email sent" : "Failed to send"), ok: res.ok });
    setTimeout(() => setEmailToast(null), 4000);
  }

  // ── Copy RSVP link ────────────────────────────────────────────────────────
  async function handleCopyLink() {
    const url = `${window.location.origin}/rsvp/${guest!.rsvpToken}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    } catch {
      // copy failed silently — link visible in input for manual copy
    }
  }

  // ── Main form save ────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaveSuccess(false);

    const payload = {
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
      ...(isEdit ? {
        mealChoice: mealChoice || null,
        dietaryNotes: dietaryNotes || null,
      } : {}),
    };

    const res = await fetch(isEdit ? `/api/guests/${guest.id}` : "/api/guests", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.ok) {
      if (isEdit) {
        // Refetch fresh data and update all form state in place — no navigation
        await refetchAndSync();
        router.refresh();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        // New guest — navigate to list
        router.refresh();
        router.push("/guests");
      }
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to save guest");
    }
  }

  const grouplistId = "group-suggestions";

  const isManualOverride = isEdit && (localGuest?.isManualOverride ?? false);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {readOnly && (
        <ReadOnlyBanner message="You have view-only access to this guest." />
      )}
      {/* Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input
            required
            readOnly={readOnly}
            value={firstName}
            onChange={(e) => !readOnly && setFirstName(e.target.value)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${roCls}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            required
            readOnly={readOnly}
            value={lastName}
            onChange={(e) => !readOnly && setLastName(e.target.value)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${roCls}`}
          />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            readOnly={readOnly}
            onChange={(e) => !readOnly && setEmail(e.target.value)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${roCls}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            readOnly={readOnly}
            value={phone}
            onChange={(e) => !readOnly && setPhone(e.target.value)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${roCls}`}
          />
        </div>
      </div>

      {/* Group + child */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
          <input
            list={grouplistId}
            readOnly={readOnly}
            value={groupName}
            onChange={(e) => !readOnly && setGroupName(e.target.value)}
            placeholder="e.g. Bride's Family"
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${roCls}`}
          />
          <datalist id={grouplistId}>
            {groups.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
        <div className="flex items-center gap-3 pt-7">
          <label className={`flex items-center gap-2 ${readOnly ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              disabled={readOnly}
              checked={isChild}
              onChange={(e) => !readOnly && setIsChild(e.target.checked)}
              className="w-4 h-4 rounded text-primary"
            />
            <span className="text-sm text-gray-700">Is a child</span>
          </label>
        </div>
      </div>

      {/* Invitations */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Invited to</label>
        <div className="flex flex-wrap gap-4">
          {[
            { label: "Ceremony", val: ceremony, set: setCeremony },
            { label: "Reception", val: reception, set: setReception },
            { label: "Afterparty", val: afterparty, set: setAfterparty },
          ].map(({ label, val, set }) => (
            <label key={label} className={`flex items-center gap-2 ${readOnly ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={val}
                onChange={(e) => !readOnly && set(e.target.checked)}
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
          readOnly={readOnly}
          value={notes}
          onChange={(e) => !readOnly && setNotes(e.target.value)}
          rows={2}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none ${roCls}`}
        />
      </div>

      {/* ── RSVP & Meal (edit only) ─────────────────────────────────────────── */}
      {isEdit && (
        <>
          {/* RSVP section */}
          <div className="border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">RSVP &amp; Meal</h3>
              {!readOnly && (
                guest.email ? (
                  <button
                    type="button"
                    onClick={handleResendEmail}
                    disabled={sendingEmail}
                    className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {sendingEmail ? "Sending…" : "Resend RSVP email"}
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">No email on file</span>
                )
              )}
            </div>

            {emailToast && (
              <p className={`text-xs mb-3 px-2 py-1 rounded ${emailToast.ok ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                {emailToast.msg}
              </p>
            )}

            {/* Event responses — read from localGuest so they update after save */}
            {localGuest && (localGuest.invitedToCeremony || localGuest.invitedToReception || localGuest.invitedToAfterparty) && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Event responses</p>
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  {[
                    { label: "Ceremony",          invited: localGuest.invitedToCeremony,   attending: localGuest.attendingCeremony,   maybe: localGuest.attendingCeremonyMaybe },
                    { label: "Wedding reception", invited: localGuest.invitedToReception,  attending: localGuest.attendingReception,  maybe: localGuest.attendingReceptionMaybe },
                    { label: "Afterparty",        invited: localGuest.invitedToAfterparty, attending: localGuest.attendingAfterparty, maybe: localGuest.attendingAfterpartyMaybe },
                  ].filter(e => e.invited).map(({ label, attending, maybe }, i, arr) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between px-3 py-2 text-sm bg-gray-50 ${
                        i < arr.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                    >
                      <span className="text-gray-600">{label}</span>
                      {attending === true  && <span className="text-green-600 font-medium">✓ Attending</span>}
                      {attending === false && <span className="text-red-600 font-medium">✗ Not attending</span>}
                      {attending === null && maybe && <span className="text-amber-600 font-medium">? Maybe</span>}
                      {attending === null && !maybe && <span className="text-gray-400">— Not responded</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overall status + Override */}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Overall status</p>
                <div className="flex items-center gap-2">
                  <RsvpStatusBadge status={displayStatus} />
                  {isManualOverride && (
                    <span
                      title="This status was manually set by an admin and may not reflect the guest's actual RSVP responses"
                      className="flex items-center gap-1 text-xs text-amber-600 cursor-help"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Manually set
                    </span>
                  )}
                </div>
              </div>

              {!readOnly && (
                <div className="relative ml-auto" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setOverrideOpen(o => !o)}
                    disabled={overriding}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {overriding ? "Saving…" : "Override"}
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {overrideOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[150px] py-1">
                      {ALL_STATUSES.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleOverride(s)}
                          className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                            displayStatus === s ? "bg-gray-50" : ""
                          }`}
                        >
                          <RsvpStatusBadge status={s} />
                          {displayStatus === s && <span className="text-gray-400 text-xs ml-auto">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Meal & Dietary section */}
          <div className="border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Meal &amp; Dietary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {reception && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Meal choice</label>
                  <select
                    value={mealChoice}
                    disabled={readOnly}
                    onChange={(e) => !readOnly && setMealChoice(e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary ${roCls}`}
                  >
                    <option value="">— No choice —</option>
                    {mealOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.course ? ` (${m.course})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={!reception ? "sm:col-span-2" : ""}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dietary notes</label>
                <input
                  readOnly={readOnly}
                  value={dietaryNotes}
                  onChange={(e) => !readOnly && setDietaryNotes(e.target.value)}
                  placeholder="Allergies, requirements…"
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${roCls}`}
                />
              </div>
            </div>
          </div>

          {/* Seating section */}
          {tableWithGuests && (
            <div className="border-t border-gray-200 pt-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Seating</h3>
              <p className="text-xs text-gray-500 mb-2">
                Table: <span className="font-medium text-gray-700">{tableWithGuests.name}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seat number</label>
                <select
                  value={displaySeat ?? ""}
                  onChange={(e) => handleSeatChange(e.target.value)}
                  disabled={readOnly || seatSaving}
                  className={`w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 ${readOnly ? roCls : ""}`}
                >
                  <option value="">— Not assigned —</option>
                  {Array.from({ length: tableWithGuests.capacity }, (_, i) => i + 1).map((n) => {
                    const occupant = tableWithGuests.guests.find(
                      (g) => g.seatNumber === n && g.id !== guest!.id
                    );
                    return (
                      <option key={n} value={n} disabled={!!occupant}>
                        Seat {n}{occupant ? ` — ${occupant.firstName} ${occupant.lastName}` : ""}
                      </option>
                    );
                  })}
                </select>
                {seatError && <p className="text-xs text-red-600 mt-1">{seatError}</p>}
                {seatSaving && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
              </div>
            </div>
          )}

          {/* RSVP link section */}
          <div className="border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">RSVP link</h3>
            <div className="flex gap-2">
              <input
                readOnly
                value={typeof window !== "undefined" ? `${window.location.origin}/rsvp/${guest.rsvpToken}` : `/rsvp/${guest.rsvpToken}`}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Changes saved
        </div>
      )}

      <div className="sticky bottom-0 left-0 right-0 flex items-center gap-3 pt-3 pb-2 bg-white border-t border-gray-100 -mx-1 px-1 sm:static sm:border-0 sm:bg-transparent sm:pt-2 sm:pb-0 sm:mx-0 sm:px-0">
        {!readOnly && (
          <button
            type="submit"
            disabled={saving}
            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors min-h-[44px]"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add guest"}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/guests")}
          className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
        >
          {isEdit ? "Back to guests" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

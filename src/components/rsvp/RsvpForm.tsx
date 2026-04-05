"use client";

import { useState } from "react";
import { CheckCircle, Heart, XCircle, HelpCircle } from "lucide-react";
import { getEvents } from "@/lib/eventNames";

type EventChoice = "yes" | "no" | "maybe";

interface MealOption {
  id: string;
  name: string;
  course: string | null;
}

interface EventNamesConfig {
  ceremonyEnabled: boolean;
  ceremonyName: string;
  ceremonyLocation?: string | null;
  mealEnabled: boolean;
  mealName: string;
  mealLocation?: string | null;
  eveningPartyEnabled: boolean;
  eveningPartyName: string;
  eveningPartyLocation?: string | null;
  rehearsalDinnerEnabled: boolean;
  rehearsalDinnerName: string;
  rehearsalDinnerLocation?: string | null;
}

interface GuestRsvpData {
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  rsvpRespondedAt: string | null;
  invitedToCeremony: boolean;
  invitedToReception: boolean;
  invitedToAfterparty: boolean;
  invitedToRehearsalDinner: boolean;
  attendingCeremony: boolean | null;
  attendingReception: boolean | null;
  attendingAfterparty: boolean | null;
  attendingRehearsalDinner: boolean | null;
  attendingCeremonyMaybe: boolean;
  attendingReceptionMaybe: boolean;
  attendingAfterpartyMaybe: boolean;
  attendingRehearsalDinnerMaybe: boolean;
  mealChoice: string | null;
  dietaryNotes: string | null;
}

interface SubmittedSnapshot {
  ceremonyCh: EventChoice | null;
  receptionCh: EventChoice | null;
  afterpartyCh: EventChoice | null;
  rehearsalDinnerCh: EventChoice | null;
  mealChoice: string | null;
}

interface Props {
  token: string;
  guest: GuestRsvpData;
  mealOptions: MealOption[];
  eventNames: EventNamesConfig;
}

function deriveChoice(attending: boolean | null, maybe: boolean): EventChoice | null {
  if (attending === true)  return "yes";
  if (attending === false) return "no";
  if (maybe)               return "maybe";
  return null;
}

export function RsvpForm({ token, guest, mealOptions, eventNames }: Props) {
  const events = getEvents(eventNames);
  const alreadyResponded = guest.rsvpStatus !== "PENDING" && guest.rsvpRespondedAt;

  const [ceremonyCh, setCeremonyCh] = useState<EventChoice>(
    deriveChoice(guest.attendingCeremony, guest.attendingCeremonyMaybe) ?? "yes"
  );
  const [receptionCh, setReceptionCh] = useState<EventChoice>(
    deriveChoice(guest.attendingReception, guest.attendingReceptionMaybe) ?? "yes"
  );
  const [afterpartyCh, setAfterpartyCh] = useState<EventChoice>(
    deriveChoice(guest.attendingAfterparty, guest.attendingAfterpartyMaybe) ?? "yes"
  );
  const [rehearsalDinnerCh, setRehearsalDinnerCh] = useState<EventChoice>(
    deriveChoice(guest.attendingRehearsalDinner, guest.attendingRehearsalDinnerMaybe) ?? "yes"
  );
  const [mealChoice, setMealChoice] = useState(guest.mealChoice ?? "");
  const [dietaryNotes, setDietaryNotes] = useState(guest.dietaryNotes ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState("");
  const [submittedSnapshot, setSubmittedSnapshot] = useState<SubmittedSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If already responded, default to showing confirmation
  const [editing, setEditing] = useState(!alreadyResponded);

  if (submitted || (alreadyResponded && !editing)) {
    const status = submitted ? submittedStatus : guest.rsvpStatus;
    const snap: SubmittedSnapshot = submitted && submittedSnapshot
      ? submittedSnapshot
      : {
          ceremonyCh:   guest.invitedToCeremony   ? (deriveChoice(guest.attendingCeremony,   guest.attendingCeremonyMaybe)   ?? "yes") : null,
          receptionCh:  guest.invitedToReception  ? (deriveChoice(guest.attendingReception,  guest.attendingReceptionMaybe)  ?? "yes") : null,
          afterpartyCh: guest.invitedToAfterparty ? (deriveChoice(guest.attendingAfterparty, guest.attendingAfterpartyMaybe) ?? "yes") : null,
          rehearsalDinnerCh: guest.invitedToRehearsalDinner ? (deriveChoice(guest.attendingRehearsalDinner, guest.attendingRehearsalDinnerMaybe) ?? "yes") : null,
          mealChoice: guest.mealChoice,
        };
    return (
      <ConfirmationScreen
        status={status}
        firstName={guest.firstName}
        guest={guest}
        snap={snap}
        mealOptions={mealOptions}
        eventNames={eventNames}
        onChangeResponse={() => { setEditing(true); setSubmitted(false); }}
      />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload = {
      attendingCeremony:   guest.invitedToCeremony   ? ceremonyCh   : undefined,
      attendingReception:  guest.invitedToReception  ? receptionCh  : undefined,
      attendingAfterparty: guest.invitedToAfterparty ? afterpartyCh : undefined,
      attendingRehearsalDinner: guest.invitedToRehearsalDinner ? rehearsalDinnerCh : undefined,
      mealChoice: mealChoice || null,
      dietaryNotes: dietaryNotes || null,
    };

    const res = await fetch(`/api/rsvp/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setSubmittedStatus(data.rsvpStatus);
      setSubmittedSnapshot({
        ceremonyCh:   guest.invitedToCeremony   ? ceremonyCh   : null,
        receptionCh:  guest.invitedToReception  ? receptionCh  : null,
        afterpartyCh: guest.invitedToAfterparty ? afterpartyCh : null,
        rehearsalDinnerCh: guest.invitedToRehearsalDinner ? rehearsalDinnerCh : null,
        mealChoice: mealChoice || null,
      });
      setSubmitted(true);
    } else {
      setError("Something went wrong. Please try again.");
    }
  }

  // Map event keys to state and setters
  const eventStateMap: Record<string, { val: EventChoice; set: (v: EventChoice) => void; invited: boolean }> = {
    ceremony: { val: ceremonyCh, set: setCeremonyCh, invited: guest.invitedToCeremony },
    meal: { val: receptionCh, set: setReceptionCh, invited: guest.invitedToReception },
    eveningParty: { val: afterpartyCh, set: setAfterpartyCh, invited: guest.invitedToAfterparty },
    rehearsalDinner: { val: rehearsalDinnerCh, set: setRehearsalDinnerCh, invited: guest.invitedToRehearsalDinner },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Per-event attendance */}
      {events.map((event) => {
        const state = eventStateMap[event.key];
        if (!state || !state.invited) return null;
        return (
          <EventToggle
            key={event.key}
            label={event.name}
            location={event.location}
            value={state.val}
            onChange={state.set}
          />
        );
      })}

      {/* Meal choice (only if invited to the meal event) */}
      {guest.invitedToReception && mealOptions.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meal choice</label>
          <select
            value={mealChoice}
            onChange={(e) => setMealChoice(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">— Please select —</option>
            {mealOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.course ? ` (${m.course})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Dietary notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Dietary requirements / allergies
        </label>
        <textarea
          value={dietaryNotes}
          onChange={(e) => setDietaryNotes(e.target.value)}
          rows={2}
          placeholder="Please let us know of any allergies or dietary requirements…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 min-h-[44px] bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {loading ? "Submitting…" : "Send RSVP"}
      </button>
    </form>
  );
}

// ── Confirmation screen ──────────────────────────────────────────────────────

function ConfirmationScreen({
  status,
  firstName,
  guest,
  snap,
  mealOptions,
  eventNames,
  onChangeResponse,
}: {
  status: string;
  firstName: string;
  guest: GuestRsvpData;
  snap: SubmittedSnapshot;
  mealOptions: MealOption[];
  eventNames: EventNamesConfig;
  onChangeResponse: () => void;
}) {
  const eventsConfig = getEvents(eventNames);
  const events = [
    { key: "ceremony" as const, label: eventNames.ceremonyName, invited: guest.invitedToCeremony, choice: snap.ceremonyCh },
    { key: "meal" as const, label: eventNames.mealName, invited: guest.invitedToReception, choice: snap.receptionCh },
    { key: "eveningParty" as const, label: eventNames.eveningPartyName, invited: guest.invitedToAfterparty, choice: snap.afterpartyCh },
    { key: "rehearsalDinner" as const, label: eventNames.rehearsalDinnerName, invited: guest.invitedToRehearsalDinner, choice: snap.rehearsalDinnerCh },
  ].filter(e => e.invited);

  const attendingReception = snap.receptionCh === "yes";
  const mealChoiceId = snap.mealChoice ?? null;
  const mealOption = mealChoiceId ? mealOptions.find(m => m.id === mealChoiceId) : null;
  const mealLabel = mealOption
    ? mealOption.name + (mealOption.course ? ` (${mealOption.course})` : "")
    : null;

  if (status === "DECLINED") {
    return (
      <div className="text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <XCircle className="w-8 h-8 text-gray-400" />
        </div>
        <p className="font-semibold text-gray-900 text-lg">Sorry you can't make it, {firstName}</p>
        <p className="text-sm text-gray-500 mt-1">Thank you for letting us know. We'll miss you!</p>
        <button onClick={onChangeResponse} className="mt-4 text-sm text-primary hover:underline min-h-[44px] px-4">
          Change response
        </button>
      </div>
    );
  }

  if (status === "MAYBE") {
    return (
      <div className="text-center">
        <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <HelpCircle className="w-8 h-8 text-amber-500" />
        </div>
        <p className="font-semibold text-gray-900 text-lg">Thanks for letting us know, {firstName}!</p>
        <p className="text-sm text-gray-500 mt-1">
          We'll keep you posted with any details you might need closer to the day.
        </p>
        <button onClick={onChangeResponse} className="mt-4 text-sm text-primary hover:underline min-h-[44px] px-4">
          Change response
        </button>
      </div>
    );
  }

  if (status === "PARTIAL") {
    return (
      <div className="text-center">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <Heart className="w-8 h-8 text-primary fill-primary/40" />
        </div>
        <p className="font-semibold text-gray-900 text-lg">Thanks for letting us know, {firstName}!</p>

        <div className="mt-4 mb-3 text-left border border-gray-100 rounded-xl overflow-hidden">
          {events.map(({ label, choice }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 even:bg-gray-50">
              <span className="text-sm text-gray-700">{label}</span>
              {choice === "yes" ? (
                <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                  <CheckCircle className="w-4 h-4" /> See you there!
                </span>
              ) : choice === "maybe" ? (
                <span className="flex items-center gap-1 text-sm text-amber-600 font-medium">
                  <HelpCircle className="w-4 h-4" /> Maybe
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-red-500 font-medium">
                  <XCircle className="w-4 h-4" /> Sorry you can't make it
                </span>
              )}
            </div>
          ))}
        </div>

        {attendingReception && mealLabel && (
          <p className="text-sm text-gray-500 mb-3">
            Your meal choice: <span className="font-medium text-gray-700">{mealLabel}</span>
          </p>
        )}

        <p className="text-sm text-gray-500">
          We look forward to celebrating with you for the parts you can make!
        </p>
        <button onClick={onChangeResponse} className="mt-4 text-sm text-primary hover:underline min-h-[44px] px-4">
          Change response
        </button>
      </div>
    );
  }

  // ACCEPTED (or single-event accepted)
  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <CheckCircle className="w-8 h-8 text-green-500" />
      </div>
      <p className="font-semibold text-gray-900 text-lg">See you there, {firstName}!</p>
      <p className="text-sm text-gray-500 mt-1">
        Thank you for your RSVP. We can't wait to celebrate with you!
      </p>
      {attendingReception && mealLabel && (
        <p className="text-sm text-gray-500 mt-2">
          Your meal choice: <span className="font-medium text-gray-700">{mealLabel}</span>
        </p>
      )}
      <button onClick={onChangeResponse} className="mt-4 text-sm text-primary hover:underline">
        Change response
      </button>
    </div>
  );
}

// ── Event toggle ──────────────────────────────────────────────────────────────

function EventToggle({
  label,
  location,
  value,
  onChange,
}: {
  label: string;
  location?: string | null;
  value: EventChoice;
  onChange: (v: EventChoice) => void;
}) {
  const options: { label: string; val: EventChoice }[] = [
    { label: "Yes, I'll be there", val: "yes" },
    { label: "Maybe",              val: "maybe" },
    { label: "Sorry, can't make it", val: "no" },
  ];

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-0.5">{label}</p>
      {location && <p className="text-xs text-gray-400 mb-2">{location}</p>}
      {!location && <div className="mb-2" />}
      <div className="flex gap-2">
        {options.map(({ label: lbl, val }) => (
          <button
            key={val}
            type="button"
            onClick={() => onChange(val)}
            className={`flex-1 py-3 min-h-[44px] rounded-xl border text-sm font-medium transition-colors ${
              value === val
                ? val === "yes"
                  ? "border-green-500 bg-green-50 text-green-700"
                  : val === "maybe"
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-red-400 bg-red-50 text-red-700"
                : "border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

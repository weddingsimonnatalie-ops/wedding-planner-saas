"use client";

import { useState } from "react";
import { CheckCircle, Heart, XCircle } from "lucide-react";
import { getEvents, type EventConfig } from "@/lib/eventNames";

type EventChoice = "yes" | "no";

interface MealOption {
  id: string;
  eventId: string;
  name: string;
  course: string | null;
}

interface EventNamesConfig {
  ceremonyEnabled: boolean;
  ceremonyName: string;
  ceremonyLocation?: string | null;
  ceremonyMealsEnabled?: boolean;
  mealEnabled: boolean;
  mealName: string;
  mealLocation?: string | null;
  mealMealsEnabled?: boolean;
  eveningPartyEnabled: boolean;
  eveningPartyName: string;
  eveningPartyLocation?: string | null;
  eveningPartyMealsEnabled?: boolean;
  rehearsalDinnerEnabled: boolean;
  rehearsalDinnerName: string;
  rehearsalDinnerLocation?: string | null;
  rehearsalDinnerMealsEnabled?: boolean;
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
  mealChoice: string | null;
  dietaryNotes: string | null;
}

interface SubmittedSnapshot {
  ceremonyCh: EventChoice | null;
  receptionCh: EventChoice | null;
  afterpartyCh: EventChoice | null;
  rehearsalDinnerCh: EventChoice | null;
  mealChoices: Record<string, string | null>;
}

interface Props {
  token: string;
  guest: GuestRsvpData;
  mealOptions: MealOption[];
  eventNames: EventNamesConfig;
  mealChoicesByEvent: Record<string, string | null>;
}

function deriveChoice(attending: boolean | null): EventChoice | null {
  if (attending === true)  return "yes";
  if (attending === false) return "no";
  return null;
}

export function RsvpForm({ token, guest, mealOptions, eventNames, mealChoicesByEvent }: Props) {
  const events = getEvents(eventNames);
  const alreadyResponded = guest.rsvpStatus !== "PENDING" && guest.rsvpRespondedAt;

  const [ceremonyCh, setCeremonyCh] = useState<EventChoice>(
    deriveChoice(guest.attendingCeremony) ?? "yes"
  );
  const [receptionCh, setReceptionCh] = useState<EventChoice>(
    deriveChoice(guest.attendingReception) ?? "yes"
  );
  const [afterpartyCh, setAfterpartyCh] = useState<EventChoice>(
    deriveChoice(guest.attendingAfterparty) ?? "yes"
  );
  const [rehearsalDinnerCh, setRehearsalDinnerCh] = useState<EventChoice>(
    deriveChoice(guest.attendingRehearsalDinner) ?? "yes"
  );

  // Per-event meal choices
  const [mealChoices, setMealChoices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    // Initialize from existing choices or fall back to legacy mealChoice for "meal" event
    for (const event of events) {
      if (event.mealsEnabled) {
        const existing = mealChoicesByEvent[event.key];
        if (existing) {
          initial[event.key] = existing;
        } else if (event.key === "meal" && guest.mealChoice) {
          // Legacy: fall back to old mealChoice field for meal event
          initial[event.key] = guest.mealChoice;
        }
      }
    }
    return initial;
  });

  const [dietaryNotes, setDietaryNotes] = useState(guest.dietaryNotes ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState("");
  const [submittedSnapshot, setSubmittedSnapshot] = useState<SubmittedSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If already responded, default to showing confirmation
  const [editing, setEditing] = useState(!alreadyResponded);

  // Get meal options for a specific event
  function getMealOptionsForEvent(eventId: string): MealOption[] {
    return mealOptions.filter((m) => m.eventId === eventId);
  }

  // Map event keys to dbField for invitations
  const eventInviteMap: Record<string, boolean> = {
    ceremony: guest.invitedToCeremony,
    meal: guest.invitedToReception,
    eveningParty: guest.invitedToAfterparty,
    rehearsalDinner: guest.invitedToRehearsalDinner,
  };

  // Map event keys to attendance choices
  const eventStateMap: Record<string, { val: EventChoice; set: (v: EventChoice) => void }> = {
    ceremony: { val: ceremonyCh, set: setCeremonyCh },
    meal: { val: receptionCh, set: setReceptionCh },
    eveningParty: { val: afterpartyCh, set: setAfterpartyCh },
    rehearsalDinner: { val: rehearsalDinnerCh, set: setRehearsalDinnerCh },
  };

  if (submitted || (alreadyResponded && !editing)) {
    const status = submitted ? submittedStatus : guest.rsvpStatus;
    const snap: SubmittedSnapshot = submitted && submittedSnapshot
      ? submittedSnapshot
      : {
          ceremonyCh: guest.invitedToCeremony ? (deriveChoice(guest.attendingCeremony) ?? "yes") : null,
          receptionCh: guest.invitedToReception ? (deriveChoice(guest.attendingReception) ?? "yes") : null,
          afterpartyCh: guest.invitedToAfterparty ? (deriveChoice(guest.attendingAfterparty) ?? "yes") : null,
          rehearsalDinnerCh: guest.invitedToRehearsalDinner ? (deriveChoice(guest.attendingRehearsalDinner) ?? "yes") : null,
          mealChoices: mealChoicesByEvent,
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
      attendingCeremony: guest.invitedToCeremony ? ceremonyCh : undefined,
      attendingReception: guest.invitedToReception ? receptionCh : undefined,
      attendingAfterparty: guest.invitedToAfterparty ? afterpartyCh : undefined,
      attendingRehearsalDinner: guest.invitedToRehearsalDinner ? rehearsalDinnerCh : undefined,
      mealChoices, // Per-event meal choices
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
        ceremonyCh: guest.invitedToCeremony ? ceremonyCh : null,
        receptionCh: guest.invitedToReception ? receptionCh : null,
        afterpartyCh: guest.invitedToAfterparty ? afterpartyCh : null,
        rehearsalDinnerCh: guest.invitedToRehearsalDinner ? rehearsalDinnerCh : null,
        mealChoices,
      });
      setSubmitted(true);
    } else {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Per-event attendance */}
      {events.map((event) => {
        const state = eventStateMap[event.key];
        const invited = eventInviteMap[event.key];
        if (!state || !invited) return null;

        const mealOptionsForEvent = event.mealsEnabled ? getMealOptionsForEvent(event.key) : [];
        const attending = state.val === "yes";

        return (
          <div key={event.key} className="space-y-3">
            <EventToggle
              label={event.name}
              location={event.location}
              value={state.val}
              onChange={state.set}
            />

            {/* Meal choice for this event if meals enabled and attending */}
            {attending && mealOptionsForEvent.length > 0 && (
              <div className="ml-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {event.name} meal choice
                </label>
                <select
                  value={mealChoices[event.key] || ""}
                  onChange={(e) => setMealChoices((prev) => ({ ...prev, [event.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Please select —</option>
                  {mealOptionsForEvent.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.course ? ` (${m.course})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}

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

  // Get meal labels for each event
  const getMealLabel = (eventKey: string): string | null => {
    const mealChoiceId = snap.mealChoices[eventKey];
    if (!mealChoiceId) return null;
    const mealOption = mealOptions.find((m) => m.id === mealChoiceId);
    if (!mealOption) return null;
    return mealOption.name + (mealOption.course ? ` (${mealOption.course})` : "");
  };

  // Check if any events have meal choices
  const hasMealChoices = events.some((e) => {
    const eventConfig = eventsConfig.find((ec) => ec.key === e.key);
    return eventConfig?.mealsEnabled && snap.mealChoices[e.key];
  });

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

  if (status === "PARTIAL") {
    return (
      <div className="text-center">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <Heart className="w-8 h-8 text-primary fill-primary/40" />
        </div>
        <p className="font-semibold text-gray-900 text-lg">Thanks for letting us know, {firstName}!</p>

        <div className="mt-4 mb-3 text-left border border-gray-100 rounded-xl overflow-hidden">
          {events.map(({ key, label, choice }) => {
            const eventConfig = eventsConfig.find((ec) => ec.key === key);
            const mealLabel = eventConfig?.mealsEnabled && choice === "yes" ? getMealLabel(key) : null;
            return (
              <div key={key} className="px-4 py-2.5 even:bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{label}</span>
                  {choice === "yes" ? (
                    <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                      <CheckCircle className="w-4 h-4" /> See you there!
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm text-red-500 font-medium">
                      <XCircle className="w-4 h-4" /> Sorry you can't make it
                    </span>
                  )}
                </div>
                {mealLabel && (
                  <p className="text-xs text-gray-500 mt-1 ml-0">Meal: {mealLabel}</p>
                )}
              </div>
            );
          })}
        </div>

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

      {/* Show all meal choices */}
      {hasMealChoices && (
        <div className="mt-3 text-left">
          {events.map(({ key, label, choice }) => {
            const eventConfig = eventsConfig.find((ec) => ec.key === key);
            const mealLabel = eventConfig?.mealsEnabled && choice === "yes" ? getMealLabel(key) : null;
            if (!mealLabel) return null;
            return (
              <p key={key} className="text-sm text-gray-500">
                {label} meal: <span className="font-medium text-gray-700">{mealLabel}</span>
              </p>
            );
          })}
        </div>
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
    { label: "Yes, I'll be there",   val: "yes" },
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
/**
 * Calculates rsvpStatus from a guest's per-event attending answers.
 *
 * Per-event state:
 *   attending=true                  → yes
 *   attending=false                 → no
 *   attending=null, maybeX=true     → maybe
 *   attending=null, maybeX=false    → unanswered
 *
 * Overall status:
 *   All yes                         → ACCEPTED
 *   All no                          → DECLINED
 *   All maybe                       → MAYBE
 *   All unanswered                  → PENDING
 *   Any mix                         → PARTIAL
 *
 * Events the guest is not invited to are excluded entirely.
 * Maybe params default to false so existing call sites don't need updating.
 */
export function calculateRsvpStatus(
  invitedToCeremony: boolean,
  invitedToReception: boolean,
  invitedToAfterparty: boolean,
  invitedToRehearsalDinner: boolean,
  attendingCeremony: boolean | null,
  attendingReception: boolean | null,
  attendingAfterparty: boolean | null,
  attendingRehearsalDinner: boolean | null,
  attendingCeremonyMaybe = false,
  attendingReceptionMaybe = false,
  attendingAfterpartyMaybe = false,
  attendingRehearsalDinnerMaybe = false,
): string {
  type State = "yes" | "no" | "maybe" | "unanswered";

  function classify(attending: boolean | null, maybe: boolean): State {
    if (attending === true)  return "yes";
    if (attending === false) return "no";
    if (maybe)               return "maybe";
    return "unanswered";
  }

  const states: State[] = [];
  if (invitedToCeremony)        states.push(classify(attendingCeremony,   attendingCeremonyMaybe));
  if (invitedToReception)       states.push(classify(attendingReception,  attendingReceptionMaybe));
  if (invitedToAfterparty)      states.push(classify(attendingAfterparty, attendingAfterpartyMaybe));
  if (invitedToRehearsalDinner) states.push(classify(attendingRehearsalDinner, attendingRehearsalDinnerMaybe));

  if (states.length === 0)                     return "PENDING";
  if (states.every(s => s === "unanswered"))   return "PENDING";
  if (states.every(s => s === "yes"))          return "ACCEPTED";
  if (states.every(s => s === "no"))           return "DECLINED";
  if (states.every(s => s === "maybe"))        return "MAYBE";
  return "PARTIAL";
}

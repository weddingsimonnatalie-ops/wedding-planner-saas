/**
 * Calculates rsvpStatus from a guest's per-event attending answers.
 *
 * Per-event state:
 *   attending=true   → yes
 *   attending=false  → no
 *   attending=null   → unanswered
 *
 * Overall status:
 *   All yes          → ACCEPTED
 *   All no           → DECLINED
 *   All unanswered   → PENDING
 *   Any mix          → PARTIAL
 *
 * Events the guest is not invited to are excluded entirely.
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
): string {
  type State = "yes" | "no" | "unanswered";

  function classify(attending: boolean | null): State {
    if (attending === true)  return "yes";
    if (attending === false) return "no";
    return "unanswered";
  }

  const states: State[] = [];
  if (invitedToCeremony)        states.push(classify(attendingCeremony));
  if (invitedToReception)       states.push(classify(attendingReception));
  if (invitedToAfterparty)      states.push(classify(attendingAfterparty));
  if (invitedToRehearsalDinner) states.push(classify(attendingRehearsalDinner));

  if (states.length === 0)                    return "PENDING";
  if (states.every(s => s === "unanswered"))  return "PENDING";
  if (states.every(s => s === "yes"))         return "ACCEPTED";
  if (states.every(s => s === "no"))          return "DECLINED";
  return "PARTIAL";
}

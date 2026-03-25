export type TableShape = "ROUND" | "RECTANGULAR" | "OVAL";

export type Orientation = "HORIZONTAL" | "VERTICAL";

export interface GuestSummary {
  id: string;
  firstName: string;
  lastName: string;
  groupName: string | null;
  rsvpStatus: string;
  mealChoice: string | null;
  invitedToCeremony: boolean;
  invitedToReception: boolean;
  invitedToAfterparty: boolean;
  attendingReception: boolean | null;
  seatNumber: number | null;
}

/**
 * Guest is eligible for a reception seat if:
 *   - invited to reception, AND
 *   - has not declined (attendingReception !== false), OR admin has overridden to ACCEPTED/PARTIAL
 */
export function isReceptionEligible(g: GuestSummary): boolean {
  if (!g.invitedToReception) return false;
  if (g.rsvpStatus === "ACCEPTED" || g.rsvpStatus === "PARTIAL") return true;
  return g.attendingReception !== false;
}

export interface TableWithGuests {
  id: string;
  roomId: string;
  name: string;
  shape: TableShape;
  capacity: number;
  positionX: number;
  positionY: number;
  rotation: number;
  width: number;
  height: number;
  locked: boolean;
  colour: string;
  orientation: Orientation;
  notes: string | null;
  guests: GuestSummary[];
}

export interface RoomElement {
  id: string;
  type: string;
  label: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  locked: boolean;
}

export interface Room {
  id: string;
  name: string;
  widthMetres: number;
  heightMetres: number;
  elements: RoomElement[];
}

export interface MealOptionSummary {
  id: string;
  name: string;
}

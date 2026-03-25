"use client";

import { Orientation } from "@prisma/client";

interface SeatGuest {
  seatNumber: number;
  guestId: string | null;
  guestName: string | null;
}

interface PlanTableBlockProps {
  table: {
    id: string;
    name: string;
    capacity: number;
    orientation: Orientation;
    guests: Array<{
      id: string;
      firstName: string;
      lastName: string;
      seatNumber: number | null;
    }>;
  };
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onToggleOrientation: () => void;
  onSeatClick: (seatNumber: number) => void;
  onRename: (name: string) => void;
}

// Calculate seat positions (1 to capacity)
function getSeatsWithGuests(capacity: number, guests: PlanTableBlockProps["table"]["guests"]): SeatGuest[] {
  const seats: SeatGuest[] = [];
  const guestMap = new Map(guests.map((g) => [g.seatNumber, g]));

  for (let i = 1; i <= capacity; i++) {
    const guest = guestMap.get(i);
    seats.push({
      seatNumber: i,
      guestId: guest?.id ?? null,
      guestName: guest ? `${guest.firstName} ${guest.lastName}` : null,
    });
  }

  return seats;
}

export function PlanTableBlock({
  table,
  x,
  y,
  selected,
  onSelect,
  onDragEnd,
  onToggleOrientation,
  onSeatClick,
  onRename,
}: PlanTableBlockProps) {
  const seats = getSeatsWithGuests(table.capacity, table.guests);
  const isHorizontal = table.orientation === "HORIZONTAL";

  // Cell dimensions
  const CELL_PADDING = 8;
  const CELL_HEIGHT = 24;
  const SEAT_COL_WIDTH = 60;
  const GUEST_COL_WIDTH = isHorizontal ? 100 : 120;
  const HEADER_HEIGHT = 32;
  const ORIENTATION_BADGE_WIDTH = 24;

  // Calculate table dimensions based on orientation
  const width = isHorizontal
    ? Math.max(SEAT_COL_WIDTH + GUEST_COL_WIDTH, SEAT_COL_WIDTH * seats.length + GUEST_COL_WIDTH)
    : SEAT_COL_WIDTH + GUEST_COL_WIDTH + ORIENTATION_BADGE_WIDTH;

  const height = isHorizontal
    ? HEADER_HEIGHT + CELL_HEIGHT * 2 // Header + seat row + guest row
    : HEADER_HEIGHT + CELL_HEIGHT * seats.length;

  const actualWidth = isHorizontal
    ? Math.max(160, 60 * seats.length + 80)
    : 180;

  return (
    <div
      className={`absolute bg-white border-2 rounded shadow-md select-none ${
        selected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-400"
      }`}
      style={{
        left: x,
        top: y,
        width: actualWidth,
        cursor: "move",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Header with table name and orientation badge */}
      <div
        className="flex items-center justify-between px-2 py-1 bg-gray-100 border-b border-gray-300 rounded-t"
        onDoubleClick={(e) => {
          e.stopPropagation();
          const newName = window.prompt("Enter table name:", table.name);
          if (newName && newName.trim()) {
            onRename(newName.trim());
          }
        }}
      >
        <span className="font-semibold text-sm truncate flex-1">{table.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleOrientation();
          }}
          className="ml-2 px-1.5 py-0.5 text-xs font-medium rounded bg-gray-200 hover:bg-gray-300"
          title={`Orientation: ${isHorizontal ? "Horizontal" : "Vertical"}. Click to toggle.`}
        >
          {isHorizontal ? "H" : "V"}
        </button>
      </div>

      {/* Content based on orientation */}
      {isHorizontal ? (
        // Horizontal: seat numbers as columns, guest names below
        <div className="p-1">
          <div className="flex">
            {seats.map((seat) => (
              <div
                key={seat.seatNumber}
                className="flex-shrink-0 text-center"
                style={{ width: `${100 / Math.max(seats.length, 1)}%`, minWidth: 40 }}
              >
                <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200">
                  {seat.seatNumber}
                </div>
                <div
                  className="text-xs border border-gray-200 cursor-pointer hover:bg-blue-50 truncate px-1"
                  onClick={() => onSeatClick(seat.seatNumber)}
                  title={seat.guestName || "Empty seat"}
                >
                  {seat.guestName || <span className="text-gray-300">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Vertical: seat numbers as rows, guest names to the right
        <div className="divide-y divide-gray-200">
          {seats.map((seat) => (
            <div
              key={seat.seatNumber}
              className="flex items-center hover:bg-gray-50"
            >
              <div className="w-8 text-xs text-gray-500 text-center border-r border-gray-200 bg-gray-50">
                {seat.seatNumber}
              </div>
              <div
                className="flex-1 text-xs px-2 py-1 cursor-pointer hover:bg-blue-50 truncate"
                onClick={() => onSeatClick(seat.seatNumber)}
                title={seat.guestName || "Empty seat"}
              >
                {seat.guestName || <span className="text-gray-300 italic">Empty</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
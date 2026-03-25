"use client";

export interface PrintGuest {
  id: string;
  firstName: string;
  lastName: string;
  seatNumber: number | null;
  mealChoice: string | null;
}

export interface TableBlockData {
  id: string;
  name: string;
  capacity: number;
  guests: PrintGuest[];
}

interface PrintTableBlockProps {
  table: TableBlockData;
  orientation: "horizontal" | "vertical";
  showSeatNumbers: boolean;
  showLastName: boolean;
  showMealChoices: boolean;
  fontSize: "small" | "medium" | "large";
}

const fontSizeClasses = {
  small: { name: "text-sm", guest: "text-xs" },
  medium: { name: "text-base", guest: "text-sm" },
  large: { name: "text-lg", guest: "text-base" },
};

export function PrintTableBlock({
  table,
  orientation,
  showSeatNumbers,
  showLastName,
  showMealChoices,
  fontSize,
}: PrintTableBlockProps) {
  const sizes = fontSizeClasses[fontSize];
  const guests = table.guests;

  if (orientation === "horizontal") {
    // Horizontal: table name at top, guests in columns below
    // Calculate column count based on guest count
    const colCount = guests.length > 12 ? 3 : guests.length > 6 ? 2 : 1;

    return (
      <div className="border-2 border-gray-800 rounded-lg p-3 break-inside-avoid bg-white">
        {/* Table name header */}
        <div className={`${sizes.name} font-bold text-center mb-2 pb-2 border-b border-gray-300`}>
          {table.name}
          <span className="font-normal text-gray-500 ml-2">
            ({guests.length}/{table.capacity})
          </span>
        </div>

        {/* Guests in columns */}
        {guests.length > 0 ? (
          <div
            className="grid gap-x-4 gap-y-1"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            {guests.map((guest) => (
              <div key={guest.id} className={`${sizes.guest} flex items-start gap-1`}>
                {showSeatNumbers && guest.seatNumber !== null && (
                  <span className="text-gray-500 shrink-0">{guest.seatNumber}.</span>
                )}
                <span className="truncate">
                  {guest.firstName}{showLastName ? ` ${guest.lastName}` : ""}
                </span>
                {showMealChoices && guest.mealChoice && (
                  <span className="text-gray-400 text-[0.7em] ml-1">
                    ({guest.mealChoice})
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={`${sizes.guest} text-gray-400 italic text-center`}>No guests assigned</div>
        )}
      </div>
    );
  }

  // Vertical: table name on left, guests in single column on right
  return (
    <div className="border-2 border-gray-800 rounded-lg p-3 break-inside-avoid bg-white flex">
      {/* Table name on left */}
      <div className={`${sizes.name} font-bold pr-3 border-r border-gray-300 flex flex-col justify-center min-w-[80px]`}>
        <div>{table.name}</div>
        <div className="font-normal text-gray-500 text-sm">
          {guests.length}/{table.capacity}
        </div>
      </div>

      {/* Guests on right */}
      <div className="flex-1 pl-3">
        {guests.length > 0 ? (
          <div className="space-y-1">
            {guests.map((guest) => (
              <div key={guest.id} className={`${sizes.guest} flex items-start gap-1`}>
                {showSeatNumbers && guest.seatNumber !== null && (
                  <span className="text-gray-500 shrink-0 w-5">{guest.seatNumber}.</span>
                )}
                <span className="truncate">
                  {guest.firstName}{showLastName ? ` ${guest.lastName}` : ""}
                </span>
                {showMealChoices && guest.mealChoice && (
                  <span className="text-gray-400 text-[0.7em] ml-1">
                    ({guest.mealChoice})
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={`${sizes.guest} text-gray-400 italic`}>No guests</div>
        )}
      </div>
    </div>
  );
}
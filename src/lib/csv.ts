export interface CsvGuestRow {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  groupName?: string;
  isChild: boolean;
  invitedToCeremony: boolean;
  invitedToReception: boolean;
  invitedToAfterparty: boolean;
  invitedToRehearsalDinner: boolean;
  notes?: string;
}

export interface CsvParseResult {
  rows: (CsvGuestRow & { _error?: string; _line: number })[];
  errors: string[];
}

function parseBool(val: string | undefined, defaultVal = true): boolean {
  if (!val) return defaultVal;
  return !["n", "no", "false", "0"].includes(val.trim().toLowerCase());
}

/** Parse a CSV string. First row must be a header row. */
export function parseGuestCsv(content: string): CsvParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV file has no data rows"] };
  }

  // Parse header
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const rows: CsvParseResult["rows"] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const vals = splitCsvLine(lines[i]);

    const firstName = vals[col("first name")] ?? vals[col("firstname")] ?? "";
    const lastName = vals[col("last name")] ?? vals[col("lastname")] ?? "";

    if (!firstName.trim() || !lastName.trim()) {
      rows.push({
        firstName,
        lastName,
        isChild: false,
        invitedToCeremony: true,
        invitedToReception: true,
        invitedToAfterparty: false,
        invitedToRehearsalDinner: false,
        _error: "First name and last name are required",
        _line: lineNum,
      });
      continue;
    }

    rows.push({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: vals[col("email")]?.trim() || undefined,
      phone: vals[col("phone")]?.trim() || undefined,
      groupName: vals[col("group name")] || vals[col("group")] || undefined,
      isChild: parseBool(vals[col("is child")] ?? vals[col("child")], false),
      invitedToCeremony: parseBool(vals[col("ceremony")] ?? vals[col("invited to ceremony")], true),
      invitedToReception: parseBool(vals[col("reception")] ?? vals[col("invited to reception")], true),
      invitedToAfterparty: parseBool(vals[col("afterparty")] ?? vals[col("invited to afterparty")], false),
      invitedToRehearsalDinner: parseBool(vals[col("rehearsal dinner")] ?? vals[col("rehearsal")], false),
      notes: vals[col("notes")]?.trim() || undefined,
      _line: lineNum,
    });
  }

  return { rows, errors };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export const CSV_TEMPLATE_HEADERS =
  "First Name,Last Name,Email,Phone,Group Name,Is Child,Ceremony,Reception,Afterparty,Rehearsal Dinner,Notes\n";

export function guestsToCsv(
  guests: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    groupName?: string | null;
    isChild: boolean;
    invitedToCeremony: boolean;
    invitedToReception: boolean;
    invitedToAfterparty: boolean;
    invitedToRehearsalDinner: boolean;
    rsvpStatus: string;
    mealChoice?: string | null;
    dietaryNotes?: string | null;
    notes?: string | null;
    table?: { name: string } | null;
  }[]
): string {
  const header =
    "First Name,Last Name,Email,Phone,Group Name,Is Child,Ceremony,Reception,Afterparty,Rehearsal Dinner,RSVP Status,Meal Choice,Dietary Notes,Table,Notes";
  const rows = guests.map((g) =>
    [
      g.firstName,
      g.lastName,
      g.email ?? "",
      g.phone ?? "",
      g.groupName ?? "",
      g.isChild ? "y" : "n",
      g.invitedToCeremony ? "y" : "n",
      g.invitedToReception ? "y" : "n",
      g.invitedToAfterparty ? "y" : "n",
      g.invitedToRehearsalDinner ? "y" : "n",
      g.rsvpStatus,
      g.mealChoice ?? "",
      g.dietaryNotes ?? "",
      g.table?.name ?? "",
      g.notes ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

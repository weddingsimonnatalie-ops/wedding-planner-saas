export interface CsvSupplierRow {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  category?: string;
  status: string;
  contractValue?: number;
  contractSigned: boolean;
  notes?: string;
}

export interface CsvParseResult {
  rows: (CsvSupplierRow & { _error?: string; _line: number })[];
  errors: string[];
}

const VALID_STATUSES = ["ENQUIRY", "QUOTED", "BOOKED", "CANCELLED", "COMPLETE"];

function parseStatus(val: string | undefined): string {
  if (!val) return "ENQUIRY";
  const upper = val.trim().toUpperCase();
  if (VALID_STATUSES.includes(upper)) return upper;
  // Accept lowercase/common variants
  const map: Record<string, string> = {
    enquiry: "ENQUIRY",
    inquiry: "ENQUIRY",
    quoted: "QUOTED",
    quote: "QUOTED",
    booked: "BOOKED",
    canceled: "CANCELLED",
    cancelled: "CANCELLED",
    complete: "COMPLETE",
    completed: "COMPLETE",
  };
  return map[val.trim().toLowerCase()] ?? "ENQUIRY";
}

function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (!val) return defaultVal;
  return !["n", "no", "false", "0"].includes(val.trim().toLowerCase());
}

function parseNumber(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/** Parse a CSV string. First row must be a header row. */
export function parseSupplierCsv(content: string): CsvParseResult {
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

    const name = vals[col("name")] ?? vals[col("supplier name")] ?? vals[col("supplier")] ?? "";

    if (!name.trim()) {
      rows.push({
        name,
        status: "ENQUIRY",
        contractSigned: false,
        _error: "Supplier name is required",
        _line: lineNum,
      });
      continue;
    }

    rows.push({
      name: name.trim(),
      contactName: vals[col("contact name")] ?? (vals[col("contact")]?.trim() || undefined),
      email: vals[col("email")]?.trim() || undefined,
      phone: vals[col("phone")]?.trim() || undefined,
      website: vals[col("website")]?.trim() || undefined,
      category: vals[col("category")]?.trim() || undefined,
      status: parseStatus(vals[col("status")]),
      contractValue: parseNumber(vals[col("contract value")] ?? vals[col("value")] ?? vals[col("amount")]),
      contractSigned: parseBool(vals[col("contract signed")] ?? vals[col("signed")], false),
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
  "Name,Contact Name,Email,Phone,Website,Category,Status,Contract Value,Contract Signed,Notes\n";

export const CSV_TEMPLATE_EXAMPLE =
  "Acme Photography,John Smith,john@acme.co,07123456789,https://acme.co,Photography,Booked,1500.00,y,Deposit paid\n";

export function suppliersToCsv(
  suppliers: {
    name: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    category?: { name: string } | null;
    status: string;
    contractValue?: number | null;
    contractSigned: boolean;
    notes?: string | null;
  }[]
): string {
  const header =
    "Name,Contact Name,Email,Phone,Website,Category,Status,Contract Value,Contract Signed,Notes";
  const rows = suppliers.map((s) =>
    [
      s.name,
      s.contactName ?? "",
      s.email ?? "",
      s.phone ?? "",
      s.website ?? "",
      s.category?.name ?? "",
      s.status,
      s.contractValue != null ? String(s.contractValue) : "",
      s.contractSigned ? "y" : "n",
      s.notes ?? "",
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
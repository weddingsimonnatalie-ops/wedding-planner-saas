"use client";

import { useState, useRef, useEffect } from "react";
import { Printer, ChevronDown } from "lucide-react";
import { fetchApi } from "@/lib/fetch";

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  groupName: string | null;
  isChild: boolean;
  rsvpStatus: string;
  invitedToCeremony: boolean;
  invitedToReception: boolean;
  invitedToAfterparty: boolean;
  attendingCeremony: boolean | null;
  attendingReception: boolean | null;
  attendingAfterparty: boolean | null;
  mealChoice: string | null;
  dietaryNotes: string | null;
  seatNumber: number | null;
  table: { name: string } | null;
}

interface WeddingConfig {
  coupleName: string;
  weddingDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
}

interface MealOption {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACCEPTED: "#16a34a",
  PARTIAL: "#ea580c",
  DECLINED: "#dc2626",
  PENDING: "#d97706",
  MAYBE: "#6b7280",
};

function formatWeddingDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPrintedDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function eventTick(invited: boolean, attending: boolean | null): string {
  if (!invited) return "";
  if (attending === true) return "✓";
  if (attending === false) return "✗";
  return "?";
}

function generateFullGuestListHtml(
  guests: Guest[],
  config: WeddingConfig,
  mealMap: Record<string, string>
): string {
  const sorted = [...guests].sort((a, b) => {
    const ln = a.lastName.localeCompare(b.lastName);
    if (ln !== 0) return ln;
    return a.firstName.localeCompare(b.firstName);
  });

  // Group by first letter of last name
  const groups = new Map<string, Guest[]>();
  for (const g of sorted) {
    const letter = g.lastName[0]?.toUpperCase() ?? "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(g);
  }

  let bodyHtml = "";
  for (const [letter, letterGuests] of Array.from(groups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    bodyHtml += `<div class="letter-heading">${letter}</div>`;
    for (const g of letterGuests) {
      const statusColor = STATUS_COLORS[g.rsvpStatus] ?? "#6b7280";
      const name = `${g.lastName}, ${g.firstName}${g.isChild ? " <span class=\"child\">(child)</span>" : ""}`;

      const eventParts: string[] = [];
      if (g.invitedToCeremony) eventParts.push(`Ceremony ${eventTick(g.invitedToCeremony, g.attendingCeremony)}`);
      if (g.invitedToReception) eventParts.push(`Reception ${eventTick(g.invitedToReception, g.attendingReception)}`);
      if (g.invitedToAfterparty) eventParts.push(`Afterparty ${eventTick(g.invitedToAfterparty, g.attendingAfterparty)}`);

      const mealName = g.invitedToReception && g.mealChoice ? (mealMap[g.mealChoice] ?? g.mealChoice) : null;
      const seatInfo = g.table
        ? `${g.table.name}${g.seatNumber ? ` Seat ${g.seatNumber}` : ""}`
        : null;

      bodyHtml += `
        <div class="guest">
          <div class="guest-top">
            <span class="guest-name">${name}</span>
            <span class="guest-group">${g.groupName ?? ""}</span>
            <span class="guest-status" style="color:${statusColor}">${g.rsvpStatus[0] + g.rsvpStatus.slice(1).toLowerCase()}</span>
          </div>
          <div class="guest-events">${eventParts.join("&nbsp;&nbsp;")}</div>
          ${mealName || seatInfo ? `<div class="guest-meta">${[
            mealName ? `Meal: ${mealName}` : "",
            seatInfo ? `Table: ${seatInfo}` : "",
          ].filter(Boolean).join("&ensp;·&ensp;")}</div>` : ""}
          ${g.dietaryNotes ? `<div class="guest-dietary">Dietary: ${g.dietaryNotes}</div>` : ""}
        </div>`;
    }
  }

  const dateStr = formatWeddingDate(config.weddingDate);
  const venueStr = config.venueName ?? "";
  const subtitle = [dateStr, venueStr].filter(Boolean).join(" — ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Guest List — ${config.coupleName}</title>
  <style>
    @page { size: A4 landscape; margin: 1.5cm 1.5cm 2cm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 8.5pt; color: #111; margin: 0; }
    .page-header { text-align: center; margin-bottom: 0.8cm; border-bottom: 1.5pt solid #888; padding-bottom: 0.4cm; }
    .page-header h1 { font-size: 16pt; margin: 0 0 3px; font-weight: bold; }
    .page-header p { font-size: 9pt; color: #555; margin: 2px 0; }
    .columns { column-count: 2; column-gap: 1.4cm; column-fill: balance; }
    .letter-heading {
      font-size: 13pt;
      font-weight: bold;
      color: #333;
      border-bottom: 1pt solid #aaa;
      margin: 6pt 0 3pt;
      padding-bottom: 1pt;
      break-inside: avoid;
    }
    .guest {
      break-inside: avoid;
      padding: 4pt 0 5pt;
      border-bottom: 0.5pt solid #e5e5e5;
    }
    .guest-top { display: flex; align-items: baseline; gap: 4pt; }
    .guest-name { font-weight: bold; font-size: 9pt; flex-shrink: 0; }
    .guest-group { flex: 1; color: #666; font-size: 7.5pt; padding-left: 4pt; font-style: italic; }
    .guest-status { font-size: 7.5pt; font-weight: bold; flex-shrink: 0; }
    .guest-events { color: #444; font-size: 7.5pt; margin-top: 1.5pt; }
    .guest-meta { color: #555; font-size: 7pt; margin-top: 1.5pt; }
    .guest-dietary { color: #888; font-size: 7pt; font-style: italic; margin-top: 1pt; }
    .child { font-weight: normal; color: #888; font-size: 7.5pt; }
    @media print {
      .page-header { position: running(header); }
      @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #888; } }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${config.coupleName}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ""}
    <p>Guest List — ${guests.length} guest${guests.length !== 1 ? "s" : ""}&emsp;·&emsp;Printed: ${formatPrintedDate()}</p>
  </div>
  <div class="columns">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function generateRsvpSummaryHtml(guests: Guest[], config: WeddingConfig): string {
  const total = guests.length;
  const counts = {
    ACCEPTED: guests.filter((g) => g.rsvpStatus === "ACCEPTED").length,
    PARTIAL: guests.filter((g) => g.rsvpStatus === "PARTIAL").length,
    DECLINED: guests.filter((g) => g.rsvpStatus === "DECLINED").length,
    PENDING: guests.filter((g) => g.rsvpStatus === "PENDING").length,
    MAYBE: guests.filter((g) => g.rsvpStatus === "MAYBE").length,
  };

  const ceremonyGuests = guests.filter((g) => g.invitedToCeremony);
  const receptionGuests = guests.filter((g) => g.invitedToReception);
  const afterpartyGuests = guests.filter((g) => g.invitedToAfterparty);

  function eventCounts(list: Guest[], field: "attendingCeremony" | "attendingReception" | "attendingAfterparty") {
    return {
      attending: list.filter((g) => g[field] === true).length,
      declined: list.filter((g) => g[field] === false).length,
      pending: list.filter((g) => g[field] === null).length,
    };
  }

  const cCounts = eventCounts(ceremonyGuests, "attendingCeremony");
  const rCounts = eventCounts(receptionGuests, "attendingReception");
  const aCounts = eventCounts(afterpartyGuests, "attendingAfterparty");

  const pendingGuests = guests
    .filter((g) => g.rsvpStatus === "PENDING")
    .sort((a, b) => {
      const ln = a.lastName.localeCompare(b.lastName);
      return ln !== 0 ? ln : a.firstName.localeCompare(b.firstName);
    });

  const pendingRows = pendingGuests.map((g) => `
    <tr>
      <td>${g.lastName}, ${g.firstName}</td>
      <td>${g.groupName ?? "—"}</td>
      <td>${g.email ?? "—"}</td>
    </tr>`).join("");

  function row(label: string, value: number, color: string) {
    return `<tr><td class="label">${label}</td><td class="value" style="color:${color}">${value}</td></tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>RSVP Summary — ${config.coupleName}</title>
  <style>
    @page { size: A4 portrait; margin: 2cm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 10pt; color: #111; margin: 0; }
    h1 { font-size: 18pt; margin: 0 0 4pt; }
    .subtitle { color: #555; font-size: 10pt; margin-bottom: 0.8cm; }
    .divider { border: none; border-top: 1.5pt solid #888; margin: 0.6cm 0; }
    h2 { font-size: 12pt; margin: 0 0 6pt; color: #333; }
    table.counts { border-collapse: collapse; margin-bottom: 0.5cm; }
    table.counts td { padding: 2pt 6pt 2pt 0; font-size: 10pt; }
    table.counts td.label { color: #555; width: 8cm; }
    table.counts td.value { font-weight: bold; }
    .by-event { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.4cm; margin-bottom: 0.6cm; }
    .event-card { border: 0.5pt solid #ccc; border-radius: 4pt; padding: 6pt 8pt; }
    .event-card h3 { font-size: 9pt; font-weight: bold; color: #444; margin: 0 0 4pt; text-transform: uppercase; letter-spacing: 0.5pt; }
    .event-stat { font-size: 9pt; margin: 1.5pt 0; }
    .att { color: #16a34a; } .dec { color: #dc2626; } .pend { color: #d97706; }
    table.pending { width: 100%; border-collapse: collapse; font-size: 9pt; }
    table.pending th { text-align: left; border-bottom: 1pt solid #888; padding: 3pt 6pt 3pt 0; font-size: 8.5pt; color: #555; }
    table.pending td { padding: 3pt 6pt 3pt 0; border-bottom: 0.5pt solid #eee; }
    @media print {
      @page { @bottom-center { content: "Page " counter(page); font-size: 8pt; color: #888; } }
    }
  </style>
</head>
<body>
  <h1>${config.coupleName}</h1>
  <p class="subtitle">RSVP Summary&emsp;·&emsp;Printed: ${formatPrintedDate()}</p>
  <hr class="divider">

  <h2>Overall</h2>
  <table class="counts">
    ${row("Total invited:", total, "#111")}
    ${row("Accepted:", counts.ACCEPTED, STATUS_COLORS.ACCEPTED)}
    ${row("Partial:", counts.PARTIAL, STATUS_COLORS.PARTIAL)}
    ${row("Declined:", counts.DECLINED, STATUS_COLORS.DECLINED)}
    ${row("Pending (still to respond):", counts.PENDING, STATUS_COLORS.PENDING)}
    ${counts.MAYBE > 0 ? row("Maybe:", counts.MAYBE, STATUS_COLORS.MAYBE) : ""}
  </table>

  <hr class="divider">
  <h2>By Event</h2>
  <div class="by-event">
    ${ceremonyGuests.length > 0 ? `
    <div class="event-card">
      <h3>Ceremony (${ceremonyGuests.length} invited)</h3>
      <div class="event-stat att">Attending: ${cCounts.attending}</div>
      <div class="event-stat dec">Declined: ${cCounts.declined}</div>
      <div class="event-stat pend">Pending: ${cCounts.pending}</div>
    </div>` : ""}
    ${receptionGuests.length > 0 ? `
    <div class="event-card">
      <h3>Reception (${receptionGuests.length} invited)</h3>
      <div class="event-stat att">Attending: ${rCounts.attending}</div>
      <div class="event-stat dec">Declined: ${rCounts.declined}</div>
      <div class="event-stat pend">Pending: ${rCounts.pending}</div>
    </div>` : ""}
    ${afterpartyGuests.length > 0 ? `
    <div class="event-card">
      <h3>Afterparty (${afterpartyGuests.length} invited)</h3>
      <div class="event-stat att">Attending: ${aCounts.attending}</div>
      <div class="event-stat dec">Declined: ${aCounts.declined}</div>
      <div class="event-stat pend">Pending: ${aCounts.pending}</div>
    </div>` : ""}
  </div>

  ${pendingGuests.length > 0 ? `
  <hr class="divider">
  <h2>Still to respond (${pendingGuests.length} guest${pendingGuests.length !== 1 ? "s" : ""})</h2>
  <table class="pending">
    <thead>
      <tr>
        <th>Name</th>
        <th>Group</th>
        <th>Email</th>
      </tr>
    </thead>
    <tbody>
      ${pendingRows}
    </tbody>
  </table>` : `<p style="color:#555; font-style:italic">No guests with pending RSVP.</p>`}
</body>
</html>`;
}

export function PrintGuestListButton({
  inDropdown = false,
  onClose,
}: {
  inDropdown?: boolean;
  onClose?: () => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"full" | "summary" | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function fetchData() {
    const [guestsRes, configRes, mealRes] = await Promise.all([
      fetchApi("/api/guests"),
      fetchApi("/api/settings"),
      fetchApi("/api/meal-options"),
    ]);
    const [guests, config, mealOptions] = await Promise.all([
      guestsRes.json(),
      configRes.json(),
      mealRes.json(),
    ]);
    return { guests, config, mealOptions };
  }

  function openPrintWindow(html: string) {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Pop-up blocked. Please allow pop-ups for this site.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }

  async function handleFullList() {
    setOpen(false);
    onClose?.();
    setLoading("full");
    try {
      const { guests, config, mealOptions } = await fetchData();
      const mealMap = Object.fromEntries(
        (mealOptions as MealOption[]).map((m) => [m.id, m.name])
      );
      const html = generateFullGuestListHtml(guests, config, mealMap);
      openPrintWindow(html);
    } finally {
      setLoading(null);
    }
  }

  async function handleRsvpSummary() {
    setOpen(false);
    onClose?.();
    setLoading("summary");
    try {
      const { guests, config } = await fetchData();
      const html = generateRsvpSummaryHtml(guests, config);
      openPrintWindow(html);
    } finally {
      setLoading(null);
    }
  }

  // When rendered inside the mobile More dropdown, show flat menu items
  if (inDropdown) {
    return (
      <>
        <button
          type="button"
          onClick={handleFullList}
          disabled={!!loading}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <Printer className="w-3.5 h-3.5" />
          {loading === "full" ? "Preparing…" : "Full guest list"}
        </button>
        <button
          type="button"
          onClick={handleRsvpSummary}
          disabled={!!loading}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <Printer className="w-3.5 h-3.5" />
          {loading === "summary" ? "Preparing…" : "RSVP summary"}
        </button>
      </>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!!loading}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
      >
        <Printer className="w-3.5 h-3.5" />
        {loading ? "Preparing…" : "Print"}
        <ChevronDown className="w-3 h-3 ml-0.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-gray-200 shadow-lg z-20 overflow-hidden">
          <button
            type="button"
            onClick={handleFullList}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Full Guest List
          </button>
          <button
            type="button"
            onClick={handleRsvpSummary}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors"
          >
            RSVP Summary
          </button>
        </div>
      )}
    </div>
  );
}

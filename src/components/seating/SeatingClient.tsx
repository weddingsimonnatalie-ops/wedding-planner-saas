"use client";

import { useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch";
import type { GuestSummary, TableWithGuests, MealOptionSummary } from "@/lib/seating-types";
import { isReceptionEligible } from "@/lib/seating-types";
import { SeatingListView } from "./SeatingListView";
import type { UserRole } from "@prisma/client";

interface Props {
  initialTables: TableWithGuests[];
  initialUnassigned: GuestSummary[];
  mealOptions: MealOptionSummary[];
  role?: UserRole;
}

function sortGuests<T extends { seatNumber: number | null; lastName: string; firstName: string }>(guests: T[]): T[] {
  return [...guests].sort((a, b) => {
    if (a.seatNumber === null && b.seatNumber === null) return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    if (a.seatNumber === null) return 1;
    if (b.seatNumber === null) return -1;
    return a.seatNumber - b.seatNumber;
  });
}

export function SeatingClient({ initialTables, initialUnassigned, mealOptions, role }: Props) {
  const isAdmin = role === "ADMIN" || role === undefined;
  const [tables, setTables] = useState<TableWithGuests[]>(initialTables);
  const [unassigned, setUnassigned] = useState<GuestSummary[]>(initialUnassigned);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Shared print dropdown
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  const seatingAppUrl = process.env.NEXT_PUBLIC_SEATING_APP_URL;

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Shared print functions ──────────────────────────────────────────────────

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  async function printPlaceCards() {
    const res = await fetchApi("/api/seating/print-data");
    const data = await res.json();
    const allGuests: Array<{ firstName: string; lastName: string; tableName: string; seatNumber: number | null; mealChoiceName: string | null }> = [];
    for (const t of data.tables ?? []) {
      for (const g of t.guests ?? []) {
        allGuests.push({ ...g, tableName: t.name });
      }
    }
    const cards = allGuests.map((g) => `
      <div class="card">
        <div class="name">${esc(g.firstName)} ${esc(g.lastName)}</div>
        <div class="table-label">${esc(g.tableName)}</div>
        ${g.seatNumber != null ? `<div class="seat">Seat ${g.seatNumber}</div>` : ""}
        ${g.mealChoiceName ? `<div class="meal">${esc(g.mealChoiceName)}</div>` : ""}
      </div>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @media print { @page { size: A4; margin: 10mm; } }
      body { font-family: Georgia, serif; margin: 0; }
      .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8mm; padding: 8mm; }
      .card { border: 1px solid #bbb; border-radius: 4px; padding: 8mm; height: 54mm; box-sizing: border-box;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center; page-break-inside: avoid; }
      .name { font-size: 16pt; font-weight: bold; margin-bottom: 4px; }
      .table-label { font-size: 10pt; color: #555; margin-bottom: 3px; }
      .seat { font-size: 9pt; color: #444; }
      .meal { font-size: 8pt; color: #888; margin-top: 4px; font-style: italic; }
    </style></head><body><div class="grid">${cards}</div></body></html>`;
    const win = window.open();
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }

  async function printSeatingList() {
    const res = await fetchApi("/api/seating/print-data");
    const data = await res.json();
    const cfg = data.weddingConfig;
    const subtitle = cfg?.coupleName ?? "";
    const sections = (data.tables ?? []).map((t: any) => {
      const rows = (t.guests ?? []).map((g: any) => {
        const seat = g.seatNumber != null ? ` — Seat ${g.seatNumber}` : "";
        const meal = g.mealChoiceName ? ` (${esc(g.mealChoiceName)})` : "";
        const diet = g.dietaryNotes ? ` [${esc(g.dietaryNotes)}]` : "";
        return `<div class="row"><span class="gname">${esc(g.firstName)} ${esc(g.lastName)}${seat}</span><span class="detail">${meal}${diet}</span></div>`;
      }).join("");
      const tnotes = t.notes ? `<div class="tnotes">${esc(t.notes)}</div>` : "";
      return `<div class="section"><div class="tname">${esc(t.name)} — ${t.guests.length}/${t.capacity}</div>${tnotes}${rows}</div>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @media print { @page { size: A4; margin: 15mm; } }
      body { font-family: Arial, sans-serif; font-size: 10pt; margin: 0; }
      h1 { font-size: 16pt; margin: 0 0 4px; }
      .sub { font-size: 10pt; color: #666; margin-bottom: 16px; }
      .section { margin-bottom: 14px; page-break-inside: avoid; }
      .tname { font-size: 12pt; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 3px; }
      .tnotes { font-size: 9pt; color: #888; font-style: italic; margin-bottom: 5px; }
      .row { display: flex; justify-content: space-between; padding: 2px 0; }
      .row:nth-child(even) { background: #f5f5f5; }
      .gname { }
      .detail { color: #777; font-style: italic; }
    </style></head><body>
      <h1>Seating Plan</h1>
      ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}
      ${sections}
    </body></html>`;
    const win = window.open();
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }

  // Assign a guest to a table
  const assignGuest = useCallback(async (guestId: string, tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    const guest = unassigned.find((g) => g.id === guestId);
    if (!table || !guest) return;

    if (table.guests.length >= table.capacity) {
      showToast(`${table.name} is full`, false);
      return;
    }

    setTables((prev) =>
      prev.map((t) => t.id === tableId ? { ...t, guests: sortGuests([...t.guests, guest]) } : t)
    );
    setUnassigned((prev) => prev.filter((g) => g.id !== guestId));

    const res = await fetch(`/api/tables/${tableId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId }),
    });

    if (!res.ok) {
      setTables((prev) =>
        prev.map((t) => t.id === tableId ? { ...t, guests: t.guests.filter((g) => g.id !== guestId) } : t)
      );
      setUnassigned((prev) => [...prev, guest].sort((a, b) => a.lastName.localeCompare(b.lastName)));
      const d = await res.json();
      showToast(d.error ?? "Failed to assign guest", false);
    }
  }, [tables, unassigned]);

  // Remove a guest from a table
  const removeGuest = useCallback(async (guestId: string, tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    const guest = table?.guests.find((g) => g.id === guestId);
    if (!table || !guest) return;

    const eligible = isReceptionEligible(guest);

    setTables((prev) =>
      prev.map((t) => t.id === tableId ? { ...t, guests: t.guests.filter((g) => g.id !== guestId) } : t)
    );
    if (eligible) {
      setUnassigned((prev) => [...prev, guest].sort((a, b) => a.lastName.localeCompare(b.lastName)));
    }

    const res = await fetch(`/api/tables/${tableId}/assign/${guestId}`, { method: "DELETE" });

    if (!res.ok) {
      setTables((prev) =>
        prev.map((t) => t.id === tableId ? { ...t, guests: [...t.guests, guest] } : t)
      );
      if (eligible) {
        setUnassigned((prev) => prev.filter((g) => g.id !== guestId));
      }
      showToast("Failed to remove guest", false);
    }
  }, [tables]);

  // Assign a seat number to a guest (immediate PATCH, no toast)
  const assignSeat = useCallback(async (guestId: string, seatNumber: number | null): Promise<string | null> => {
    const res = await fetch(`/api/guests/${guestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatNumber }),
    });
    if (res.ok) {
      setTables((prev) =>
        prev.map((t) => ({
          ...t,
          guests: sortGuests(t.guests.map((g) =>
            g.id === guestId ? { ...g, seatNumber } : g
          )),
        }))
      );
      return null;
    } else {
      const d = await res.json();
      return d.error ?? "Failed to assign seat";
    }
  }, []);

  // Assign guest to a table and immediately set a specific seat number (mobile flow)
  const assignGuestWithSeat = useCallback(async (guestId: string, tableId: string, seatNumber: number): Promise<string | null> => {
    await assignGuest(guestId, tableId);
    return assignSeat(guestId, seatNumber);
  }, [assignGuest, assignSeat]);

  // Update table properties (with toast)
  const updateTable = useCallback(async (tableId: string, updates: Partial<TableWithGuests>) => {
    setTables((prev) =>
      prev.map((t) => t.id === tableId ? { ...t, ...updates } : t)
    );
    const res = await fetch(`/api/tables/${tableId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) showToast("Failed to update table", false);
    else showToast("Table updated");
  }, []);

  // Delete table
  const deleteTable = useCallback(async (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    const unassignedFromTable = table.guests.filter(isReceptionEligible);
    setTables((prev) => prev.filter((t) => t.id !== tableId));
    setUnassigned((prev) =>
      [...prev, ...unassignedFromTable].sort((a, b) => a.lastName.localeCompare(b.lastName))
    );

    const res = await fetch(`/api/tables/${tableId}`, { method: "DELETE" });
    if (!res.ok) {
      setTables((prev) => [...prev, table]);
      setUnassigned((prev) => prev.filter((g) => !unassignedFromTable.find((u) => u.id === g.id)));
      showToast("Failed to delete table", false);
    } else {
      showToast("Table deleted");
    }
  }, [tables]);

  // Create table
  const createTable = useCallback(async (data: { name: string; shape: string; capacity: number }) => {
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const table = await res.json();
      setTables((prev) => [...prev, table]);
      showToast(`Table "${table.name}" created`);
      return table;
    } else {
      const d = await res.json();
      showToast(d.error ?? "Failed to create table", false);
      return null;
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold text-gray-900">Seating Planner</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Open external visual tools app */}
          {isAdmin && seatingAppUrl && (
            <a
              href={`${seatingAppUrl}/seating`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Open Visual Tools
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}

          {/* Print dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPrintMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              🖨 Print ▾
            </button>
            {showPrintMenu && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[170px]">
                {seatingAppUrl && (
                  <a
                    href={`${seatingAppUrl}/seating/print-designer`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowPrintMenu(false)}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    📊 Chart Designer ↗
                  </a>
                )}
                {seatingAppUrl && (
                  <a
                    href={`${seatingAppUrl}/seating`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowPrintMenu(false)}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    🗺 Floor Plan ↗
                  </a>
                )}
                <button
                  onClick={() => { printPlaceCards(); setShowPrintMenu(false); }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  🪑 Place Cards (3/row)
                </button>
                <button
                  onClick={() => { printSeatingList(); setShowPrintMenu(false); }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  📋 Seating List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <SeatingListView
          tables={tables}
          unassigned={unassigned}
          mealOptions={mealOptions}
          onAssign={assignGuest}
          onRemove={removeGuest}
          onCreateTable={createTable}
          onDeleteTable={deleteTable}
          onUpdateTable={updateTable}
          onAssignSeat={assignSeat}
          onAssignWithSeat={assignGuestWithSeat}
          readOnly={role !== "ADMIN" && role !== undefined}
        />
      </div>

      {toast && (
        <div
          className={`fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
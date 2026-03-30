"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { fetchApi } from "@/lib/fetch";
import type { GuestSummary, TableWithGuests, Room, MealOptionSummary } from "@/lib/seating-types";
import { isReceptionEligible } from "@/lib/seating-types";
import { SeatingListView } from "./SeatingListView";
import { UserRole, Orientation } from "@prisma/client";

// Lazy-loaded heavy views — only downloaded when the tab is first opened
const PlanDesignerView = dynamic(
  () => import("./PlanDesignerView").then((m) => ({ default: m.PlanDesignerView })),
  { loading: () => <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div> }
);
const SeatingVisualView = dynamic(
  () => import("./SeatingVisualView").then((m) => ({ default: m.SeatingVisualView })),
  { ssr: false }
);

interface Props {
  initialRoom: Room;
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

export function SeatingClient({ initialRoom, initialTables, initialUnassigned, mealOptions, role }: Props) {
  const canUseVisual = role === "ADMIN" || role === undefined;
  const [tab, setTab] = useState<"list" | "visual" | "plan">("list");
  const [tables, setTables] = useState<TableWithGuests[]>(initialTables);
  const [unassigned, setUnassigned] = useState<GuestSummary[]>(initialUnassigned);
  const [room, setRoom] = useState<Room>(initialRoom);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Shared print dropdown
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  // Floor plan from list view: switch to visual, trigger print, switch back
  const [triggerFloorPrint, setTriggerFloorPrint] = useState(false);
  const tabBeforePrint = useRef<"list" | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Shared print functions ──────────────────────────────────────────────────

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
        <div class="name">${g.firstName} ${g.lastName}</div>
        <div class="table-label">${g.tableName}</div>
        ${g.seatNumber != null ? `<div class="seat">Seat ${g.seatNumber}</div>` : ""}
        ${g.mealChoiceName ? `<div class="meal">${g.mealChoiceName}</div>` : ""}
      </div>`).join("");
    const html = `<!DOCTYPE html><html><head><style>
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
    const subtitle = [cfg?.coupleName, cfg?.venueName].filter(Boolean).join(" · ");
    const sections = (data.tables ?? []).map((t: any) => {
      const rows = (t.guests ?? []).map((g: any) => {
        const seat = g.seatNumber != null ? ` — Seat ${g.seatNumber}` : "";
        const meal = g.mealChoiceName ? ` (${g.mealChoiceName})` : "";
        const diet = g.dietaryNotes ? ` [${g.dietaryNotes}]` : "";
        return `<div class="row"><span class="gname">${g.firstName} ${g.lastName}${seat}</span><span class="detail">${meal}${diet}</span></div>`;
      }).join("");
      const tnotes = t.notes ? `<div class="tnotes">${t.notes}</div>` : "";
      return `<div class="section"><div class="tname">${t.name} — ${t.guests.length}/${t.capacity}</div>${tnotes}${rows}</div>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><style>
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
      ${subtitle ? `<p class="sub">${subtitle}</p>` : ""}
      ${sections}
    </body></html>`;
    const win = window.open();
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
  }

  function handleFloorPlanPrint() {
    setShowPrintMenu(false);
    if (tab === "visual") {
      // Already on visual — trigger directly via the prop
      setTriggerFloorPrint(true);
    } else {
      // Switch to visual, remember we came from list
      tabBeforePrint.current = "list";
      setTab("visual");
      setTriggerFloorPrint(true);
    }
  }

  function handleFloorPrintDone() {
    setTriggerFloorPrint(false);
    if (tabBeforePrint.current) {
      setTab(tabBeforePrint.current);
      tabBeforePrint.current = null;
    }
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
      // Update local table guest seatNumber
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

  // Silent PATCH — updates local state + calls API, no toast
  const patchTable = useCallback(async (tableId: string, updates: Partial<TableWithGuests>) => {
    setTables((prev) =>
      prev.map((t) => t.id === tableId ? { ...t, ...updates } : t)
    );
    await fetch(`/api/tables/${tableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }, []);

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
  const createTable = useCallback(async (data: { name: string; shape: string; capacity: number; positionX?: number; positionY?: number; orientation?: Orientation }) => {
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

  // Update room
  const updateRoom = useCallback(async (updates: Partial<Room & { elements: any[] }>) => {
    const res = await fetch(`/api/rooms/${room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setRoom((prev) => ({ ...prev, ...updated }));
    } else {
      showToast("Failed to save room", false);
    }
  }, [room.id]);

  const persistElements = useCallback(async (elements: Room["elements"]) => {
    setRoom((prev) => ({ ...prev, elements }));
    const res = await fetch(`/api/rooms/${room.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elements }),
    });
    if (res.ok) {
      const updated = await res.json();
      if (Array.isArray(updated?.elements)) {
        setRoom((prev) => ({ ...prev, elements: updated.elements }));
      }
    }
  }, [room.id]);

  // ── Plan Designer callbacks ──────────────────────────────────────────────────

  const handlePlanCreateTable = useCallback(async (name: string, capacity: number, orientation: Orientation) => {
    await createTable({
      name,
      shape: "RECTANGULAR",
      capacity,
      positionX: 50 + tables.length * 30,
      positionY: 50 + tables.length * 30,
      orientation,
    });
  }, [createTable, tables.length]);

  const handlePlanDeleteTable = useCallback(async (tableId: string) => {
    await deleteTable(tableId);
  }, [deleteTable]);

  const handlePlanUpdatePosition = useCallback(async (tableId: string, x: number, y: number) => {
    await patchTable(tableId, { positionX: x, positionY: y });
  }, [patchTable]);

  const handlePlanUpdateOrientation = useCallback(async (tableId: string, orientation: Orientation) => {
    await patchTable(tableId, { orientation });
  }, [patchTable]);

  const handlePlanAssignSeat = useCallback(async (tableId: string, seatNumber: number, guestId: string | null) => {
    if (guestId === null) {
      // Find the guest currently in this seat and remove them
      const table = tables.find((t) => t.id === tableId);
      const guest = table?.guests.find((g) => g.seatNumber === seatNumber);
      if (guest) {
        await removeGuest(guest.id, tableId);
      }
    } else {
      // Check if guest is already on this table
      const guest = unassigned.find((g) => g.id === guestId);
      if (!guest) return;

      // Check if guest is already assigned to a table (move from another table)
      const currentTable = tables.find((t) => t.guests.some((g) => g.id === guestId));
      if (currentTable && currentTable.id !== tableId) {
        // Remove from current table first
        await removeGuest(guestId, currentTable.id);
      }

      // If not on any table, assign to this table
      const targetTable = tables.find((t) => t.id === tableId);
      if (!targetTable) return;

      // Check if guest already on this table (just changing seat)
      const alreadyOnTable = targetTable.guests.some((g) => g.id === guestId);

      if (!alreadyOnTable) {
        // Assign guest to table first
        await assignGuest(guestId, tableId);
      }

      // Now assign the seat number
      await assignSeat(guestId, seatNumber);
    }
  }, [tables, unassigned, assignGuest, removeGuest, assignSeat]);

  const handlePlanUpdateTableName = useCallback(async (tableId: string, name: string) => {
    await patchTable(tableId, { name });
  }, [patchTable]);

  const handlePlanUpdateTableCapacity = useCallback(async (tableId: string, capacity: number) => {
    await patchTable(tableId, { capacity });
  }, [patchTable]);

  const handlePlanUpdateTableNotes = useCallback(async (tableId: string, notes: string | null) => {
    await patchTable(tableId, { notes });
  }, [patchTable]);

  const handlePlanDuplicateTable = useCallback(async (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    await createTable({
      name: `${table.name} - Copy`,
      shape: table.shape,
      capacity: table.capacity,
      positionX: table.positionX + 20,
      positionY: table.positionY + 20,
      orientation: table.orientation,
    });
  }, [tables, createTable]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold text-gray-900">Seating Planner</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setTab("list")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              List View
            </button>
            {canUseVisual && (
              <button
                onClick={() => setTab("visual")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "visual" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Visual View
              </button>
            )}
            {canUseVisual && (
              <button
                onClick={() => setTab("plan")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "plan" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Plan Designer
              </button>
            )}
          </div>

          {/* Shared print dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPrintMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              🖨 Print ▾
            </button>
            {showPrintMenu && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[170px]">
                <Link
                  href="/seating/print-designer"
                  onClick={() => setShowPrintMenu(false)}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  📊 Chart Designer
                </Link>
                <button
                  onClick={handleFloorPlanPrint}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  🗺 Floor Plan
                </button>
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
        {tab === "visual" && (
          <div className="md:hidden mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            The visual floor plan is best viewed on a larger screen. Switch to list view to manage guest seating on mobile.
          </div>
        )}
        {tab === "list" ? (
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
            readOnly={role !== "ADMIN" && role !== undefined}
          />
        ) : tab === "visual" ? (
          <SeatingVisualView
            room={room}
            tables={tables}
            unassigned={unassigned}
            mealOptions={mealOptions}
            onCreateTable={createTable}
            onDeleteTable={deleteTable}
            onPatchTable={patchTable}
            onUpdateTable={updateTable}
            onUpdateRoom={updateRoom}
            onPersistElements={persistElements}
            onAssignGuest={assignGuest}
            onRemoveGuest={removeGuest}
            onAssignSeat={assignSeat}
            triggerFloorPrint={triggerFloorPrint}
            onFloorPrintDone={handleFloorPrintDone}
          />
        ) : (
          <PlanDesignerView
            tables={tables}
            unassigned={unassigned}
            mealOptions={mealOptions}
            onCreateTable={handlePlanCreateTable}
            onDeleteTable={handlePlanDeleteTable}
            onUpdateTablePosition={handlePlanUpdatePosition}
            onUpdateTableOrientation={handlePlanUpdateOrientation}
            onUpdateTableName={handlePlanUpdateTableName}
            onUpdateTableCapacity={handlePlanUpdateTableCapacity}
            onUpdateTableNotes={handlePlanUpdateTableNotes}
            onDuplicateTable={handlePlanDuplicateTable}
            onAssignSeat={handlePlanAssignSeat}
          />
        )}
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

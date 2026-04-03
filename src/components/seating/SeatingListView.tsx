"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { GuestSummary, TableWithGuests, MealOptionSummary } from "@/lib/seating-types";
import { isReceptionEligible } from "@/lib/seating-types";
import { Plus, Trash2, X, Pencil } from "lucide-react";
import { MobileSeatSheet } from "./MobileSeatSheet";

const COLOUR_PRESETS = [
  "#e2e8f0", "#fca5a5", "#fdba74", "#fcd34d",
  "#86efac", "#67e8f9", "#93c5fd", "#c4b5fd",
  "#f9a8d4", "#6ee7b7", "#a5b4fc", "#bbf7d0",
];

interface Props {
  tables: TableWithGuests[];
  unassigned: GuestSummary[];
  mealOptions: MealOptionSummary[];
  onAssign: (guestId: string, tableId: string) => void;
  onRemove: (guestId: string, tableId: string) => void;
  onCreateTable: (data: { name: string; shape: string; capacity: number }) => void;
  onDeleteTable: (tableId: string) => void;
  onUpdateTable: (tableId: string, updates: any) => void;
  onAssignSeat: (guestId: string, seatNumber: number | null) => Promise<string | null>;
  onAssignWithSeat?: (guestId: string, tableId: string, seatNumber: number) => Promise<string | null>;
  readOnly?: boolean;
}

interface MobilePickerTarget {
  tableId: string;
  tableName: string;
  tableShape: string;
  seatNumber: number | null;
}

interface SeatPrompt {
  guestId: string;
  tableId: string;
  guestName: string;
  tableName: string;
}

export function SeatingListView({
  tables,
  unassigned,
  mealOptions,
  onAssign,
  onRemove,
  onCreateTable,
  onDeleteTable,
  onUpdateTable,
  onAssignSeat,
  onAssignWithSeat,
  readOnly = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [activeGuest, setActiveGuest] = useState<GuestSummary | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableShape, setNewTableShape] = useState("ROUND");
  const [newTableCapacity, setNewTableCapacity] = useState(8);

  // Mobile seat picker state
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [mobilePickerTarget, setMobilePickerTarget] = useState<MobilePickerTarget | null>(null);
  const [mobilePickerSearch, setMobilePickerSearch] = useState("");
  const [mobilePickerAssigning, setMobilePickerAssigning] = useState(false);

  // Seat prompt shown after assigning a guest to a table
  const [seatPrompt, setSeatPrompt] = useState<SeatPrompt | null>(null);
  const [seatPromptValue, setSeatPromptValue] = useState("");
  const [seatPromptSaving, setSeatPromptSaving] = useState(false);
  const [seatPromptError, setSeatPromptError] = useState("");

  const mealMap = Object.fromEntries(mealOptions.map((m) => [m.id, m.name]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const allGroups = Array.from(new Set(unassigned.map((g) => g.groupName).filter(Boolean))) as string[];

  const filtered = unassigned.filter((g) => {
    const name = `${g.firstName} ${g.lastName}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchGroup = !groupFilter || g.groupName === groupFilter;
    return matchSearch && matchGroup;
  });

  function openSeatPrompt(guestId: string, tableId: string) {
    const guest = unassigned.find((g) => g.id === guestId);
    const table = tables.find((t) => t.id === tableId);
    if (!guest || !table) return;
    setSeatPrompt({
      guestId,
      tableId,
      guestName: `${guest.firstName} ${guest.lastName}`,
      tableName: table.name,
    });
    setSeatPromptValue("");
    setSeatPromptError("");
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveGuest(unassigned.find((g) => g.id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveGuest(null);
    const { active, over } = event;
    if (over) {
      onAssign(active.id as string, over.id as string);
      setSelectedGuestId(null);
      openSeatPrompt(active.id as string, over.id as string);
    }
  }

  function handleClickGuest(guestId: string) {
    setSelectedGuestId((prev) => (prev === guestId ? null : guestId));
  }

  function handleClickTableAssign(tableId: string) {
    if (!selectedGuestId) return;
    const guestId = selectedGuestId;
    onAssign(guestId, tableId);
    setSelectedGuestId(null);
    openSeatPrompt(guestId, tableId);
  }

  async function handleSeatPromptSave() {
    if (!seatPrompt) return;
    const seat = seatPromptValue === "" ? null : Number(seatPromptValue);
    setSeatPromptSaving(true);
    setSeatPromptError("");
    const err = await onAssignSeat(seatPrompt.guestId, seat);
    setSeatPromptSaving(false);
    if (err) {
      setSeatPromptError(err);
    } else {
      setSeatPrompt(null);
    }
  }

  function handleMobileSeatTap(tableId: string, tableName: string, tableShape: string, seatNumber: number | null) {
    setMobilePickerTarget({ tableId, tableName, tableShape, seatNumber });
    setMobilePickerSearch("");
    setMobilePickerOpen(true);
  }

  async function handleMobileGuestSelect(guestId: string) {
    if (!mobilePickerTarget) return;
    setMobilePickerAssigning(true);

    if (mobilePickerTarget.seatNumber !== null && onAssignWithSeat) {
      await onAssignWithSeat(guestId, mobilePickerTarget.tableId, mobilePickerTarget.seatNumber);
    } else {
      onAssign(guestId, mobilePickerTarget.tableId);
    }

    setMobilePickerAssigning(false);
    setMobilePickerOpen(false);
    setMobilePickerTarget(null);
  }

  async function handleAddTable() {
    if (!newTableName.trim()) return;
    await onCreateTable({ name: newTableName.trim(), shape: newTableShape, capacity: newTableCapacity });
    setNewTableName("");
    setNewTableShape("ROUND");
    setNewTableCapacity(8);
    setShowAddTable(false);
  }

  function mealSummary(guests: GuestSummary[]) {
    const counts: Record<string, number> = {};
    guests.forEach((g) => {
      if (g.mealChoice) {
        const name = mealMap[g.mealChoice] ?? g.mealChoice;
        counts[name] = (counts[name] ?? 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, n]) => `${n}× ${name}`)
      .join(", ");
  }

  // The seat prompt needs to look up available seats on the table it was just assigned to.
  // Tables state updates after onAssign, so by the time the prompt renders the table has the guest.
  const seatPromptTable = seatPrompt ? tables.find((t) => t.id === seatPrompt.tableId) : null;
  const seatPromptTakenSeats = seatPromptTable
    ? seatPromptTable.guests.filter((g) => g.id !== seatPrompt!.guestId && g.seatNumber != null).map((g) => g.seatNumber!)
    : [];

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* ── Desktop layout (drag-and-drop) ── */}
      <div className="hidden md:flex md:flex-row gap-4 h-full min-h-0">
        {/* Left panel: unassigned guests — hidden in read-only mode */}
        {!readOnly && <div className="w-full md:w-72 flex flex-col bg-white rounded-xl border border-gray-200 min-h-0 max-h-64 md:max-h-none">
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">
                Unassigned <span className="text-gray-400 font-normal">({unassigned.length})</span>
              </p>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary mb-1.5"
            />
            {allGroups.length > 0 && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All groups</option>
                {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            {selectedGuestId && (
              <p className="mt-1.5 text-xs text-primary">
                Guest selected — click a table to assign ↓
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                {unassigned.length === 0 ? "All guests assigned! 🎉" : "No matches"}
              </p>
            ) : (
              filtered.map((guest) => (
                <DraggableGuestCard
                  key={guest.id}
                  guest={guest}
                  isSelected={selectedGuestId === guest.id}
                  onClick={() => handleClickGuest(guest.id)}
                />
              ))
            )}
          </div>
          <div className="px-3 py-2 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 leading-snug">
              Showing reception guests only. Guests who have declined are kept on their table but highlighted.
            </p>
          </div>
        </div>}

        {/* Right panel: tables */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-y-auto">
          <div className="space-y-3 pb-4">
            {tables.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 py-10 text-center">
                <p className="text-gray-400 text-sm">No tables yet</p>
                {!readOnly && (
                  <button
                    onClick={() => setShowAddTable(true)}
                    className="mt-2 text-sm text-primary hover:underline"
                  >
                    Add the first table
                  </button>
                )}
              </div>
            )}

            {tables.map((table) => {
              const full = table.guests.length >= table.capacity;
              const nearFull = table.guests.length / table.capacity >= 0.75;
              return (
                <DroppableTable
                  key={table.id}
                  table={table}
                  mealSummary={mealSummary(table.guests)}
                  full={full}
                  nearFull={nearFull}
                  selectedGuestId={selectedGuestId}
                  onClickTable={() => handleClickTableAssign(table.id)}
                  onRemoveGuest={onRemove}
                  onDeleteTable={onDeleteTable}
                  onUpdateTable={onUpdateTable}
                  onAssignSeat={onAssignSeat}
                  readOnly={readOnly}
                />
              );
            })}

            {/* Add table form */}
            {!readOnly && showAddTable ? (
              <div className="bg-white rounded-xl border border-primary/30 p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">New table</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <input
                      autoFocus
                      value={newTableName}
                      onChange={(e) => setNewTableName(e.target.value)}
                      placeholder="Table name *"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      onKeyDown={(e) => e.key === "Enter" && handleAddTable()}
                    />
                  </div>
                  <div>
                    <select
                      value={newTableShape}
                      onChange={(e) => setNewTableShape(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="ROUND">Round</option>
                      <option value="RECTANGULAR">Rectangular</option>
                      <option value="OVAL">Oval</option>
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={newTableCapacity}
                      onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <p className="text-xs text-gray-400 flex items-center">capacity</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddTable}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium"
                  >
                    Add table
                  </button>
                  <button
                    onClick={() => setShowAddTable(false)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : !readOnly ? (
              <button
                onClick={() => setShowAddTable(true)}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add table
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Mobile layout (tap-to-assign) ── */}
      <div className="md:hidden space-y-3 pb-20">
        {/* Unassigned count banner */}
        {!readOnly && (
          <div className={`rounded-xl px-4 py-3 text-sm text-center ${
            unassigned.length === 0
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            {unassigned.length === 0
              ? "All guests assigned! 🎉"
              : `${unassigned.length} guest${unassigned.length !== 1 ? "s" : ""} still to seat — tap a seat to assign`}
          </div>
        )}

        {/* Empty state */}
        {tables.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-10 text-center">
            <p className="text-gray-400 text-sm">No tables yet</p>
            {!readOnly && (
              <button
                onClick={() => setShowAddTable(true)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Add the first table
              </button>
            )}
          </div>
        )}

        {/* Table cards */}
        {tables.map((table) => (
          <MobileTableCard
            key={table.id}
            table={table}
            mealSummary={mealSummary(table.guests)}
            onRemoveGuest={onRemove}
            onDeleteTable={onDeleteTable}
            onUpdateTable={onUpdateTable}
            onAssignSeat={onAssignSeat}
            onTapSeat={(seatNumber) =>
              handleMobileSeatTap(table.id, table.name, table.shape, seatNumber)
            }
            readOnly={readOnly}
          />
        ))}

        {/* Add table form / button */}
        {!readOnly && showAddTable ? (
          <div className="bg-white rounded-xl border border-primary/30 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">New table</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <input
                  autoFocus
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Table name *"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => e.key === "Enter" && handleAddTable()}
                />
              </div>
              <div>
                <select
                  value={newTableShape}
                  onChange={(e) => setNewTableShape(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ROUND">Round</option>
                  <option value="RECTANGULAR">Rectangular</option>
                  <option value="OVAL">Oval</option>
                </select>
              </div>
              <div>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                  placeholder="Capacity"
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddTable}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
              >
                Add table
              </button>
              <button
                onClick={() => setShowAddTable(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : !readOnly ? (
          <button
            onClick={() => setShowAddTable(true)}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add table
          </button>
        ) : null}
      </div>

      {/* Mobile guest picker sheet */}
      <MobileSeatSheet
        open={mobilePickerOpen}
        onClose={() => { setMobilePickerOpen(false); setMobilePickerTarget(null); }}
        title={
          mobilePickerTarget?.seatNumber != null
            ? `Assign Seat ${mobilePickerTarget.seatNumber}`
            : "Add to table"
        }
        subtitle={
          mobilePickerTarget
            ? `${mobilePickerTarget.tableName} · ${mobilePickerTarget.tableShape.charAt(0) + mobilePickerTarget.tableShape.slice(1).toLowerCase()}`
            : ""
        }
        unassigned={unassigned}
        search={mobilePickerSearch}
        onSearchChange={setMobilePickerSearch}
        onSelect={handleMobileGuestSelect}
        assigning={mobilePickerAssigning}
      />

      <DragOverlay>
        {activeGuest && (
          <div className="px-3 py-2 bg-white shadow-lg rounded-lg border border-primary text-sm font-medium text-gray-800">
            {activeGuest.firstName} {activeGuest.lastName}
          </div>
        )}
      </DragOverlay>

      {/* Seat prompt — shown after guest is assigned to a table */}
      {seatPrompt && seatPromptTable && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-5 w-80 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Assign a seat?</p>
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{seatPrompt.guestName}</span> has been
              added to <span className="font-medium text-gray-700">{seatPrompt.tableName}</span>.
            </p>
            <select
              value={seatPromptValue}
              onChange={(e) => { setSeatPromptValue(e.target.value); setSeatPromptError(""); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Skip — no seat number</option>
              {Array.from({ length: seatPromptTable.capacity }, (_, i) => i + 1).map((n) => {
                const taken = seatPromptTakenSeats.includes(n);
                const occupant = seatPromptTable.guests.find((g) => g.id !== seatPrompt.guestId && g.seatNumber === n);
                return (
                  <option key={n} value={n} disabled={taken}>
                    Seat {n}{occupant ? ` — ${occupant.firstName} ${occupant.lastName}` : ""}
                  </option>
                );
              })}
            </select>
            {seatPromptError && <p className="text-xs text-red-600">{seatPromptError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSeatPromptSave}
                disabled={seatPromptSaving}
                className="flex-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-60"
              >
                {seatPromptSaving ? "Saving…" : seatPromptValue ? "Assign seat" : "Skip"}
              </button>
              <button
                onClick={() => setSeatPrompt(null)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}

// ── Mobile table card ─────────────────────────────────────────────────────────

function MobileTableCard({
  table,
  mealSummary,
  onRemoveGuest,
  onDeleteTable,
  onUpdateTable,
  onAssignSeat,
  onTapSeat,
  readOnly = false,
}: {
  table: TableWithGuests;
  mealSummary: string;
  onRemoveGuest: (guestId: string, tableId: string) => void;
  onDeleteTable: (tableId: string) => void;
  onUpdateTable: (tableId: string, updates: any) => void;
  onAssignSeat: (guestId: string, seatNumber: number | null) => Promise<string | null>;
  onTapSeat: (seatNumber: number | null) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(table.name);
  const [editShape, setEditShape] = useState<string>(table.shape);
  const [editCapacity, setEditCapacity] = useState(table.capacity);
  const [editColour, setEditColour] = useState(table.colour ?? "#e2e8f0");
  const [editNotes, setEditNotes] = useState(table.notes ?? "");
  const [editSaving, setEditSaving] = useState(false);

  function openEdit() {
    setEditName(table.name);
    setEditShape(table.shape);
    setEditCapacity(table.capacity);
    setEditColour(table.colour ?? "#e2e8f0");
    setEditNotes(table.notes ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    setEditSaving(true);
    await onUpdateTable(table.id, {
      name: editName.trim(),
      shape: editShape,
      capacity: editCapacity,
      colour: editColour,
      notes: editNotes.trim() || null,
    });
    setEditSaving(false);
    setEditing(false);
  }

  // Build a map of seatNumber → guest for fast lookup
  const seatMap = new Map<number, GuestSummary>();
  table.guests.forEach((g) => {
    if (g.seatNumber != null) seatMap.set(g.seatNumber, g);
  });
  const unseatedGuests = [...table.guests]
    .filter((g) => g.seatNumber == null)
    .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "") || (a.firstName || "").localeCompare(b.firstName || ""));

  const full = table.guests.length >= table.capacity;
  const nearFull = table.guests.length / table.capacity >= 0.75;

  const borderColor = full ? "border-red-300" : nearFull ? "border-amber-300" : "border-gray-200";
  const headerBg = full ? "bg-red-50" : nearFull ? "bg-amber-50" : "bg-gray-50";
  const capacityColor = full ? "text-red-600 font-semibold" : nearFull ? "text-amber-600" : "text-gray-500";

  return (
    <div className={`bg-white rounded-xl border-2 ${borderColor} overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${headerBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          {table.colour && table.colour !== "#e2e8f0" && (
            <span
              className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300"
              style={{ background: table.colour }}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{table.name}</p>
            {table.notes && (
              <p className="text-xs text-gray-400 italic truncate">{table.notes}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <span className="text-xs text-gray-400 capitalize mr-0.5">
            {table.shape.charAt(0) + table.shape.slice(1).toLowerCase()}
          </span>
          <span className={`text-xs ${capacityColor}`}>
            {table.guests.length}/{table.capacity}
            {full && " FULL"}
          </span>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={openEdit}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/60 active:bg-white transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${table.name}"? This will unassign ${table.guests.length} guests.`)) {
                    onDeleteTable(table.id);
                  }
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && !readOnly && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-gray-400 block mb-0.5">Name</label>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Shape</label>
              <select
                value={editShape}
                onChange={(e) => setEditShape(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ROUND">Round</option>
                <option value="RECTANGULAR">Rectangular</option>
                <option value="OVAL">Oval</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Capacity</label>
              <input
                type="number"
                min={1}
                max={50}
                value={editCapacity}
                onChange={(e) => setEditCapacity(Number(e.target.value))}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {editCapacity < table.guests.length && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {table.guests.length} guests assigned
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Colour</label>
            <div className="flex flex-wrap gap-2">
              {COLOUR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColour(c)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ background: c, borderColor: editColour === c ? "#6366f1" : "#d1d5db" }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for this table"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={editSaving || !editName.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {editSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Seat rows: numbered seats 1..capacity */}
      <div className="divide-y divide-gray-50">
        {Array.from({ length: table.capacity }, (_, i) => i + 1).map((seatNum) => {
          const guest = seatMap.get(seatNum);
          if (guest) {
            const declined = !isReceptionEligible(guest);
            return (
              <div
                key={seatNum}
                className={`flex items-center gap-3 px-4 py-3 ${declined ? "opacity-60" : ""}`}
              >
                <span className="text-xs font-medium text-indigo-400 w-7 flex-shrink-0">
                  S{seatNum}
                </span>
                <span className={`flex-1 text-sm min-w-0 truncate ${declined ? "text-amber-700" : "text-gray-800"}`}>
                  {guest.firstName} {guest.lastName}
                  {declined && (
                    <span className="ml-1.5 text-xs text-amber-500">declined</span>
                  )}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onRemoveGuest(guest.id, table.id)}
                    className="p-1 text-gray-300 hover:text-red-500 active:text-red-600 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          }
          return (
            <div key={seatNum} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-medium text-gray-300 w-7 flex-shrink-0">
                S{seatNum}
              </span>
              <span className="flex-1 text-sm text-gray-400">— Empty —</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onTapSeat(seatNum)}
                  className="text-xs text-primary border border-primary/30 rounded-lg px-3 py-1 hover:bg-primary/5 active:bg-primary/10 flex-shrink-0 transition-colors"
                >
                  + Assign
                </button>
              )}
            </div>
          );
        })}

        {/* Unseated guests (at this table but no seat number) */}
        {unseatedGuests.map((guest) => {
          const declined = !isReceptionEligible(guest);
          return (
            <div
              key={guest.id}
              className={`flex items-center gap-3 px-4 py-3 ${declined ? "opacity-60" : ""}`}
            >
              <span className="text-xs text-gray-300 w-7 flex-shrink-0">·</span>
              <span className={`flex-1 text-sm min-w-0 truncate ${declined ? "text-amber-700" : "text-gray-700"}`}>
                {guest.firstName} {guest.lastName}
                <span className="ml-1.5 text-xs text-gray-400">(no seat)</span>
                {declined && (
                  <span className="ml-1.5 text-xs text-amber-500">declined</span>
                )}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemoveGuest(guest.id, table.id)}
                  className="p-1 text-gray-300 hover:text-red-500 active:text-red-600 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add guest without a specific seat */}
        {!readOnly && !full && (
          <div className="px-4 py-2.5">
            <button
              type="button"
              onClick={() => onTapSeat(null)}
              className="text-xs text-gray-400 hover:text-primary active:text-primary/80 transition-colors"
            >
              + Add guest (no seat number)
            </button>
          </div>
        )}
      </div>

      {/* Meal summary */}
      {mealSummary && (
        <div className="px-4 py-2.5 border-t border-gray-100">
          <p className="text-xs text-gray-400">{mealSummary}</p>
        </div>
      )}
    </div>
  );
}

// ── Draggable guest card ──────────────────────────────────────────────────────

function DraggableGuestCard({
  guest,
  isSelected,
  onClick,
}: {
  guest: GuestSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: guest.id,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`px-3 py-2 rounded-lg border text-xs cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging
          ? "opacity-40"
          : isSelected
          ? "border-primary bg-primary/10 text-primary"
          : "border-gray-100 bg-gray-50 hover:bg-gray-100 text-gray-700"
      }`}
    >
      <p className="font-medium">
        {guest.firstName} {guest.lastName}
      </p>
      {guest.groupName && (
        <p className="text-gray-400 text-[10px]">{guest.groupName}</p>
      )}
    </div>
  );
}

// ── Droppable table card ──────────────────────────────────────────────────────

function DroppableTable({
  table,
  mealSummary,
  full,
  nearFull,
  selectedGuestId,
  onClickTable,
  onRemoveGuest,
  onDeleteTable,
  onUpdateTable,
  onAssignSeat,
  readOnly = false,
}: {
  table: TableWithGuests;
  mealSummary: string;
  full: boolean;
  nearFull: boolean;
  selectedGuestId: string | null;
  onClickTable: () => void;
  onRemoveGuest: (guestId: string, tableId: string) => void;
  onDeleteTable: (tableId: string) => void;
  onUpdateTable: (tableId: string, updates: any) => void;
  onAssignSeat: (guestId: string, seatNumber: number | null) => Promise<string | null>;
  readOnly?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: table.id });

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(table.name);
  const [editShape, setEditShape] = useState<string>(table.shape);
  const [editCapacity, setEditCapacity] = useState(table.capacity);
  const [editColour, setEditColour] = useState(table.colour ?? "#e2e8f0");
  const [editNotes, setEditNotes] = useState(table.notes ?? "");
  const [editSaving, setEditSaving] = useState(false);

  // Inline seat editing: which guest's seat dropdown is open
  const [editingSeatGuestId, setEditingSeatGuestId] = useState<string | null>(null);
  const [seatSaving, setSeatSaving] = useState(false);
  const [seatError, setSeatError] = useState("");

  function openEdit() {
    setEditName(table.name);
    setEditShape(table.shape);
    setEditCapacity(table.capacity);
    setEditColour(table.colour ?? "#e2e8f0");
    setEditNotes(table.notes ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    setEditSaving(true);
    await onUpdateTable(table.id, {
      name: editName.trim(),
      shape: editShape,
      capacity: editCapacity,
      colour: editColour,
      notes: editNotes.trim() || null,
    });
    setEditSaving(false);
    setEditing(false);
  }

  async function handleSeatSelect(guestId: string, value: string) {
    const seat = value === "" ? null : Number(value);
    setSeatSaving(true);
    setSeatError("");
    const err = await onAssignSeat(guestId, seat);
    setSeatSaving(false);
    if (err) {
      setSeatError(err);
    } else {
      setEditingSeatGuestId(null);
    }
  }

  const borderColor = full
    ? "border-red-300"
    : nearFull
    ? "border-amber-300"
    : isOver
    ? "border-primary"
    : "border-gray-200";

  const headerBg = full ? "bg-red-50" : nearFull ? "bg-amber-50" : "bg-gray-50";

  const capacityColor = full
    ? "text-red-600 font-semibold"
    : nearFull
    ? "text-amber-600"
    : "text-gray-400";

  // Compute empty seats
  const assignedSeatNumbers = table.guests.map((g) => g.seatNumber).filter((n): n is number => n != null);
  const allSeats = Array.from({ length: table.capacity }, (_, i) => i + 1);
  const emptySeats = allSeats.filter((n) => !assignedSeatNumbers.includes(n));
  const unseatedGuestCount = table.guests.filter((g) => g.seatNumber == null).length;
  const anySeatsAssigned = assignedSeatNumbers.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`bg-white rounded-xl border-2 transition-colors ${borderColor} ${
        isOver ? "ring-2 ring-primary/20" : ""
      }`}
      onClick={selectedGuestId && !editing ? onClickTable : undefined}
      style={selectedGuestId && !editing ? { cursor: "pointer" } : undefined}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-xl ${headerBg}`}>
        <div className="flex items-center gap-2">
          {table.colour && table.colour !== "#e2e8f0" && (
            <span
              className="inline-block w-3 h-3 rounded-full border border-gray-300 flex-shrink-0"
              style={{ background: table.colour }}
            />
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">{table.name}</p>
            {table.notes && (
              <p className="text-[11px] text-gray-400 italic leading-tight">{table.notes}</p>
            )}
          </div>
          <span className="text-xs text-gray-400 capitalize">{table.shape.toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${capacityColor}`}>
            {table.guests.length}/{table.capacity}
            {full && " FULL"}
          </span>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openEdit(); }}
                className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Edit table"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${table.name}"? This will unassign ${table.guests.length} guests.`)) {
                    onDeleteTable(table.id);
                  }
                }}
                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && !readOnly && (
        <div
          className="px-4 py-3 border-b border-gray-100 space-y-3 bg-gray-50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-gray-400 block mb-0.5">Name</label>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Shape</label>
              <select
                value={editShape}
                onChange={(e) => setEditShape(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ROUND">Round</option>
                <option value="RECTANGULAR">Rectangular</option>
                <option value="OVAL">Oval</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Capacity</label>
              <input
                type="number" min={1} max={50}
                value={editCapacity}
                onChange={(e) => setEditCapacity(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {editCapacity < table.guests.length && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {table.guests.length} guests assigned
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Colour</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOUR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColour(c)}
                  className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: editColour === c ? "#6366f1" : "#d1d5db",
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for this table"
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={editSaving || !editName.trim()}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-60"
            >
              {editSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Guest rows */}
      <div className="px-4 py-2 min-h-[2.5rem]">
        {table.guests.length === 0 ? (
          <p className="text-xs text-gray-300 py-1">
            {isOver ? "Drop to assign" : "No guests assigned"}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {[...table.guests]
              .sort((a, b) => {
                if (a.seatNumber === null && b.seatNumber === null) {
                  const ln = (a.lastName || "").localeCompare(b.lastName || "");
                  return ln !== 0 ? ln : (a.firstName || "").localeCompare(b.firstName || "");
                }
                if (a.seatNumber === null) return 1;
                if (b.seatNumber === null) return -1;
                return a.seatNumber - b.seatNumber;
              })
              .map((g) => {
              const declined = !isReceptionEligible(g);
              const isEditingSeat = editingSeatGuestId === g.id;
              const takenByOthers = table.guests
                .filter((og) => og.id !== g.id && og.seatNumber != null)
                .map((og) => og.seatNumber!);

              return (
                <div
                  key={g.id}
                  className={`flex items-center gap-2 py-1.5 ${declined ? "opacity-75" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Name */}
                  <span className={`flex-1 text-xs min-w-0 truncate ${declined ? "text-amber-700" : "text-gray-700"}`}>
                    {g.firstName} {g.lastName}
                    {declined && (
                      <span className="ml-1 text-[9px] text-amber-500">✕ declined</span>
                    )}
                  </span>

                  {/* Seat badge / editor */}
                  {!readOnly && isEditingSeat ? (
                    <div className="flex items-center gap-1">
                      <select
                        autoFocus
                        defaultValue={g.seatNumber ?? ""}
                        disabled={seatSaving}
                        onChange={(e) => handleSeatSelect(g.id, e.target.value)}
                        onBlur={() => { if (!seatSaving) setEditingSeatGuestId(null); }}
                        className="px-1.5 py-0.5 border border-gray-300 rounded text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                      >
                        <option value="">— no seat —</option>
                        {allSeats.map((n) => {
                          const taken = takenByOthers.includes(n);
                          const occupant = table.guests.find((og) => og.id !== g.id && og.seatNumber === n);
                          return (
                            <option key={n} value={n} disabled={taken}>
                              {taken ? `Seat ${n} — ${occupant?.firstName} ${occupant?.lastName}` : `Seat ${n}`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ) : (
                    <span
                      onClick={!readOnly ? () => { setEditingSeatGuestId(g.id); setSeatError(""); } : undefined}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        g.seatNumber != null
                          ? "bg-indigo-50 border-indigo-200 text-indigo-600" + (!readOnly ? " hover:bg-indigo-100 cursor-pointer" : "")
                          : "bg-gray-50 border-gray-200 text-gray-400" + (!readOnly ? " hover:bg-gray-100 cursor-pointer" : "")
                      }`}
                      title={!readOnly ? "Click to change seat" : undefined}
                    >
                      {g.seatNumber != null ? `Seat ${g.seatNumber}` : "No seat"}
                    </span>
                  )}

                  {/* Remove */}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveGuest(g.id, table.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {seatError && (
          <p className="text-[10px] text-red-600 mt-1">{seatError}</p>
        )}
      </div>

      {/* Empty seats row */}
      {table.guests.length > 0 && (
        <div className="px-4 py-1.5 border-t border-gray-100">
          {anySeatsAssigned ? (
            emptySeats.length > 0 ? (
              <p className="text-[10px] text-gray-400">
                Empty seats: {emptySeats.join(", ")}
                {unseatedGuestCount > 0 && (
                  <span className="ml-1 text-amber-500">· {unseatedGuestCount} guest{unseatedGuestCount !== 1 ? "s" : ""} without a seat number</span>
                )}
              </p>
            ) : unseatedGuestCount > 0 ? (
              <p className="text-[10px] text-amber-500">
                {unseatedGuestCount} guest{unseatedGuestCount !== 1 ? "s" : ""} without a seat number
              </p>
            ) : (
              <p className="text-[10px] text-green-600">All seats assigned</p>
            )
          ) : (
            <p className="text-[10px] text-gray-400">
              {table.capacity - table.guests.length} seat{table.capacity - table.guests.length !== 1 ? "s" : ""} unoccupied
            </p>
          )}
        </div>
      )}

      {/* Meal summary */}
      {mealSummary && (
        <div className="px-4 py-1.5 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">{mealSummary}</p>
        </div>
      )}
    </div>
  );
}

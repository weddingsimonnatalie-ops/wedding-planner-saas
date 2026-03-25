"use client";

import {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import {
  Stage, Layer, Circle, Rect, Ellipse, Group, Text, Transformer, Shape,
} from "react-konva";
import type Konva from "konva";
import type {
  GuestSummary, TableWithGuests, Room, MealOptionSummary,
} from "@/lib/seating-types";
import { isReceptionEligible } from "@/lib/seating-types";
import { Plus, Minus, RotateCcw, RotateCw, Grid, X, Settings } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOUR_PRESETS = [
  "#e2e8f0", "#fca5a5", "#fdba74", "#fcd34d",
  "#86efac", "#67e8f9", "#93c5fd", "#c4b5fd",
  "#f9a8d4", "#6ee7b7", "#a5b4fc", "#bbf7d0",
];

const ELEMENT_TYPES = [
  { type: "STAGE", label: "Stage", color: "#f3f0ff", defaultW: 180, defaultH: 90 },
  { type: "DANCEFLOOR", label: "Dance Floor", color: "#fef9c3", defaultW: 150, defaultH: 150 },
  { type: "BAR", label: "Bar", color: "#dcfce7", defaultW: 90, defaultH: 45 },
  { type: "ENTRANCE", label: "Entrance", color: "#ffe4e6", defaultW: 60, defaultH: 30 },
  { type: "OTHER", label: "Other", color: "#f1f5f9", defaultW: 60, defaultH: 60 },
];

const CANVAS_W = 900;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const MAX_HISTORY = 50;

function randomId(): string {
  const s = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${s()}${s()}-${s()}-4${s().slice(1)}-${s()}-${s()}${s()}${s()}`;
}

/** Luminance-based text colour: dark on light, light on dark */
function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1e293b" : "#ffffff";
}

function strokeFromFill(hex: string): string {
  // Darken the fill slightly for stroke
  const c = hex.replace("#", "");
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - 40);
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - 40);
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - 40);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize;
}

// ─── Snapshot type for undo/redo ──────────────────────────────────────────────

interface Snapshot {
  tables: Array<{ id: string; positionX: number; positionY: number; width: number; height: number; rotation: number; colour: string; locked: boolean }>;
  elements: Room["elements"];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SeatPopup {
  tableId: string;
  seatNumber: number;
  screenX: number;
  screenY: number;
}

interface Props {
  room: Room;
  tables: TableWithGuests[];
  unassigned: GuestSummary[];
  mealOptions: MealOptionSummary[];
  onCreateTable: (data: { name: string; shape: string; capacity: number; positionX?: number; positionY?: number }) => Promise<any>;
  onDeleteTable: (tableId: string) => void;
  onPatchTable: (tableId: string, updates: any) => void;
  onUpdateTable: (tableId: string, updates: any) => void;
  onUpdateRoom: (updates: any) => void;
  onPersistElements: (elements: Room["elements"]) => void;
  onAssignGuest: (guestId: string, tableId: string) => void;
  onRemoveGuest: (guestId: string, tableId: string) => void;
  onAssignSeat: (guestId: string, seatNumber: number | null) => Promise<string | null>;
  /** When true, trigger a floor-plan print and call onFloorPrintDone when complete */
  triggerFloorPrint?: boolean;
  onFloorPrintDone?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SeatingVisualView({
  room, tables, unassigned, mealOptions,
  onCreateTable, onDeleteTable, onPatchTable, onUpdateTable,
  onUpdateRoom, onPersistElements, onAssignGuest, onRemoveGuest, onAssignSeat,
  triggerFloorPrint, onFloorPrintDone,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectionRectRef = useRef<Konva.Rect>(null);

  // Stage dimensions (fill container)
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectingRect, setIsSelectingRect] = useState(false);
  const selectionStart = useRef({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState({ x: 0, y: 0, w: 0, h: 0, visible: false });

  // Toolbar state
  const [snapOn, setSnapOn] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [showAddTable, setShowAddTable] = useState(false);
  const [showAddElement, setShowAddElement] = useState(false);
  const [showRoomSetup, setShowRoomSetup] = useState(false);

  // Add table form
  const [newName, setNewName] = useState("");
  const [newShape, setNewShape] = useState("ROUND");
  const [newCapacity, setNewCapacity] = useState(8);

  // Room setup form
  const [roomWidth, setRoomWidth] = useState(room.widthMetres);
  const [roomHeight, setRoomHeight] = useState(room.heightMetres);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string; type: "table" | "element" } | null>(null);

  // Undo / redo
  const history = useRef<Snapshot[]>([]);
  const historyIndex = useRef(-1);

  // Debounce save timer
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Panel state (synced to selected single table)
  const [panelName, setPanelName] = useState("");
  const [panelShape, setPanelShape] = useState("ROUND");
  const [panelCapacity, setPanelCapacity] = useState(8);
  const [panelColour, setPanelColour] = useState("#e2e8f0");
  const [panelWidth, setPanelWidth] = useState(60);
  const [panelHeight, setPanelHeight] = useState(60);
  const [panelRotation, setPanelRotation] = useState(0);
  const [panelLocked, setPanelLocked] = useState(false);
  const [panelNotes, setPanelNotes] = useState("");

  // Seat popup
  const [seatPopup, setSeatPopup] = useState<SeatPopup | null>(null);
  const [seatAssigning, setSeatAssigning] = useState(false);
  const [seatError, setSeatError] = useState("");

  // (print dropdown is in the parent SeatingClient)

  const CANVAS_H = Math.round(CANVAS_W * (room.heightMetres / room.widthMetres));
  const mealMap = useMemo(
    () => Object.fromEntries(mealOptions.map((m) => [m.id, m.name])),
    [mealOptions]
  );

  // Single selected table (for properties panel)
  const selectedTable = selectedIds.length === 1
    ? tables.find((t) => t.id === selectedIds[0]) ?? null
    : null;
  const selectedElement = selectedIds.length === 1
    ? room.elements.find((e) => e.id === selectedIds[0]) ?? null
    : null;

  // ── Resize observer ──────────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setStageSize({ w: el.clientWidth, h: el.clientHeight });
    });
    obs.observe(el);
    setStageSize({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  // ── Sync panel from selected table ───────────────────────────────────────────

  useEffect(() => {
    if (selectedTable) {
      setPanelName(selectedTable.name);
      setPanelShape(selectedTable.shape);
      setPanelCapacity(selectedTable.capacity);
      setPanelColour(selectedTable.colour ?? "#e2e8f0");
      setPanelWidth(Math.round(selectedTable.width ?? 60));
      setPanelHeight(Math.round(selectedTable.height ?? 60));
      setPanelRotation(Math.round(selectedTable.rotation ?? 0));
      setPanelLocked(selectedTable.locked ?? false);
      setPanelNotes(selectedTable.notes ?? "");
    }
  }, [selectedTable?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transformer nodes ─────────────────────────────────────────────────────────

  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;

    // Transformer only active for single selection
    if (selectedIds.length === 1) {
      const node = stage.findOne(`#${selectedIds[0]}`);
      tr.nodes(node ? [node] : []);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedIds, tables, room.elements]);

  // ── Undo / redo ──────────────────────────────────────────────────────────────

  function makeSnapshot(): Snapshot {
    return {
      tables: tables.map((t) => ({
        id: t.id, positionX: t.positionX, positionY: t.positionY,
        width: t.width, height: t.height, rotation: t.rotation,
        colour: t.colour, locked: t.locked,
      })),
      elements: room.elements.map((e) => ({ ...e })),
    };
  }

  function pushHistory() {
    const snap = makeSnapshot();
    const newHistory = history.current.slice(0, historyIndex.current + 1);
    newHistory.push(snap);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    history.current = newHistory;
    historyIndex.current = newHistory.length - 1;
  }

  function applySnapshot(snap: Snapshot) {
    snap.tables.forEach((s) => {
      onPatchTable(s.id, {
        positionX: s.positionX, positionY: s.positionY,
        width: s.width, height: s.height, rotation: s.rotation,
        colour: s.colour, locked: s.locked,
      });
    });
    onPersistElements(snap.elements);
  }

  function undo() {
    if (historyIndex.current <= 0) return;
    historyIndex.current--;
    applySnapshot(history.current[historyIndex.current]);
  }

  function redo() {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current++;
    applySnapshot(history.current[historyIndex.current]);
  }

  // Push initial snapshot once
  useEffect(() => {
    if (history.current.length === 0) pushHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape") {
        setSelectedIds([]);
        setContextMenu(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [tables, room.elements]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced save helper ──────────────────────────────────────────────────

  function debounceSave(fn: () => void) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(fn, 500);
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const newScale = e.evt.deltaY < 0
      ? Math.min(MAX_ZOOM, oldScale * scaleBy)
      : Math.max(MIN_ZOOM, oldScale / scaleBy);

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setZoom(newScale);
    setStagePos(newPos);
  }

  function fitToScreen() {
    const padding = 40;
    const scaleX = (stageSize.w - padding * 2) / CANVAS_W;
    const scaleY = (stageSize.h - padding * 2) / CANVAS_H;
    const scale = Math.min(scaleX, scaleY, 1);
    const x = (stageSize.w - CANVAS_W * scale) / 2;
    const y = (stageSize.h - CANVAS_H * scale) / 2;
    setZoom(scale);
    setStagePos({ x, y });
  }

  // Auto fit on first render
  useEffect(() => {
    if (stageSize.w > 100) fitToScreen();
  }, [stageSize.w]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage click (deselect) ────────────────────────────────────────────────

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    // Right-click handled separately
    if (e.evt.button === 2) return;

    const clickedOnEmpty = e.target === stageRef.current || e.target === e.target.getStage();
    if (!clickedOnEmpty) return;

    setContextMenu(null);

    // Start drag-selection rectangle
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    selectionStart.current = pos;
    setIsSelectingRect(true);
    setSelectionRect({ x: pos.x, y: pos.y, w: 0, h: 0, visible: true });

    if (!e.evt.shiftKey) {
      setSelectedIds([]);
    }
  }

  function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isSelectingRect) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    setSelectionRect({
      x: Math.min(pos.x, selectionStart.current.x),
      y: Math.min(pos.y, selectionStart.current.y),
      w: Math.abs(pos.x - selectionStart.current.x),
      h: Math.abs(pos.y - selectionStart.current.y),
      visible: true,
    });
  }

  function handleStageMouseUp() {
    if (!isSelectingRect) return;
    setIsSelectingRect(false);

    // Select all objects within the rect
    if (selectionRect.w > 5 || selectionRect.h > 5) {
      const box = {
        x1: selectionRect.x, y1: selectionRect.y,
        x2: selectionRect.x + selectionRect.w,
        y2: selectionRect.y + selectionRect.h,
      };
      const ids: string[] = [];
      tables.forEach((t) => {
        if (t.positionX >= box.x1 && t.positionX <= box.x2 &&
            t.positionY >= box.y1 && t.positionY <= box.y2) {
          ids.push(t.id);
        }
      });
      room.elements.forEach((el) => {
        const cx = el.positionX + el.width / 2;
        const cy = el.positionY + el.height / 2;
        if (cx >= box.x1 && cx <= box.x2 && cy >= box.y1 && cy <= box.y2) {
          ids.push(el.id);
        }
      });
      if (ids.length > 0) setSelectedIds(ids);
    }

    setSelectionRect((r) => ({ ...r, visible: false }));
  }

  // ── Object click ─────────────────────────────────────────────────────────

  function handleObjectClick(e: Konva.KonvaEventObject<MouseEvent>, id: string) {
    e.cancelBubble = true;
    setContextMenu(null);
    if (e.evt.shiftKey) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  }

  // ── Right-click context menu ──────────────────────────────────────────────

  function handleContextMenu(e: Konva.KonvaEventObject<PointerEvent>, id: string, type: "table" | "element") {
    e.evt.preventDefault();
    e.cancelBubble = true;
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container().getBoundingClientRect();
    setContextMenu({
      x: e.evt.clientX - container.left,
      y: e.evt.clientY - container.top,
      id,
      type,
    });
    setSelectedIds([id]);
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  function contextLockToggle() {
    if (!contextMenu) return;
    const { id, type } = contextMenu;
    if (type === "table") {
      const t = tables.find((t) => t.id === id);
      if (!t) return;
      const locked = !t.locked;
      onPatchTable(id, { locked });
      if (selectedTable?.id === id) setPanelLocked(locked);
    } else {
      const el = room.elements.find((e) => e.id === id);
      if (!el) return;
      const updated = room.elements.map((e) =>
        e.id === id ? { ...e, locked: !e.locked } : e
      );
      onPersistElements(updated);
    }
    closeContextMenu();
  }

  function contextDelete() {
    if (!contextMenu) return;
    const { id, type } = contextMenu;
    closeContextMenu();
    if (type === "table") {
      if (confirm(`Delete this table?`)) {
        pushHistory();
        onDeleteTable(id);
        setSelectedIds([]);
      }
    } else {
      pushHistory();
      onPersistElements(room.elements.filter((e) => e.id !== id));
      setSelectedIds([]);
    }
  }

  // ── Table drag ────────────────────────────────────────────────────────────

  function handleTableDragEnd(e: Konva.KonvaEventObject<DragEvent>, tableId: string) {
    const node = e.target;
    let x = node.x();
    let y = node.y();
    if (snapOn) {
      x = snapToGrid(x, gridSize);
      y = snapToGrid(y, gridSize);
      node.position({ x, y });
    }
    // Move all selected objects together if multi-selected
    if (selectedIds.length > 1 && selectedIds.includes(tableId)) {
      const dx = x - (tables.find((t) => t.id === tableId)?.positionX ?? x);
      const dy = y - (tables.find((t) => t.id === tableId)?.positionY ?? y);
      selectedIds.forEach((sid) => {
        const t = tables.find((t) => t.id === sid);
        if (t && sid !== tableId) {
          onPatchTable(sid, { positionX: t.positionX + dx, positionY: t.positionY + dy });
        }
      });
    }
    pushHistory();
    debounceSave(() => onPatchTable(tableId, { positionX: x, positionY: y }));
  }

  // ── Table transform end ───────────────────────────────────────────────────

  function handleTransformEnd(e: Konva.KonvaEventObject<Event>, tableId: string) {
    const node = e.target as Konva.Node;
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    // Normalise scaleX/scaleY back into width/height
    const newWidth = Math.max(40, Math.min(200, (table.width ?? 60) * node.scaleX()));
    const newHeight = (table.shape === "ROUND" || table.shape === "OVAL")
      ? newWidth
      : Math.max(40, Math.min(200, (table.height ?? 60) * node.scaleY()));
    const newRotation = ((node.rotation() % 360) + 360) % 360;

    node.scaleX(1);
    node.scaleY(1);
    if (table.shape === "ROUND" || table.shape === "OVAL") {
      node.scaleY(1);
    }

    pushHistory();
    onPatchTable(tableId, { width: newWidth, height: newHeight, rotation: newRotation });
    setPanelWidth(Math.round(newWidth));
    setPanelHeight(Math.round(newHeight));
    setPanelRotation(Math.round(newRotation));
  }

  // ── Element drag end ──────────────────────────────────────────────────────

  function handleElementDragEnd(e: Konva.KonvaEventObject<DragEvent>, elId: string) {
    const node = e.target;
    let x = node.x();
    let y = node.y();
    if (snapOn) {
      x = snapToGrid(x, gridSize);
      y = snapToGrid(y, gridSize);
      node.position({ x, y });
    }
    pushHistory();
    const updated = room.elements.map((el) =>
      el.id === elId ? { ...el, positionX: x, positionY: y } : el
    );
    debounceSave(() => onPersistElements(updated));
  }

  // ── Element transform end ─────────────────────────────────────────────────

  function handleElementTransformEnd(e: Konva.KonvaEventObject<Event>, elId: string) {
    const node = e.target as Konva.Node;
    const el = room.elements.find((el) => el.id === elId);
    if (!el) return;

    const newWidth = Math.max(20, el.width * node.scaleX());
    const newHeight = Math.max(20, el.height * node.scaleY());
    const newRotation = ((node.rotation() % 360) + 360) % 360;

    node.scaleX(1);
    node.scaleY(1);

    pushHistory();
    const updated = room.elements.map((e) =>
      e.id === elId ? { ...e, width: newWidth, height: newHeight, rotation: newRotation } : e
    );
    debounceSave(() => onPersistElements(updated));
  }

  // ── Add table ─────────────────────────────────────────────────────────────

  async function handleAddTable() {
    if (!newName.trim()) return;
    pushHistory();
    await onCreateTable({
      name: newName.trim(),
      shape: newShape,
      capacity: newCapacity,
      positionX: CANVAS_W * 0.5,
      positionY: CANVAS_H * 0.5,
    });
    setNewName("");
    setNewShape("ROUND");
    setNewCapacity(8);
    setShowAddTable(false);
  }

  // ── Add element ───────────────────────────────────────────────────────────

  function handleAddElement(type: string) {
    const def = ELEMENT_TYPES.find((e) => e.type === type) ?? ELEMENT_TYPES[0];
    const newEl = {
      id: randomId(),
      type: def.type,
      label: def.label,
      positionX: CANVAS_W * 0.3,
      positionY: CANVAS_H * 0.3,
      width: def.defaultW,
      height: def.defaultH,
      rotation: 0,
      color: def.color,
      locked: false,
    };
    pushHistory();
    onPersistElements([...room.elements, newEl]);
    setShowAddElement(false);
  }

  // ── Room setup ────────────────────────────────────────────────────────────

  async function handleSaveRoom() {
    await onUpdateRoom({ widthMetres: roomWidth, heightMetres: roomHeight });
    setShowRoomSetup(false);
  }

  // ── Print floor plan ───────────────────────────────────────────────────────

  function printFloorPlan() {
    const stage = stageRef.current;
    if (!stage) return;
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const win = window.open();
    if (!win) return;
    win.document.write(`<img src="${dataURL}" style="max-width:100%"/>`);
    win.document.close();
    win.onload = () => win.print();
  }

  // Triggered remotely by parent (e.g. from list view tab)
  useEffect(() => {
    if (!triggerFloorPrint) return;
    // Allow the canvas one animation frame to finish rendering before exporting
    const raf = requestAnimationFrame(() => {
      printFloorPlan();
      onFloorPrintDone?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [triggerFloorPrint]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seat positions around/alongside a table ────────────────────────────────

  function seatPositions(shape: string, w: number, h: number, capacity: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];
    if (shape === "ROUND") {
      const r = w / 2 + 16;
      for (let i = 0; i < capacity; i++) {
        const angle = (2 * Math.PI * i / capacity) - Math.PI / 2;
        positions.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
      }
    } else if (shape === "OVAL") {
      const rx = w / 2 + 16;
      const ry = h / 2 + 16;
      for (let i = 0; i < capacity; i++) {
        const angle = (2 * Math.PI * i / capacity) - Math.PI / 2;
        positions.push({ x: rx * Math.cos(angle), y: ry * Math.sin(angle) });
      }
    } else {
      // RECTANGULAR — distribute evenly around the perimeter
      const hw = w / 2 + 14;
      const hh = h / 2 + 14;
      const perimeter = 2 * (w + h);
      for (let i = 0; i < capacity; i++) {
        const t = (i / capacity) * perimeter;
        let x: number, y: number;
        if (t <= w) {
          x = -w / 2 + t; y = -hh;
        } else if (t <= w + h) {
          x = hw; y = -h / 2 + (t - w);
        } else if (t <= 2 * w + h) {
          x = w / 2 - (t - w - h); y = hh;
        } else {
          x = -hw; y = h / 2 - (t - 2 * w - h);
        }
        positions.push({ x, y });
      }
    }
    return positions;
  }

  // ── Seat click ─────────────────────────────────────────────────────────────

  function handleSeatClick(
    e: Konva.KonvaEventObject<MouseEvent>,
    table: TableWithGuests,
    seatNumber: number,
    seatLocalX: number,
    seatLocalY: number
  ) {
    e.cancelBubble = true;
    const rot = ((table.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const worldX = table.positionX + seatLocalX * cos - seatLocalY * sin;
    const worldY = table.positionY + seatLocalX * sin + seatLocalY * cos;
    const screenX = worldX * zoom + stagePos.x;
    const screenY = worldY * zoom + stagePos.y;
    setSeatPopup({ tableId: table.id, seatNumber, screenX, screenY });
    setSeatError("");
  }

  // ── Alignment ─────────────────────────────────────────────────────────────

  function alignObjects(mode: string) {
    if (selectedIds.length < 2) return;
    const positions = selectedIds.map((id) => {
      const t = tables.find((t) => t.id === id);
      if (t) return { id, x: t.positionX, y: t.positionY, w: t.width, h: t.height, type: "table" as const };
      const el = room.elements.find((e) => e.id === id);
      if (el) return { id, x: el.positionX, y: el.positionY, w: el.width, h: el.height, type: "element" as const };
      return null;
    }).filter(Boolean) as Array<{ id: string; x: number; y: number; w: number; h: number; type: "table" | "element" }>;

    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x));
    const maxY = Math.max(...positions.map((p) => p.y));
    const maxW = Math.max(...positions.map((p) => p.w));
    const maxH = Math.max(...positions.map((p) => p.h));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    pushHistory();
    positions.forEach((p) => {
      let newX = p.x, newY = p.y;
      if (mode === "left") newX = minX;
      else if (mode === "right") newX = maxX;
      else if (mode === "top") newY = minY;
      else if (mode === "bottom") newY = maxY;
      else if (mode === "centerH") newX = centerX;
      else if (mode === "centerV") newY = centerY;
      else if (mode === "distH") {
        const sorted = [...positions].sort((a, b) => a.x - b.x);
        const gap = (maxX - minX) / (sorted.length - 1);
        const idx = sorted.findIndex((s) => s.id === p.id);
        newX = minX + idx * gap;
      } else if (mode === "distV") {
        const sorted = [...positions].sort((a, b) => a.y - b.y);
        const gap = (maxY - minY) / (sorted.length - 1);
        const idx = sorted.findIndex((s) => s.id === p.id);
        newY = minY + idx * gap;
      }

      if (p.type === "table") {
        onPatchTable(p.id, { positionX: newX, positionY: newY });
      }
    });

    // Update elements
    const updatedEls = room.elements.map((el) => {
      const p = positions.find((p) => p.id === el.id);
      if (!p) return el;
      let newX = p.x, newY = p.y;
      if (mode === "left") newX = minX;
      else if (mode === "right") newX = maxX;
      else if (mode === "top") newY = minY;
      else if (mode === "bottom") newY = maxY;
      else if (mode === "centerH") newX = centerX;
      else if (mode === "centerV") newY = centerY;
      return { ...el, positionX: newX, positionY: newY };
    });
    onPersistElements(updatedEls);
  }

  // ── Panel save (debounced) ─────────────────────────────────────────────────

  function panelSave(updates: any) {
    if (!selectedTable) return;
    onPatchTable(selectedTable.id, updates);
  }

  // ── Dot grid (single Shape draw for performance) ──────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawDotGrid = useCallback((ctx: any) => {
    if (!snapOn) return;
    // Access underlying 2D canvas context for native arc batching
    const raw: CanvasRenderingContext2D = ctx._context ?? ctx;
    raw.save();
    raw.fillStyle = "#d1d5db";
    raw.beginPath();
    for (let x = 0; x <= CANVAS_W; x += gridSize) {
      for (let y = 0; y <= CANVAS_H; y += gridSize) {
        raw.moveTo(x + 1.5, y);
        raw.arc(x, y, 1.5, 0, Math.PI * 2, false);
      }
    }
    raw.fill();
    raw.restore();
  }, [snapOn, gridSize, CANVAS_H]);

  // ── Seat circle nodes ─────────────────────────────────────────────────────

  function seatNodes(table: TableWithGuests) {
    const w = table.width ?? 60;
    const h = table.height ?? 60;
    const positions = seatPositions(table.shape, w, h, table.capacity);
    const seatRadius = 9;

    return positions.map((pos, idx) => {
      const seatNum = idx + 1;
      const occupant = table.guests.find((g) => g.seatNumber === seatNum);
      const isEmpty = !occupant;
      const fill = isEmpty ? "#ffffff" : "#6366f1";
      const stroke = isEmpty ? "#9ca3af" : "#4338ca";
      const textFill = isEmpty ? "#6b7280" : "#ffffff";

      // Seat label: number only, or + initials / name at higher zoom
      let label = String(seatNum);
      if (occupant && zoom >= 1.5) {
        label = occupant.firstName.slice(0, 6);
      } else if (occupant && zoom >= 1.0) {
        label = `${occupant.firstName[0]}${occupant.lastName[0]}`;
      }

      return (
        <Group
          key={`seat-${seatNum}`}
          x={pos.x}
          y={pos.y}
          onClick={(e) => handleSeatClick(e, table, seatNum, pos.x, pos.y)}
          onTap={(e) => handleSeatClick(e as any, table, seatNum, pos.x, pos.y)}
        >
          <Circle
            radius={seatRadius}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
          />
          <Text
            x={-seatRadius}
            y={-5}
            width={seatRadius * 2}
            text={label}
            fontSize={occupant && zoom >= 1.0 ? 7 : 8}
            fill={textFill}
            align="center"
            listening={false}
          />
        </Group>
      );
    });
  }

  // ── Render table ──────────────────────────────────────────────────────────

  function renderTable(table: TableWithGuests) {
    const w = table.width ?? 60;
    const h = table.height ?? 60;
    const fill = table.colour ?? "#e2e8f0";
    const stroke = selectedIds.includes(table.id) ? "#6366f1" : strokeFromFill(fill);
    const strokeWidth = selectedIds.includes(table.id) ? 3 : 1.5;
    const textColor = contrastText(fill);
    const label = `${table.guests.length}/${table.capacity}`;
    const isLocked = table.locked ?? false;

    const sharedProps = {
      fill,
      stroke,
      strokeWidth,
    };

    return (
      <Group
        key={table.id}
        id={table.id}
        x={table.positionX}
        y={table.positionY}
        rotation={table.rotation ?? 0}
        draggable={!isLocked}
        onClick={(e) => handleObjectClick(e, table.id)}
        onTap={(e) => handleObjectClick(e as any, table.id)}
        onContextMenu={(e) => handleContextMenu(e as any, table.id, "table")}
        onDragEnd={(e) => handleTableDragEnd(e, table.id)}
        onTransformEnd={(e) => handleTransformEnd(e, table.id)}
        offsetX={0}
        offsetY={0}
      >
        {table.shape === "ROUND" ? (
          <Circle radius={w / 2} {...sharedProps} offsetX={0} offsetY={0} />
        ) : table.shape === "OVAL" ? (
          <Ellipse radiusX={w / 2} radiusY={h / 2} {...sharedProps} />
        ) : (
          <Rect
            x={-w / 2} y={-h / 2}
            width={w} height={h}
            cornerRadius={8}
            {...sharedProps}
          />
        )}

        {/* Table name */}
        <Text
          x={-w / 2}
          y={-12}
          width={w}
          text={table.name.length > 14 ? table.name.slice(0, 13) + "…" : table.name}
          fontSize={11}
          fontStyle="bold"
          fill={textColor}
          align="center"
          listening={false}
        />
        {/* Guest count */}
        <Text
          x={-w / 2}
          y={4}
          width={w}
          text={label}
          fontSize={10}
          fill={textColor}
          align="center"
          listening={false}
        />

        {/* Seat circles */}
        {seatNodes(table)}

        {/* Lock icon */}
        {isLocked && (
          <Text
            x={-w / 2 + 4}
            y={-h / 2 + 4}
            text="🔒"
            fontSize={10}
            listening={false}
          />
        )}

        {/* Notes indicator */}
        {table.notes && (
          <Text
            x={w / 2 - 14}
            y={-h / 2 + 4}
            text="ℹ"
            fontSize={10}
            listening={false}
          />
        )}
      </Group>
    );
  }

  // ── Render element ────────────────────────────────────────────────────────

  function renderElement(el: Room["elements"][0]) {
    const fill = el.color ?? "#e2e8f0";
    const stroke = selectedIds.includes(el.id) ? "#6366f1" : "#d1d5db";
    const strokeWidth = selectedIds.includes(el.id) ? 3 : 1;
    const textColor = contrastText(fill);
    const isLocked = el.locked ?? false;

    return (
      <Group
        key={el.id}
        id={el.id}
        x={el.positionX}
        y={el.positionY}
        rotation={el.rotation ?? 0}
        draggable={!isLocked}
        onClick={(e) => handleObjectClick(e, el.id)}
        onTap={(e) => handleObjectClick(e as any, el.id)}
        onContextMenu={(e) => handleContextMenu(e as any, el.id, "element")}
        onDragEnd={(e) => handleElementDragEnd(e, el.id)}
        onTransformEnd={(e) => handleElementTransformEnd(e, el.id)}
      >
        <Rect
          width={el.width}
          height={el.height}
          cornerRadius={4}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          opacity={0.9}
        />
        <Text
          x={0}
          y={el.height / 2 - 8}
          width={el.width}
          text={el.label ?? el.type}
          fontSize={11}
          fill={textColor}
          align="center"
          listening={false}
        />
        {isLocked && (
          <Text
            x={4}
            y={4}
            text="🔒"
            fontSize={10}
            listening={false}
          />
        )}
      </Group>
    );
  }

  // ── Transformer keepRatio ─────────────────────────────────────────────────

  const keepRatio: boolean = panelShape === "ROUND" || panelShape === "OVAL";

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Canvas column */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {/* Undo / Redo */}
          <button
            onClick={undo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-gray-200 mx-0.5" />

          {/* Snap */}
          <button
            onClick={() => setSnapOn((v) => !v)}
            title="Toggle snap to grid"
            className={`flex items-center gap-1 px-2 py-1.5 border rounded-lg text-xs font-medium ${
              snapOn ? "bg-primary/10 border-primary/30 text-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Grid className="w-3.5 h-3.5" /> Snap
          </button>
          <div className="relative">
            <button
              onClick={() => setShowGridMenu((v) => !v)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
            >
              {gridSize}px ▾
            </button>
            {showGridMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                {[10, 20, 40].map((g) => (
                  <button
                    key={g}
                    onClick={() => { setGridSize(g); setShowGridMenu(false); }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${gridSize === g ? "text-primary font-medium" : "text-gray-700"}`}
                  >
                    {g}px
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-gray-200 mx-0.5" />

          {/* Zoom */}
          <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitToScreen}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
            title="Fit to screen"
          >
            ⊡ Fit
          </button>

          <div className="w-px h-5 bg-gray-200 mx-0.5" />

          {/* Add table */}
          <button
            onClick={() => setShowAddTable(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" /> Add Table
          </button>

          {/* Add element */}
          <div className="relative">
            <button
              onClick={() => setShowAddElement((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
            >
              <Plus className="w-3.5 h-3.5" /> Element ▾
            </button>
            {showAddElement && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                {ELEMENT_TYPES.map((et) => (
                  <button
                    key={et.type}
                    onClick={() => handleAddElement(et.type)}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                    style={{ borderLeft: `3px solid ${et.color}` }}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Room setup */}
          <button
            onClick={() => { setRoomWidth(room.widthMetres); setRoomHeight(room.heightMetres); setShowRoomSetup(true); }}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
          >
            <Settings className="w-3.5 h-3.5" /> Room
          </button>

          {/* Floor plan print — triggered directly from visual view toolbar */}
          <button
            onClick={printFloorPlan}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
            title="Print floor plan"
          >
            🗺 Floor Plan
          </button>
        </div>

        {/* Alignment toolbar (multi-select) */}
        {selectedIds.length >= 2 && (
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs text-gray-400 mr-1">{selectedIds.length} selected:</span>
            {[
              { mode: "left",    label: "⬅ Left",   title: "Align left edges" },
              { mode: "centerH", label: "↔ Centre", title: "Centre horizontally" },
              { mode: "right",   label: "➡ Right",  title: "Align right edges" },
              { mode: "top",     label: "⬆ Top",    title: "Align top edges" },
              { mode: "centerV", label: "↕ Middle", title: "Centre vertically" },
              { mode: "bottom",  label: "⬇ Bottom", title: "Align bottom edges" },
            ].map(({ mode, label, title }) => (
              <button
                key={mode}
                onClick={() => alignObjects(mode)}
                title={title}
                className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 text-xs"
              >
                {label}
              </button>
            ))}
            {selectedIds.length >= 3 && (
              <>
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                <button onClick={() => alignObjects("distH")} title="Distribute horizontally" className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 text-xs">⇔ Dist H</button>
                <button onClick={() => alignObjects("distV")} title="Distribute vertically" className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 text-xs">⇕ Dist V</button>
              </>
            )}
          </div>
        )}

        {/* Add table inline form */}
        {showAddTable && (
          <div className="mb-2 bg-white border border-primary/30 rounded-xl p-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">New table</p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Table name *"
                className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && handleAddTable()}
              />
              <select
                value={newShape}
                onChange={(e) => setNewShape(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none"
              >
                <option value="ROUND">Round</option>
                <option value="RECTANGULAR">Rectangular</option>
                <option value="OVAL">Oval</option>
              </select>
              <input
                type="number" min={1} max={50}
                value={newCapacity}
                onChange={(e) => setNewCapacity(Number(e.target.value))}
                className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none"
              />
              <button onClick={handleAddTable} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium">Add</button>
              <button onClick={() => setShowAddTable(false)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600">Cancel</button>
            </div>
          </div>
        )}

        {/* Konva canvas */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden relative"
          onClick={() => { setContextMenu(null); setShowGridMenu(false); setShowAddElement(false); setSeatPopup(null); }}
        >
          <Stage
            ref={stageRef}
            width={stageSize.w}
            height={stageSize.h}
            scaleX={zoom}
            scaleY={zoom}
            x={stagePos.x}
            y={stagePos.y}
            draggable={selectedIds.length === 0 && !isSelectingRect}
            onWheel={handleWheel}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onDragEnd={(e) => {
              if (e.target === stageRef.current) {
                setStagePos({ x: e.target.x(), y: e.target.y() });
              }
            }}
          >
            {/* Dot grid layer */}
            <Layer listening={false}>
              <Rect
                x={0} y={0}
                width={CANVAS_W} height={CANVAS_H}
                fill="white"
                stroke="#e5e7eb"
                strokeWidth={2}
              />
              {/* Room dimensions */}
              <Text
                x={CANVAS_W - 4}
                y={CANVAS_H - 16}
                text={`${room.widthMetres}m × ${room.heightMetres}m`}
                fontSize={10}
                fill="#9ca3af"
                align="right"
                width={100}
                offsetX={100}
                listening={false}
              />
              {snapOn && (
                <Shape
                  listening={false}
                  sceneFunc={(ctx) => drawDotGrid(ctx)}
                />
              )}
            </Layer>

            {/* Elements layer */}
            <Layer>
              {room.elements.map(renderElement)}
            </Layer>

            {/* Tables layer */}
            <Layer>
              {tables.map(renderTable)}

              {/* Selection rectangle */}
              {selectionRect.visible && (
                <Rect
                  x={selectionRect.x}
                  y={selectionRect.y}
                  width={selectionRect.w}
                  height={selectionRect.h}
                  fill="rgba(99,102,241,0.08)"
                  stroke="#6366f1"
                  strokeWidth={1}
                  dash={[4, 2]}
                  listening={false}
                />
              )}

              {/* Transformer */}
              <Transformer
                ref={transformerRef}
                keepRatio={keepRatio}
                rotateEnabled={true}
                enabledAnchors={
                  keepRatio
                    ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                    : undefined
                }
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 40 || newBox.height < 40) return oldBox;
                  if (newBox.width > 200 || newBox.height > 200) return oldBox;
                  return newBox;
                }}
              />
            </Layer>
          </Stage>

          {/* Seat popup */}
          {seatPopup && (() => {
            const table = tables.find((t) => t.id === seatPopup.tableId);
            if (!table) return null;
            const occupant = table.guests.find((g) => g.seatNumber === seatPopup.seatNumber);
            const unseated = table.guests.filter((g) => g.seatNumber == null);
            return (
              <div
                className="absolute bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-3 min-w-[180px]"
                style={{ left: seatPopup.screenX + 12, top: seatPopup.screenY - 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Seat {seatPopup.seatNumber}</p>
                  <button onClick={() => setSeatPopup(null)} className="text-gray-300 hover:text-gray-600 text-sm leading-none">✕</button>
                </div>
                {seatError && <p className="text-[10px] text-red-600 mb-2">{seatError}</p>}
                {occupant ? (
                  <>
                    <p className="text-xs text-gray-600 mb-2">{occupant.firstName} {occupant.lastName}</p>
                    <button
                      disabled={seatAssigning}
                      onClick={async () => {
                        setSeatAssigning(true);
                        const err = await onAssignSeat(occupant.id, null);
                        setSeatAssigning(false);
                        if (err) setSeatError(err);
                        else setSeatPopup(null);
                      }}
                      className="w-full text-left text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {seatAssigning ? "Clearing…" : "✕ Clear seat"}
                    </button>
                  </>
                ) : unseated.length > 0 ? (
                  <select
                    defaultValue=""
                    disabled={seatAssigning}
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      setSeatAssigning(true);
                      const err = await onAssignSeat(e.target.value, seatPopup.seatNumber);
                      setSeatAssigning(false);
                      if (err) setSeatError(err);
                      else setSeatPopup(null);
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Assign guest…</option>
                    {unseated.map((g) => (
                      <option key={g.id} value={g.id}>{g.lastName}, {g.firstName}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400">All guests have seats</p>
                )}
              </div>
            );
          })()}

          {/* Context menu */}
          {contextMenu && (
            <div
              className="absolute bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 min-w-[130px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={contextLockToggle}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                {contextMenu.type === "table"
                  ? (tables.find((t) => t.id === contextMenu.id)?.locked ? "🔓 Unlock" : "🔒 Lock")
                  : (room.elements.find((e) => e.id === contextMenu.id)?.locked ? "🔓 Unlock" : "🔒 Lock")
                }
              </button>
              <button
                onClick={contextDelete}
                className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="w-72 flex flex-col gap-3 overflow-y-auto">
        {selectedTable ? (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Table Properties</p>
                <p className="text-xs text-gray-400 capitalize">{panelShape.toLowerCase()}</p>
              </div>
              <button onClick={() => setSelectedIds([])} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Name</label>
                <input
                  value={panelName}
                  onChange={(e) => setPanelName(e.target.value)}
                  onBlur={() => panelSave({ name: panelName })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Shape */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Shape</label>
                <select
                  value={panelShape}
                  onChange={(e) => {
                    const s = e.target.value;
                    setPanelShape(s);
                    const updates: any = { shape: s };
                    // Round/oval must keep equal dimensions
                    if (s === "ROUND" || s === "OVAL") {
                      setPanelHeight(panelWidth);
                      updates.height = panelWidth;
                    }
                    panelSave(updates);
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ROUND">Round</option>
                  <option value="OVAL">Oval</option>
                  <option value="RECTANGULAR">Rectangular</option>
                </select>
              </div>

              {/* Capacity */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Capacity</label>
                <input
                  type="number" min={1} max={50}
                  value={panelCapacity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPanelCapacity(v);
                    debounceSave(() => panelSave({ capacity: v }));
                  }}
                  className="w-24 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {panelCapacity < selectedTable.guests.length && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    {selectedTable.guests.length} guests assigned — reducing won&apos;t remove them
                  </p>
                )}
              </div>

              {/* Colour */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Colour</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLOUR_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setPanelColour(c);
                        panelSave({ colour: c });
                      }}
                      className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        background: c,
                        borderColor: panelColour === c ? "#6366f1" : "#d1d5db",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Width / Height */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Width (px)</label>
                  <input
                    type="number" min={40} max={200}
                    value={panelWidth}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPanelWidth(v);
                      if (panelShape === "ROUND" || panelShape === "OVAL") {
                        setPanelHeight(v);
                        debounceSave(() => panelSave({ width: v, height: v }));
                      } else {
                        debounceSave(() => panelSave({ width: v }));
                      }
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Height (px)</label>
                  <input
                    type="number" min={40} max={200}
                    value={panelHeight}
                    disabled={panelShape === "ROUND" || panelShape === "OVAL"}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPanelHeight(v);
                      debounceSave(() => panelSave({ height: v }));
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Rotation */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Rotation (°)</label>
                <input
                  type="number" min={0} max={360}
                  value={panelRotation}
                  onChange={(e) => {
                    const v = Number(e.target.value) % 360;
                    setPanelRotation(v);
                    // Apply to stage node directly
                    const node = stageRef.current?.findOne(`#${selectedTable.id}`);
                    if (node) node.rotation(v);
                    debounceSave(() => panelSave({ rotation: v }));
                  }}
                  className="w-24 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Locked */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">Locked</label>
                <button
                  onClick={() => {
                    const v = !panelLocked;
                    setPanelLocked(v);
                    panelSave({ locked: v });
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    panelLocked ? "bg-primary" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    panelLocked ? "translate-x-4" : "translate-x-0.5"
                  }`} />
                </button>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes</label>
                <textarea
                  value={panelNotes}
                  onChange={(e) => setPanelNotes(e.target.value)}
                  onBlur={() => panelSave({ notes: panelNotes.trim() || null })}
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>

            {/* Guest list */}
            <div className="border-t border-gray-100">
              <p className="px-4 pt-3 pb-1 text-xs font-medium text-gray-500">Guests at this table</p>
              <div className="px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
                {selectedTable.guests.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">No guests assigned</p>
                ) : (
                  [...selectedTable.guests]
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
                    return (
                      <div
                        key={g.id}
                        className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                          declined ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-700"
                        }`}
                      >
                        <div>
                          <span>{g.firstName} {g.lastName}</span>
                          {declined && <div className="text-[9px] text-amber-600">Declined</div>}
                        </div>
                        <button
                          onClick={() => onRemoveGuest(g.id, selectedTable.id)}
                          className="text-gray-300 hover:text-red-500 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add guest */}
              {unassigned.length > 0 && (
                <div className="px-3 pb-3">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onAssignGuest(e.target.value, selectedTable.id);
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">+ Add guest…</option>
                    {unassigned.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.lastName}, {g.firstName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Meal summary */}
              {(() => {
                const counts: Record<string, number> = {};
                selectedTable.guests.forEach((g) => {
                  if (g.mealChoice) {
                    const name = mealMap[g.mealChoice] ?? g.mealChoice;
                    counts[name] = (counts[name] ?? 0) + 1;
                  }
                });
                const summary = Object.entries(counts).map(([n, c]) => `${c}× ${n}`).join(", ");
                return summary ? (
                  <div className="px-4 py-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400">{summary}</p>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Delete */}
            <div className="px-4 py-3 border-t border-gray-100">
              <button
                onClick={() => {
                  if (confirm(`Delete "${selectedTable.name}"? This will unassign ${selectedTable.guests.length} guests.`)) {
                    pushHistory();
                    onDeleteTable(selectedTable.id);
                    setSelectedIds([]);
                  }
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                🗑 Delete table
              </button>
            </div>
          </div>
        ) : selectedElement ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-900">Element Properties</p>
              <button onClick={() => setSelectedIds([])} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Type</label>
              <p className="text-sm text-gray-700">{selectedElement.type}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Label</label>
              <input
                defaultValue={selectedElement.label ?? ""}
                onBlur={(e) => {
                  const updated = room.elements.map((el) =>
                    el.id === selectedElement.id ? { ...el, label: e.target.value } : el
                  );
                  onPersistElements(updated);
                }}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Width</label>
                <input
                  type="number" min={20}
                  defaultValue={Math.round(selectedElement.width)}
                  onBlur={(e) => {
                    const updated = room.elements.map((el) =>
                      el.id === selectedElement.id ? { ...el, width: Number(e.target.value) } : el
                    );
                    onPersistElements(updated);
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Height</label>
                <input
                  type="number" min={20}
                  defaultValue={Math.round(selectedElement.height)}
                  onBlur={(e) => {
                    const updated = room.elements.map((el) =>
                      el.id === selectedElement.id ? { ...el, height: Number(e.target.value) } : el
                    );
                    onPersistElements(updated);
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Colour</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOUR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      const updated = room.elements.map((el) =>
                        el.id === selectedElement.id ? { ...el, color: c } : el
                      );
                      onPersistElements(updated);
                    }}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      background: c,
                      borderColor: selectedElement.color === c ? "#6366f1" : "#d1d5db",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">Locked</label>
              <button
                onClick={() => {
                  const updated = room.elements.map((el) =>
                    el.id === selectedElement.id ? { ...el, locked: !el.locked } : el
                  );
                  onPersistElements(updated);
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  selectedElement.locked ? "bg-primary" : "bg-gray-300"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  selectedElement.locked ? "translate-x-4" : "translate-x-0.5"
                }`} />
              </button>
            </div>
            <button
              onClick={() => {
                pushHistory();
                onPersistElements(room.elements.filter((el) => el.id !== selectedElement.id));
                setSelectedIds([]);
              }}
              className="text-xs text-red-500 hover:text-red-700 pt-1"
            >
              🗑 Delete element
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center py-10 text-center px-4">
              <p className="text-xs text-gray-400">Click a table or element to see properties</p>
            </div>

            {/* Legend */}
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-600 mb-2">Legend</p>
              <div className="space-y-1 text-xs text-gray-500">
                <p>• Drag tables to reposition</p>
                <p>• Select + drag handles to resize</p>
                <p>• Rotate using the top handle</p>
                <p>• Scroll to zoom</p>
                <p>• Drag empty area to pan</p>
                <p>• Right-click to lock/delete</p>
                <p>• Ctrl+Z / Shift+Z to undo/redo</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Room setup modal */}
      {showRoomSetup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-900">Room Setup</p>
              <button onClick={() => setShowRoomSetup(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Width (metres)</label>
                <input
                  type="number" min={1} max={200}
                  value={roomWidth}
                  onChange={(e) => setRoomWidth(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Height (metres)</label>
                <input
                  type="number" min={1} max={200}
                  value={roomHeight}
                  onChange={(e) => setRoomHeight(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveRoom} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Save</button>
              <button onClick={() => setShowRoomSetup(false)} className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

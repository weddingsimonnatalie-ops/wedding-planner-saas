"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Orientation } from "@prisma/client";
import type { TableWithGuests, GuestSummary, MealOptionSummary } from "@/lib/seating-types";

interface PlanDesignerViewProps {
  tables: TableWithGuests[];
  unassigned: GuestSummary[];
  mealOptions: MealOptionSummary[];
  onCreateTable: (name: string, capacity: number, orientation: Orientation) => Promise<void>;
  onDeleteTable: (tableId: string) => Promise<void>;
  onUpdateTablePosition: (tableId: string, x: number, y: number) => Promise<void>;
  onUpdateTableOrientation: (tableId: string, orientation: Orientation) => Promise<void>;
  onUpdateTableName: (tableId: string, name: string) => Promise<void>;
  onUpdateTableCapacity: (tableId: string, capacity: number) => Promise<void>;
  onUpdateTableNotes: (tableId: string, notes: string | null) => Promise<void>;
  onDuplicateTable: (tableId: string) => Promise<void>;
  onAssignSeat: (tableId: string, seatNumber: number, guestId: string | null) => Promise<void>;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const GRID_SIZES = [10, 20, 50] as const;
const CANVAS_SIZE = 3000;
const MAX_HISTORY = 50;

// Default meal colors (used if mealOptions don't have colors)
const DEFAULT_MEAL_COLORS: Record<string, string> = {
  "Vegetarian": "#22c55e",
  "Vegan": "#16a34a",
  "Chicken": "#f59e0b",
  "Beef": "#dc2626",
  "Fish": "#3b82f6",
  "Pork": "#ec4899",
  "default": "#6b7280",
};

// Debounce helper
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Calculate table dimensions
function getTableDimensions(table: TableWithGuests): { width: number; height: number } {
  const isHorizontal = table.orientation === "HORIZONTAL";
  const capacity = table.capacity;

  if (isHorizontal) {
    return {
      width: Math.max(200, 60 * capacity + 60),
      height: 60,
    };
  } else {
    return {
      width: 180,
      height: 32 + capacity * 28,
    };
  }
}

// Check if two rectangles overlap
function rectanglesOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number,
  padding = 5
): boolean {
  return !(
    x1 + w1 + padding < x2 ||
    x2 + w2 + padding < x1 ||
    y1 + h1 + padding < y2 ||
    y2 + h2 + padding < y1
  );
}

// Get capacity fill color
function getCapacityColor(fill: number): string {
  if (fill <= 0.5) return "#22c55e"; // green
  if (fill <= 0.8) return "#f59e0b"; // yellow/amber
  return "#ef4444"; // red
}

type AssignModalTab = "unassigned" | "otherTables";

// History state for undo/redo
interface HistoryState {
  tables: Array<{ id: string; positionX: number; positionY: number; orientation: Orientation }>;
}

export function PlanDesignerView({
  tables,
  unassigned,
  mealOptions,
  onCreateTable,
  onDeleteTable,
  onUpdateTablePosition,
  onUpdateTableOrientation,
  onUpdateTableName,
  onUpdateTableCapacity,
  onUpdateTableNotes,
  onDuplicateTable,
  onAssignSeat,
}: PlanDesignerViewProps) {
  // Dark mode state
  const [darkMode, setDarkMode] = useState(false);

  // Load dark mode preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("planDesigner-darkMode");
    if (saved !== null) {
      setDarkMode(saved === "true");
    }
  }, []);

  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem("planDesigner-darkMode", String(darkMode));
  }, [darkMode]);

  // Build meal color map
  const mealColors = useMemo(() => {
    const map = new Map<string, string>();
    mealOptions.forEach((meal, index) => {
      const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
      map.set(meal.id, colors[index % colors.length]);
    });
    return map;
  }, [mealOptions]);

  // Get meal color for guest
  const getMealColor = useCallback((mealChoice: string | null): string | null => {
    if (!mealChoice) return null;
    return mealColors.get(mealChoice) || DEFAULT_MEAL_COLORS[mealChoice] || DEFAULT_MEAL_COLORS.default;
  }, [mealColors]);

  // Selection state (multi-select)
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [selectedSeat, setSelectedSeat] = useState<{ tableId: string; seatNumber: number } | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pendingGuestId, setPendingGuestId] = useState<string | null>(null);

  // Inline rename state
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editName, setEditName] = useState("");
  const [editCapacity, setEditCapacity] = useState(8);
  const [editNotes, setEditNotes] = useState("");

  // Seat assignment modal tab
  const [assignModalTab, setAssignModalTab] = useState<AssignModalTab>("unassigned");

  // Search state
  const [guestSearch, setGuestSearch] = useState("");

  // Drag guest state
  const [draggingGuestId, setDraggingGuestId] = useState<string | null>(null);
  const [dropHighlightSeat, setDropHighlightSeat] = useState<{ tableId: string; seatNumber: number } | null>(null);

  // Form state for new table
  const [newTableName, setNewTableName] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState(8);
  const [newTableOrientation, setNewTableOrientation] = useState<Orientation>("VERTICAL");

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Grid snap state
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(20);

  // Drag state for tables
  const [draggingTableIds, setDraggingTableIds] = useState<Set<string>>(new Set());
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPositions, setDragPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  // Undo/redo history
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Print modal state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFontSize, setPrintFontSize] = useState(11); // Font size in pixels
  const [printSpacing, setPrintSpacing] = useState(5); // 0=compact (0.5x), 5=original (1x), 10=spacious (1.5x)
  const [printShowLastName, setPrintShowLastName] = useState(true); // Show last names
  const [printShowMeals, setPrintShowMeals] = useState(false); // Show meals

  // Debounced position update ref
  const pendingUpdatesRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Get selected table
  const selectedTable = useMemo(() => {
    if (selectedTableIds.size !== 1) return null;
    const id = Array.from(selectedTableIds)[0];
    return tables.find((t) => t.id === id) || null;
  }, [selectedTableIds, tables]);

  // Filter unassigned guests by search
  const filteredUnassigned = useMemo(() => {
    if (!guestSearch.trim()) return unassigned;
    const search = guestSearch.toLowerCase();
    return unassigned.filter(
      (g) =>
        g.firstName.toLowerCase().includes(search) ||
        g.lastName.toLowerCase().includes(search) ||
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(search)
    );
  }, [unassigned, guestSearch]);

  // Get guests on other tables
  const guestsOnOtherTables = useMemo(() => {
    if (!selectedSeat) return [];
    const selectedTable = tables.find((t) => t.id === selectedSeat.tableId);
    if (!selectedTable) return [];

    const allGuests: Array<GuestSummary & { tableName: string }> = [];
    for (const table of tables) {
      if (table.id === selectedSeat.tableId) continue;
      for (const guest of table.guests) {
        allGuests.push({
          ...guest,
          tableName: table.name,
        });
      }
    }
    return allGuests.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }, [tables, selectedSeat]);

  // Filter other table guests by search
  const filteredOtherGuests = useMemo(() => {
    if (!guestSearch.trim()) return guestsOnOtherTables;
    const search = guestSearch.toLowerCase();
    return guestsOnOtherTables.filter(
      (g) =>
        g.firstName.toLowerCase().includes(search) ||
        g.lastName.toLowerCase().includes(search) ||
        `${g.firstName} ${g.lastName}`.toLowerCase().includes(search)
    );
  }, [guestsOnOtherTables, guestSearch]);

  // Calculate overlapping tables
  const overlappingTableIds = useMemo(() => {
    const overlapping = new Set<string>();

    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const t1 = tables[i];
        const t2 = tables[j];

        const dim1 = getTableDimensions(t1);
        const dim2 = getTableDimensions(t2);

        if (rectanglesOverlap(
          t1.positionX, t1.positionY, dim1.width, dim1.height,
          t2.positionX, t2.positionY, dim2.width, dim2.height
        )) {
          overlapping.add(t1.id);
          overlapping.add(t2.id);
        }
      }
    }

    return overlapping;
  }, [tables]);

  // Print layout - matches the visual Plan Designer layout
  const doPrint = useCallback((orientation: "portrait" | "landscape", fontSize: number, spacing: number, showLastName: boolean, showMeals: boolean) => {
    if (tables.length === 0) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Helper to get display name
    const getDisplayName = (guest: { firstName: string; lastName: string }) => {
      return showLastName ? `${guest.firstName} ${guest.lastName}` : guest.firstName;
    };

    // Calculate bounds of all tables (accounting for meal row when shown)
    // For horizontal tables, add extra height when meals are displayed
    const mealRowHeight = 30;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const table of tables) {
      const dim = getTableDimensions(table);
      const extraHeight = showMeals && table.orientation === "HORIZONTAL" ? mealRowHeight : 0;
      minX = Math.min(minX, table.positionX);
      minY = Math.min(minY, table.positionY);
      maxX = Math.max(maxX, table.positionX + dim.width);
      maxY = Math.max(maxY, table.positionY + dim.height + extraHeight);
    }

    // Spacing: 0=compact (0.5x), 5=original (1x), 10=spacious (1.5x)
    const spreadFactor = 0.5 + spacing * 0.1;

    // Calculate center of the layout
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Content size from canvas (original)
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Expanded content size after spreading
    const expandedWidth = contentWidth * spreadFactor;
    const expandedHeight = contentHeight * spreadFactor;

    // A4 dimensions at 96dpi (pixels): portrait 794x1123, landscape 1123x794
    const margin = 20; // Fixed margin
    const pageHeaderHeight = 50;
    const mealLegendHeight = mealOptions.length > 0 ? 40 : 0;
    const pageWidth = orientation === "portrait" ? 794 - 60 : 1123 - 60;
    const pageHeight = orientation === "portrait" ? 1123 - 60 : 794 - 60;
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - pageHeaderHeight - mealLegendHeight - margin * 2;

    // Scale to fit on one page (use expanded size)
    const scaleX = availableWidth / expandedWidth;
    const scaleY = availableHeight / expandedHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

    // Font size (scales with page fit)
    const baseFontSize = Math.max(8, Math.round(11 * scale));
    const headerFontSize = baseFontSize + 1;
    const padY = Math.max(2, Math.round(3 * scale));

    const tablesHtml = tables.map((table) => {
      const isHorizontal = table.orientation === "HORIZONTAL";
      const dim = getTableDimensions(table);
      const seats = [];
      const guestMap = new Map(table.guests.map((g) => [g.seatNumber, g]));
      for (let i = 1; i <= table.capacity; i++) {
        seats.push({ number: i, guest: guestMap.get(i) || null });
      }

      // For horizontal tables with meals, increase height to accommodate meal row
      const baseHeight = dim.height;
      const mealRowHeight = isHorizontal && showMeals ? 30 : 0;
      const tableHeight = baseHeight + mealRowHeight;

      // Spread positions from center
      const tableCenterX = table.positionX + dim.width / 2;
      const tableCenterY = table.positionY + dim.height / 2;
      const spreadX = (tableCenterX - centerX) * spreadFactor;
      const spreadY = (tableCenterY - centerY) * spreadFactor;
      const spreadLeft = (centerX + spreadX - dim.width / 2 - minX * spreadFactor);
      const spreadTop = (centerY + spreadY - tableHeight / 2 - minY * spreadFactor);

      // Position using spread coordinates, scaled
      const left = margin + spreadLeft * scale;
      const top = margin + spreadTop * scale;
      const width = dim.width * scale;
      const height = tableHeight * scale;

      // For horizontal tables, split width evenly among seats
      const colWidth = isHorizontal ? width / seats.length : 0;

      return `
        <div style="position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; border: 1px solid #333; border-radius: 4px; overflow: hidden; background: white; box-shadow: 1px 1px 3px rgba(0,0,0,0.1); display: flex; flex-direction: column;">
          <div style="background: #f3f4f6; padding: ${padY}px ${Math.round(padY * 1.5)}px; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
            <span style="font-weight: 600; font-size: ${headerFontSize}px;">${table.name}</span>
            <span style="font-size: ${baseFontSize}px; color: #666;">${table.guests.length}/${table.capacity}</span>
          </div>
          ${isHorizontal ? `
            <div style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
              <div style="display: flex; background: #f9fafb; border-bottom: 1px solid #eee; ${showMeals ? 'flex: 4;' : 'flex: 1;'} min-height: ${Math.round(20 * scale)}px;">
                ${seats.map((s) => `<div style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: ${baseFontSize - 1}px; color: #666; border-right: 1px solid #eee;">${s.number}</div>`).join("")}
              </div>
              <div style="display: flex; ${showMeals ? 'flex: 3;' : 'flex: 1;'} min-height: ${Math.round(20 * scale)}px;">
                ${seats.map((s) => {
                  const mealColor = s.guest?.mealChoice ? (mealColors.get(s.guest.mealChoice) || "#6b7280") : null;
                  const displayName = s.guest ? getDisplayName(s.guest) : null;
                  return `<div style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: ${baseFontSize}px; border-right: 1px solid #eee; white-space: nowrap; overflow: hidden;">${displayName ? `<span style="display: inline-block; width: ${Math.round(6 * scale)}px; height: ${Math.round(6 * scale)}px; border-radius: 50%; background: ${mealColor || '#6b7280'}; margin-right: 2px; flex-shrink: 0;"></span><span style="overflow: hidden; text-overflow: ellipsis;">${displayName}</span>` : "—"}</div>`;
                }).join("")}
              </div>
              ${showMeals ? `<div style="display: flex; border-top: 1px solid #eee; flex: 2; min-height: ${Math.round(16 * scale)}px;">
                ${seats.map((s) => {
                  const mealName = s.guest?.mealChoice ? (mealOptions.find(m => m.id === s.guest?.mealChoice)?.name || "") : "";
                  return `<div style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: ${baseFontSize - 2}px; color: #666; border-right: 1px solid #eee; white-space: nowrap; overflow: hidden;">${mealName || "—"}</div>`;
                }).join("")}
              </div>` : ''}
            </div>
          ` : `
            <div style="display: flex; flex-direction: column;">
              ${seats.map((s, i) => {
                const mealColor = s.guest?.mealChoice ? (mealColors.get(s.guest.mealChoice) || "#6b7280") : null;
                const displayName = s.guest ? getDisplayName(s.guest) : null;
                const mealName = s.guest?.mealChoice ? (mealOptions.find(m => m.id === s.guest?.mealChoice)?.name || "") : "";
                const rowHeight = (height - Math.round(24 * scale)) / seats.length;
                return `<div style="display: flex; height: ${rowHeight}px; ${i < seats.length - 1 ? 'border-bottom: 1px solid #eee;' : ''}">
                  <div style="width: ${Math.round(24 * scale)}px; display: flex; align-items: center; justify-content: center; font-size: ${baseFontSize - 1}px; color: #666; background: #f9fafb; border-right: 1px solid #ccc;">${s.number}</div>
                  <div style="flex: 1; display: flex; align-items: center; padding: 0 ${Math.round(4 * scale)}px; font-size: ${baseFontSize}px; white-space: nowrap; overflow: hidden;">${displayName ? `<span style="display: inline-block; width: ${Math.round(6 * scale)}px; height: ${Math.round(6 * scale)}px; border-radius: 50%; background: ${mealColor || '#6b7280'}; margin-right: 2px; flex-shrink: 0;"></span><span style="overflow: hidden; text-overflow: ellipsis;">${displayName}</span>${showMeals && mealName ? `<span style="margin-left: 4px; font-size: ${baseFontSize - 2}px; color: #666;">${mealName}</span>` : ''}` : "—"}</div>
                </div>`;
              }).join("")}
            </div>
          `}
        </div>
      `;
    }).join("");

    const totalWidth = expandedWidth * scale + margin * 2;
    const totalHeight = expandedHeight * scale + margin * 2;

    const mealLegend = mealOptions.length > 0 ? `
      <div style="margin-top: 15px; padding: 8px; background: #f9fafb; border-radius: 4px; border: 1px solid #ddd;">
        <strong style="font-size: ${Math.round(fontSize * scale)}px;">Meal Choices:</strong>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
          ${mealOptions.map((meal) => {
            const color = mealColors.get(meal.id) || "#6b7280";
            return `<span style="display: flex; align-items: center; gap: 3px; font-size: ${Math.round((fontSize - 1) * scale)}px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>${meal.name}</span>`;
          }).join("")}
        </div>
      </div>
    ` : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Seating Plan</title>
        <style>
          @media print {
            @page { size: A4 ${orientation}; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: ${Math.round(fontSize * scale)}px; margin: 0; padding: 10mm; }
          h1 { text-align: center; margin: 0 0 10px 0; font-size: ${Math.round((fontSize + 5) * scale)}px; }
          .canvas-container { position: relative; width: ${totalWidth}px; height: ${totalHeight}px; margin: 0 auto; }
        </style>
      </head>
      <body>
        <h1>Seating Plan</h1>
        <div class="canvas-container">
          ${tablesHtml}
        </div>
        ${mealLegend}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }, [tables, mealOptions, mealColors]); // showLastName and showMeals are intentionally not in deps as they're passed as arguments

  const handlePrint = useCallback(() => {
    setShowPrintModal(true);
  }, []);

  // Debounced batch update function
  const debouncedUpdatePositions = useMemo(() => {
    return debounce(async () => {
      const updates = pendingUpdatesRef.current;
      if (updates.size === 0) return;

      for (const [tableId, pos] of updates) {
        await onUpdateTablePosition(tableId, pos.x, pos.y);
      }

      pendingUpdatesRef.current = new Map();
    }, 150);
  }, [onUpdateTablePosition]);

  // Save to history
  const saveToHistory = useCallback(() => {
    const state: HistoryState = {
      tables: tables.map((t) => ({
        id: t.id,
        positionX: t.positionX,
        positionY: t.positionY,
        orientation: t.orientation,
      })),
    };

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(state);

    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }

    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [tables, history, historyIndex]);

  // Undo
  const handleUndo = useCallback(async () => {
    if (historyIndex <= 0) return;

    const prevIndex = historyIndex - 1;
    const prevState = history[prevIndex];

    for (const t of prevState.tables) {
      await onUpdateTablePosition(t.id, t.positionX, t.positionY);
      await onUpdateTableOrientation(t.id, t.orientation);
    }

    setHistoryIndex(prevIndex);
  }, [history, historyIndex, onUpdateTablePosition, onUpdateTableOrientation]);

  // Redo
  const handleRedo = useCallback(async () => {
    if (historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const nextState = history[nextIndex];

    for (const t of nextState.tables) {
      await onUpdateTablePosition(t.id, t.positionX, t.positionY);
      await onUpdateTableOrientation(t.id, t.orientation);
    }

    setHistoryIndex(nextIndex);
  }, [history, historyIndex, onUpdateTablePosition, onUpdateTableOrientation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Save history when tables change
  useEffect(() => {
    if (tables.length > 0) {
      saveToHistory();
    }
  }, [tables.map(t => `${t.id}:${t.positionX},${t.positionY}`).join(",")]);

  // Snap position to grid
  const snapPosition = useCallback((x: number, y: number) => {
    if (!snapToGrid) return { x, y };
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    };
  }, [snapToGrid, gridSize]);

  // Get seats for a table
  const getSeats = (table: TableWithGuests) => {
    const seats = [];
    const guestMap = new Map(table.guests.map((g) => [g.seatNumber, g]));
    for (let i = 1; i <= table.capacity; i++) {
      seats.push({
        number: i,
        guest: guestMap.get(i) || null,
      });
    }
    return seats;
  };

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (draggingTableIds.size > 0) return;

    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));

    if (newZoom !== zoom && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomRatio = newZoom / zoom;
      const newPanX = mouseX - (mouseX - pan.x) * zoomRatio;
      const newPanY = mouseY - (mouseY - pan.y) * zoomRatio;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    }
  }, [zoom, pan, draggingTableIds]);

  // Pan handlers - works on canvas background without Space key
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // Only pan with left mouse button on canvas background (not on tables)
    if (e.button !== 0) return;
    if (draggingTableIds.size > 0) return;

    // Check if click is on a table element
    const target = e.target as HTMLElement;
    if (target.closest("[data-table-id]")) return;

    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan, draggingTableIds]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }, [isPanning, panStart]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Pan by arrow buttons
  const handlePanLeft = useCallback(() => {
    setPan((p) => ({ ...p, x: p.x + 200 }));
  }, []);

  const handlePanRight = useCallback(() => {
    setPan((p) => ({ ...p, x: p.x - 200 }));
  }, []);

  const handlePanUp = useCallback(() => {
    setPan((p) => ({ ...p, y: p.y + 200 }));
  }, []);

  const handlePanDown = useCallback(() => {
    setPan((p) => ({ ...p, y: p.y - 200 }));
  }, []);

  // Fit all tables in view
  const handleFitAll = useCallback(() => {
    if (tables.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // Find bounds of all tables
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const table of tables) {
      const dim = getTableDimensions(table);
      minX = Math.min(minX, table.positionX);
      minY = Math.min(minY, table.positionY);
      maxX = Math.max(maxX, table.positionX + dim.width);
      maxY = Math.max(maxY, table.positionY + dim.height);
    }

    // Add padding
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Calculate zoom to fit all tables
    const zoomX = containerWidth / width;
    const zoomY = containerHeight / height;
    const newZoom = Math.min(zoomX, zoomY, 2); // Cap at 2x

    // Calculate pan to center
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = containerWidth / 2 - centerX * newZoom;
    const newPanY = containerHeight / 2 - centerY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [tables]);

  // Handle drag start on table
  const handleMouseDown = useCallback((e: React.MouseEvent, tableId: string) => {
    if (e.button !== 0) return;

    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = (e.target as HTMLElement).closest("[data-table-id]")?.getBoundingClientRect();
    if (!rect) return;

    if (e.shiftKey) {
      setSelectedTableIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(tableId)) {
          newSet.delete(tableId);
        } else {
          newSet.add(tableId);
        }
        return newSet;
      });
    } else {
      if (!selectedTableIds.has(tableId)) {
        setSelectedTableIds(new Set([tableId]));
      }
    }

    const tablesToDrag = selectedTableIds.has(tableId) ? selectedTableIds : new Set([tableId]);

    setDraggingTableIds(tablesToDrag);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });

    const positions = new Map<string, { x: number; y: number }>();
    for (const id of tablesToDrag) {
      const t = tables.find((t) => t.id === id);
      if (t) {
        positions.set(id, { x: t.positionX, y: t.positionY });
      }
    }
    setDragPositions(positions);
  }, [tables, selectedTableIds]);

  // Handle drag move
  useEffect(() => {
    if (draggingTableIds.size === 0 || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const canvasX = (mouseX - pan.x - dragOffset.x) / zoom;
      const canvasY = (mouseY - pan.y - dragOffset.y) / zoom;

      const primaryId = Array.from(draggingTableIds)[0];
      const primaryTable = tables.find((t) => t.id === primaryId);
      if (!primaryTable) return;

      const newX = Math.max(0, canvasX);
      const newY = Math.max(0, canvasY);
      const deltaX = newX - primaryTable.positionX;
      const deltaY = newY - primaryTable.positionY;

      const newPositions = new Map<string, { x: number; y: number }>();
      for (const id of draggingTableIds) {
        const t = tables.find((t) => t.id === id);
        if (t) {
          newPositions.set(id, {
            x: Math.max(0, t.positionX + deltaX),
            y: Math.max(0, t.positionY + deltaY),
          });
        }
      }
      setDragPositions(newPositions);
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (draggingTableIds.size === 0) return;

      const containerRect = containerRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const canvasX = (mouseX - pan.x - dragOffset.x) / zoom;
      const canvasY = (mouseY - pan.y - dragOffset.y) / zoom;

      const primaryId = Array.from(draggingTableIds)[0];
      const primaryTable = tables.find((t) => t.id === primaryId);
      if (!primaryTable) {
        setDraggingTableIds(new Set());
        return;
      }

      const deltaX = canvasX - primaryTable.positionX;
      const deltaY = canvasY - primaryTable.positionY;

      for (const id of draggingTableIds) {
        const t = tables.find((t) => t.id === id);
        if (t) {
          let newX = Math.max(0, t.positionX + deltaX);
          let newY = Math.max(0, t.positionY + deltaY);

          const snapped = snapPosition(newX, newY);
          newX = Math.round(snapped.x);
          newY = Math.round(snapped.y);

          pendingUpdatesRef.current.set(id, { x: newX, y: newY });
        }
      }

      debouncedUpdatePositions();

      setDraggingTableIds(new Set());
      setDragPositions(new Map());
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingTableIds, dragOffset, pan, zoom, tables, snapPosition, debouncedUpdatePositions]);

  // Selection actions
  const handleDeselectAll = useCallback(() => {
    setSelectedTableIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    for (const id of selectedTableIds) {
      await onDeleteTable(id);
    }
    setSelectedTableIds(new Set());
    setShowDeleteConfirm(false);
  }, [selectedTableIds, onDeleteTable]);

  const handleAutoArrange = useCallback(async () => {
    const startX = 50;
    const startY = 50;
    const colWidth = 250;
    const rowHeight = 250;
    const tablesPerRow = 4;

    tables.forEach(async (table, index) => {
      const col = index % tablesPerRow;
      const row = Math.floor(index / tablesPerRow);
      await onUpdateTablePosition(table.id, startX + col * colWidth, startY + row * rowHeight);
    });
  }, [tables, onUpdateTablePosition]);

  // Toggle orientation
  const handleToggleOrientation = useCallback(async (tableId: string, current: Orientation) => {
    const newOrientation: Orientation = current === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
    await onUpdateTableOrientation(tableId, newOrientation);
  }, [onUpdateTableOrientation]);

  // Inline rename
  const handleStartRename = useCallback((tableId: string, currentName: string) => {
    setEditingTableId(tableId);
    setEditingName(currentName);
  }, []);

  const handleFinishRename = useCallback(async () => {
    if (editingTableId && editingName.trim()) {
      await onUpdateTableName(editingTableId, editingName.trim());
    }
    setEditingTableId(null);
    setEditingName("");
  }, [editingTableId, editingName, onUpdateTableName]);

  // Edit modal
  const handleOpenEditModal = useCallback(() => {
    if (!selectedTable) return;
    setEditName(selectedTable.name);
    setEditCapacity(selectedTable.capacity);
    setEditNotes(selectedTable.notes || "");
    setShowEditModal(true);
  }, [selectedTable]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedTable) return;

    if (editName.trim() !== selectedTable.name) {
      await onUpdateTableName(selectedTable.id, editName.trim());
    }
    if (editCapacity !== selectedTable.capacity) {
      await onUpdateTableCapacity(selectedTable.id, editCapacity);
    }
    const notesValue = editNotes.trim() || null;
    if (notesValue !== selectedTable.notes) {
      await onUpdateTableNotes(selectedTable.id, notesValue);
    }

    setShowEditModal(false);
  }, [selectedTable, editName, editCapacity, editNotes, onUpdateTableName, onUpdateTableCapacity, onUpdateTableNotes]);

  // Duplicate
  const handleDuplicate = useCallback(async () => {
    if (!selectedTable) return;
    await onDuplicateTable(selectedTable.id);
  }, [selectedTable, onDuplicateTable]);

  // Open seat assignment modal
  const handleSeatClick = useCallback((tableId: string, seatNumber: number) => {
    setSelectedSeat({ tableId, seatNumber });
    setAssignModalTab("unassigned");
    setGuestSearch("");
    setShowAssignModal(true);
  }, []);

  // Handle guest assignment with conflict detection
  const handleAssignGuest = useCallback(async (guestId: string | null) => {
    if (!selectedSeat) return;

    if (guestId === null) {
      await onAssignSeat(selectedSeat.tableId, selectedSeat.seatNumber, null);
      setShowAssignModal(false);
      setSelectedSeat(null);
      return;
    }

    const currentGuest = getGuestAtSelectedSeat();
    if (currentGuest) {
      setPendingGuestId(guestId);
      setShowAssignModal(false);
      setShowConflictModal(true);
      return;
    }

    await onAssignSeat(selectedSeat.tableId, selectedSeat.seatNumber, guestId);
    setShowAssignModal(false);
    setSelectedSeat(null);
  }, [selectedSeat, onAssignSeat]);

  // Handle conflict resolution
  const handleConflictReplace = useCallback(async () => {
    if (!selectedSeat || !pendingGuestId) return;

    await onAssignSeat(selectedSeat.tableId, selectedSeat.seatNumber, null);
    await onAssignSeat(selectedSeat.tableId, selectedSeat.seatNumber, pendingGuestId);

    setShowConflictModal(false);
    setPendingGuestId(null);
    setSelectedSeat(null);
  }, [selectedSeat, pendingGuestId, onAssignSeat]);

  const handleConflictCancel = useCallback(() => {
    setShowConflictModal(false);
    setPendingGuestId(null);
    setShowAssignModal(true);
  }, []);

  // Handle drag guest from sidebar
  const handleGuestDragStart = useCallback((e: React.DragEvent, guestId: string) => {
    e.dataTransfer.setData("guestId", guestId);
    setDraggingGuestId(guestId);
  }, []);

  const handleGuestDragEnd = useCallback(() => {
    setDraggingGuestId(null);
    setDropHighlightSeat(null);
  }, []);

  // Handle drop on seat
  const handleSeatDrop = useCallback(async (tableId: string, seatNumber: number, guestId: string) => {
    setDropHighlightSeat(null);
    setDraggingGuestId(null);

    const table = tables.find((t) => t.id === tableId);
    const currentGuest = table?.guests.find((g) => g.seatNumber === seatNumber);

    if (currentGuest) {
      setSelectedSeat({ tableId, seatNumber });
      setPendingGuestId(guestId);
      setShowConflictModal(true);
      return;
    }

    await onAssignSeat(tableId, seatNumber, guestId);
  }, [tables, onAssignSeat]);

  // Create table
  const handleCreateTable = useCallback(async () => {
    if (!newTableName.trim()) return;
    await onCreateTable(newTableName.trim(), newTableCapacity, newTableOrientation);
    setNewTableName("");
    setNewTableCapacity(8);
    setNewTableOrientation("VERTICAL");
    setShowCreateModal(false);
  }, [newTableName, newTableCapacity, newTableOrientation, onCreateTable]);

  // Get guest at selected seat
  const getGuestAtSelectedSeat = () => {
    if (!selectedSeat) return null;
    const table = tables.find((t) => t.id === selectedSeat.tableId);
    return table?.guests.find((g) => g.seatNumber === selectedSeat.seatNumber) || null;
  };

  // Render grid dots
  const renderGridDots = () => {
    if (!snapToGrid) return null;

    const dots = [];
    for (let x = 0; x <= CANVAS_SIZE; x += gridSize) {
      for (let y = 0; y <= CANVAS_SIZE; y += gridSize) {
        dots.push(
          <div
            key={`${x}-${y}`}
            className={`absolute w-0.5 h-0.5 rounded-full ${darkMode ? "bg-gray-600" : "bg-gray-300"}`}
            style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
          />
        );
      }
    }
    return dots;
  };

  // Render capacity bar
  const renderCapacityBar = (table: TableWithGuests) => {
    const fill = table.guests.length / table.capacity;
    const color = getCapacityColor(fill);

    return (
      <div className="px-2 py-1">
        <div className={`text-xs mb-1 flex justify-between ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          <span>{table.guests.length}/{table.capacity}</span>
          {table.notes && <span title={table.notes}>📝</span>}
        </div>
        <div className={`h-1 rounded-full ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${fill * 100}%`, backgroundColor: color }}
          />
        </div>
      </div>
    );
  };

  const selectedCount = selectedTableIds.size;
  const currentGuest = getGuestAtSelectedSeat();

  const baseClasses = darkMode
    ? "bg-gray-900 text-gray-100 border-gray-700"
    : "bg-white text-gray-900 border-gray-300";
  const bgClass = darkMode ? "bg-gray-900" : "bg-gray-100";
  const panelBgClass = darkMode ? "bg-gray-800" : "bg-white";
  const inputClass = darkMode
    ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
    : "bg-white border-gray-300 text-gray-900";

  return (
    <div className={`h-full flex ${darkMode ? "bg-gray-900" : ""}`}>
      {/* Canvas area */}
      <div className="flex-1 flex flex-col">
        {/* Zoom controls */}
        <div className={`flex items-center gap-2 px-4 py-2 border-b ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} flex-wrap`}>
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            −
          </button>
          <span className={`text-sm min-w-[50px] text-center ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            +
          </button>
          <button
            onClick={handleZoomReset}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            Reset
          </button>
          <button
            onClick={handleFitAll}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
            title="Fit all tables in view"
          >
            Fit All
          </button>

          <div className={`w-px h-4 ${darkMode ? "bg-gray-600" : "bg-gray-300"} mx-2`} />

          {/* Pan arrows */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handlePanLeft}
              className={`px-1.5 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
              title="Pan left"
            >
              ←
            </button>
            <div className="flex flex-col">
              <button
                onClick={handlePanUp}
                className={`px-2 py-0.5 text-xs rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
                title="Pan up"
              >
                ↑
              </button>
              <button
                onClick={handlePanDown}
                className={`px-2 py-0.5 text-xs rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
                title="Pan down"
              >
                ↓
              </button>
            </div>
            <button
              onClick={handlePanRight}
              className={`px-1.5 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
              title="Pan right"
            >
              →
            </button>
          </div>

          <div className={`w-px h-4 ${darkMode ? "bg-gray-600" : "bg-gray-300"} mx-2`} />

          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={`px-2 py-1 text-sm rounded ${
              snapToGrid
                ? "bg-pink-100 text-pink-700 border border-pink-300"
                : darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            Grid {snapToGrid ? "On" : "Off"}
          </button>

          {snapToGrid && (
            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className={`text-sm border rounded px-1 py-0.5 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-300"}`}
            >
              {GRID_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          )}

          <div className={`w-px h-4 ${darkMode ? "bg-gray-600" : "bg-gray-300"} mx-2`} />

          {/* Undo/Redo */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"} disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"} disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷
          </button>

          <div className={`w-px h-4 ${darkMode ? "bg-gray-600" : "bg-gray-300"} mx-2`} />

          {/* Print */}
          <button
            onClick={() => setShowPrintModal(true)}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
            title="Print seating plan"
          >
            🖨️ Print
          </button>

          <div className={`w-px h-4 ${darkMode ? "bg-gray-600" : "bg-gray-300"} mx-2`} />

          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
            title="Toggle dark mode"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          <div className={`w-px h-4 ${darkMode ? "bg-gray-600" : "bg-gray-300"} mx-2`} />

          {selectedCount > 0 && (
            <>
              <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                {selectedCount} selected
              </span>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-2 py-1 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100"
              >
                Delete
              </button>
              <button
                onClick={handleDeselectAll}
                className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
              >
                Deselect
              </button>
            </>
          )}

          <button
            onClick={handleAutoArrange}
            className={`px-2 py-1 text-sm rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            Auto Arrange
          </button>

          {overlappingTableIds.size > 0 && (
            <span className="text-sm text-amber-500 flex items-center gap-1">
              ⚠ {overlappingTableIds.size} overlapping
            </span>
          )}

          <div className={`ml-auto text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
            Drag canvas to pan • Scroll to zoom • Shift+click to multi-select
          </div>
        </div>

        {/* Canvas container */}
        <div
          ref={containerRef}
          className={`flex-1 relative overflow-hidden ${darkMode ? "bg-gray-950" : "bg-gray-100"}`}
          style={{ cursor: isPanning ? "grabbing" : draggingTableIds.size > 0 ? "grabbing" : draggingGuestId ? "copy" : "grab" }}
          onWheel={handleWheel}
          onMouseDown={handlePanStart}
          onMouseMove={handlePanMove}
          onMouseUp={handlePanEnd}
          onMouseLeave={handlePanEnd}
          onClick={() => !isPanning && setSelectedTableIds(new Set())}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const guestId = e.dataTransfer.getData("guestId");
            if (guestId && dropHighlightSeat) {
              handleSeatDrop(dropHighlightSeat.tableId, dropHighlightSeat.seatNumber, guestId);
            }
            setDropHighlightSeat(null);
          }}
        >
          <div
            ref={canvasRef}
            className={`relative ${darkMode ? "bg-gray-900" : "bg-white"}`}
            style={{
              width: CANVAS_SIZE,
              height: CANVAS_SIZE,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {renderGridDots()}

            {tables.map((table) => {
              const isSelected = selectedTableIds.has(table.id);
              const isDragging = draggingTableIds.has(table.id);
              const isOverlapping = overlappingTableIds.has(table.id);
              const isEditing = editingTableId === table.id;
              const isHorizontal = table.orientation === "HORIZONTAL";
              const seats = getSeats(table);

              const dragPos = dragPositions.get(table.id);
              const displayX = dragPos?.x ?? table.positionX;
              const displayY = dragPos?.y ?? table.positionY;

              return (
                <div
                  key={table.id}
                  data-table-id={table.id}
                  className={`absolute border-2 rounded shadow-md select-none transition-shadow ${
                    isSelected ? "border-blue-500 ring-2 ring-blue-200" :
                    isOverlapping ? "border-amber-400 ring-2 ring-amber-200" :
                    darkMode ? "border-gray-600" : "border-gray-300"
                  } ${isDragging ? "opacity-90 shadow-xl" : ""} ${darkMode ? "bg-gray-800" : "bg-white"}`}
                  style={{
                    left: displayX,
                    top: displayY,
                    minWidth: isHorizontal ? Math.max(200, 60 * seats.length + 60) : 180,
                    zIndex: isDragging ? 1000 : isSelected ? 10 : 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPanning) {
                      if (e.shiftKey) {
                        setSelectedTableIds((prev) => {
                          const newSet = new Set(prev);
                          if (newSet.has(table.id)) {
                            newSet.delete(table.id);
                          } else {
                            newSet.add(table.id);
                          }
                          return newSet;
                        });
                      } else {
                        setSelectedTableIds(new Set([table.id]));
                      }
                    }
                  }}
                  onMouseDown={(e) => handleMouseDown(e, table.id)}
                >
                  {/* Header */}
                  <div className={`flex items-center justify-between px-3 py-2 border-b ${darkMode ? "bg-gray-700 border-gray-600" : "bg-gray-100 border-gray-200"} rounded-t`}>
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleFinishRename();
                          if (e.key === "Escape") {
                            setEditingTableId(null);
                            setEditingName("");
                          }
                        }}
                        className={`flex-1 px-1 py-0.5 text-sm font-semibold border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? "bg-gray-600 border-blue-400 text-white" : "bg-white border-blue-300"}`}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className={`font-semibold text-sm truncate flex-1 cursor-text ${darkMode ? "text-gray-100" : "text-gray-800"}`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(table.id, table.name);
                        }}
                      >
                        {table.name}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleOrientation(table.id, table.orientation);
                      }}
                      className={`ml-2 px-2 py-0.5 text-xs font-medium rounded ${darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-200 hover:bg-gray-300"} transition-colors`}
                    >
                      {isHorizontal ? "H" : "V"}
                    </button>
                  </div>

                  {/* Seats */}
                  <div className="p-1">
                    {isHorizontal ? (
                      <div>
                        <div className={`flex border-b ${darkMode ? "border-gray-600" : "border-gray-200"}`}>
                          {seats.map((seat) => (
                            <div
                              key={seat.number}
                              className={`w-14 text-center py-1 text-xs ${darkMode ? "text-gray-400 bg-gray-700 border-gray-600" : "text-gray-500 bg-gray-50 border-gray-200"} border-r last:border-r-0`}
                            >
                              {seat.number}
                            </div>
                          ))}
                        </div>
                        <div className="flex">
                          {seats.map((seat) => {
                            const mealColor = seat.guest ? getMealColor(seat.guest.mealChoice) : null;
                            return (
                              <button
                                key={seat.number}
                                className={`w-14 py-1 text-xs text-center truncate border-r last:border-r-0 ${
                                  dropHighlightSeat?.tableId === table.id && dropHighlightSeat?.seatNumber === seat.number
                                    ? "bg-blue-100 ring-2 ring-blue-400"
                                    : darkMode ? "hover:bg-gray-700 border-gray-600" : "hover:bg-blue-50 border-gray-200"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSeatClick(table.id, seat.number);
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  if (draggingGuestId && !seat.guest) {
                                    setDropHighlightSeat({ tableId: table.id, seatNumber: seat.number });
                                  }
                                }}
                                onDragLeave={() => setDropHighlightSeat(null)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const guestId = e.dataTransfer.getData("guestId");
                                  if (guestId) {
                                    handleSeatDrop(table.id, seat.number, guestId);
                                  }
                                }}
                              >
                                {seat.guest ? (
                                  <span className={darkMode ? "text-gray-100" : "text-gray-900"}>
                                    {mealColor && (
                                      <span
                                        className="inline-block w-2 h-2 rounded-full mr-1"
                                        style={{ backgroundColor: mealColor }}
                                        title={mealOptions.find(m => m.id === seat.guest?.mealChoice)?.name || "Meal"}
                                      />
                                    )}
                                    {seat.guest.firstName} {seat.guest.lastName.charAt(0)}.
                                  </span>
                                ) : (
                                  <span className={darkMode ? "text-gray-500" : "text-gray-300"}>—</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className={`divide-y ${darkMode ? "divide-gray-600" : "divide-gray-200"}`}>
                        {seats.map((seat) => {
                          const mealColor = seat.guest ? getMealColor(seat.guest.mealChoice) : null;
                          return (
                            <div
                              key={seat.number}
                              className={`flex items-center ${
                                dropHighlightSeat?.tableId === table.id && dropHighlightSeat?.seatNumber === seat.number
                                  ? "bg-blue-100"
                                  : darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                              }`}
                            >
                              <div className={`w-8 text-xs text-center py-1.5 border-r ${darkMode ? "text-gray-400 border-gray-600 bg-gray-700" : "text-gray-500 border-gray-200 bg-gray-50"}`}>
                                {seat.number}
                              </div>
                              <button
                                className={`flex-1 px-2 py-1.5 text-xs text-left truncate ${darkMode ? "hover:bg-gray-700" : "hover:bg-blue-50"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSeatClick(table.id, seat.number);
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  if (draggingGuestId && !seat.guest) {
                                    setDropHighlightSeat({ tableId: table.id, seatNumber: seat.number });
                                  }
                                }}
                                onDragLeave={() => setDropHighlightSeat(null)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const guestId = e.dataTransfer.getData("guestId");
                                  if (guestId) {
                                    handleSeatDrop(table.id, seat.number, guestId);
                                  }
                                }}
                              >
                                {seat.guest ? (
                                  <span className={darkMode ? "text-gray-100" : "text-gray-900"}>
                                    {mealColor && (
                                      <span
                                        className="inline-block w-2 h-2 rounded-full mr-1"
                                        style={{ backgroundColor: mealColor }}
                                        title={mealOptions.find(m => m.id === seat.guest?.mealChoice)?.name || "Meal"}
                                      />
                                    )}
                                    {seat.guest.firstName} {seat.guest.lastName}
                                  </span>
                                ) : (
                                  <span className={`${darkMode ? "text-gray-500" : "text-gray-300"} italic`}>Empty</span>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Capacity bar */}
                  {renderCapacityBar(table)}
                </div>
              );
            })}

            {tables.length === 0 && (
              <div className="flex items-center justify-center h-full absolute inset-0 pointer-events-none">
                <div className={`text-center ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  <p className="text-lg font-medium">No tables yet</p>
                  <p className="text-sm">Add a table using the button on the right</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`w-72 border-l flex flex-col ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className={`p-4 border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
          <h3 className={`font-semibold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Plan Designer</h3>
          <p className={`text-sm mt-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            Drag tables to reposition. Click seats to assign guests.
          </p>
        </div>

        <div className={`p-4 border-b space-y-2 ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full px-3 py-2 text-sm font-medium text-white bg-pink-600 rounded hover:bg-pink-700"
          >
            + Add Table
          </button>

          {selectedTable && (
            <>
              <button
                onClick={handleOpenEditModal}
                className={`w-full px-3 py-2 text-sm font-medium rounded ${darkMode ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                ✏️ Edit Table
              </button>
              <button
                onClick={handleDuplicate}
                className={`w-full px-3 py-2 text-sm font-medium rounded ${darkMode ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                📋 Duplicate Table
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full px-3 py-2 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50"
              >
                Delete Table
              </button>
            </>
          )}

          {selectedCount > 1 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full px-3 py-2 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50"
            >
              Delete Selected ({selectedCount})
            </button>
          )}
        </div>

        {/* Meal legend */}
        {mealOptions.length > 0 && (
          <div className={`p-4 border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
            <h4 className={`text-xs font-medium mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              Meal Choices
            </h4>
            <div className="flex flex-wrap gap-2">
              {mealOptions.map((meal) => {
                const color = mealColors.get(meal.id) || "#6b7280";
                return (
                  <div key={meal.id} className="flex items-center gap-1 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className={darkMode ? "text-gray-300" : "text-gray-600"}>{meal.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unassigned guests */}
        <div className={`flex-1 p-4 overflow-y-auto`}>
          <h4 className={`text-sm font-medium mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
            Unassigned ({unassigned.length})
          </h4>

          <div className="relative mb-2">
            <input
              type="text"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              placeholder="Search guests..."
              className={`w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-pink-500 ${inputClass}`}
            />
            {guestSearch && (
              <button
                onClick={() => setGuestSearch("")}
                className={`absolute right-2 top-1/2 -translate-y-1/2 ${darkMode ? "text-gray-400 hover:text-gray-200" : "text-gray-400 hover:text-gray-600"}`}
              >
                ×
              </button>
            )}
          </div>

          {guestSearch && (
            <p className={`text-xs mb-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              Showing {filteredUnassigned.length} of {unassigned.length}
            </p>
          )}

          <div className="space-y-1">
            {filteredUnassigned.slice(0, 30).map((guest) => {
              const mealColor = getMealColor(guest.mealChoice);
              return (
                <div
                  key={guest.id}
                  draggable
                  onDragStart={(e) => handleGuestDragStart(e, guest.id)}
                  onDragEnd={handleGuestDragEnd}
                  className={`text-xs p-2 rounded truncate cursor-grab active:cursor-grabbing ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-50 hover:bg-gray-100"}`}
                  title={`${guest.firstName} ${guest.lastName} (drag to seat)`}
                >
                  {mealColor && (
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1"
                      style={{ backgroundColor: mealColor }}
                    />
                  )}
                  {guest.firstName} {guest.lastName}
                </div>
              );
            })}
            {filteredUnassigned.length > 30 && (
              <p className={`text-xs text-center py-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                +{filteredUnassigned.length - 30} more
              </p>
            )}
            {filteredUnassigned.length === 0 && guestSearch && (
              <p className={`text-xs text-center py-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>No matching guests</p>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className={`p-4 text-xs border-t ${darkMode ? "text-gray-500 border-gray-700" : "text-gray-500 border-gray-200"}`}>
          <p className="font-medium mb-1">Tips:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Drag canvas background to pan</li>
            <li>Use arrow buttons to navigate</li>
            <li>"Fit All" shows all tables</li>
            <li>Scroll to zoom in/out</li>
            <li>Double-click name to rename</li>
            <li>Shift+click to select multiple</li>
          </ul>
        </div>
      </div>

      {/* Create Table Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg shadow-xl p-6 w-96 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className={`text-lg font-medium mb-4 ${darkMode ? "text-gray-100" : ""}`}>Add New Table</h3>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Table Name
                </label>
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-pink-500 ${inputClass}`}
                  placeholder="e.g., Table 1"
                  autoFocus
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Number of Seats
                </label>
                <input
                  type="number"
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 8)}
                  min={1}
                  max={50}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-pink-500 ${inputClass}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Orientation
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewTableOrientation("HORIZONTAL")}
                    className={`flex-1 px-3 py-2 text-sm rounded border ${
                      newTableOrientation === "HORIZONTAL"
                        ? "bg-pink-50 border-pink-500 text-pink-700"
                        : darkMode ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Horizontal (H)
                  </button>
                  <button
                    onClick={() => setNewTableOrientation("VERTICAL")}
                    className={`flex-1 px-3 py-2 text-sm rounded border ${
                      newTableOrientation === "VERTICAL"
                        ? "bg-pink-50 border-pink-500 text-pink-700"
                        : darkMode ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Vertical (V)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className={`px-4 py-2 text-sm ${darkMode ? "text-gray-300 hover:text-gray-100" : "text-gray-600 hover:text-gray-700"}`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTable}
                disabled={!newTableName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {showEditModal && selectedTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg shadow-xl p-6 w-96 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className={`text-lg font-medium mb-4 ${darkMode ? "text-gray-100" : ""}`}>Edit Table</h3>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Table Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-pink-500 ${inputClass}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Number of Seats
                </label>
                <input
                  type="number"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(parseInt(e.target.value) || 8)}
                  min={selectedTable.guests.length || 1}
                  max={50}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-pink-500 ${inputClass}`}
                />
                {selectedTable.guests.length > 0 && (
                  <p className={`text-xs mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                    Minimum {selectedTable.guests.length} (current guests)
                  </p>
                )}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-pink-500 ${inputClass}`}
                  placeholder="Special requirements, dietary notes, etc."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className={`px-4 py-2 text-sm ${darkMode ? "text-gray-300 hover:text-gray-100" : "text-gray-600 hover:text-gray-700"}`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || editCapacity < selectedTable.guests.length}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg shadow-xl p-6 w-80 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className={`text-lg font-medium mb-2 ${darkMode ? "text-gray-100" : ""}`}>
              Delete {selectedCount > 1 ? `${selectedCount} Tables` : "Table"}?
            </h3>
            <p className={`text-sm mb-4 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
              This will remove the table{selectedCount > 1 ? "s" : ""} and unassign all guests.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={`px-4 py-2 text-sm ${darkMode ? "text-gray-300 hover:text-gray-100" : "text-gray-600 hover:text-gray-700"}`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seat Assignment Modal */}
      {showAssignModal && selectedSeat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg shadow-xl p-6 w-96 max-h-[80vh] overflow-hidden flex flex-col ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className={`text-lg font-medium mb-2 ${darkMode ? "text-gray-100" : ""}`}>
              Seat {selectedSeat.seatNumber}
            </h3>

            {currentGuest && (
              <div className={`mb-4 p-3 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>Currently seated:</p>
                <p className={`font-medium ${darkMode ? "text-gray-100" : ""}`}>
                  {currentGuest.firstName} {currentGuest.lastName}
                </p>
                <button
                  onClick={() => handleAssignGuest(null)}
                  className="mt-2 text-sm text-red-500 hover:text-red-400"
                >
                  Remove from seat
                </button>
              </div>
            )}

            <div className={`flex border-b mb-4 ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
              <button
                onClick={() => setAssignModalTab("unassigned")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  assignModalTab === "unassigned"
                    ? "text-pink-600 border-pink-600"
                    : darkMode ? "text-gray-400 border-transparent hover:text-gray-200" : "text-gray-500 border-transparent hover:text-gray-700"
                }`}
              >
                Unassigned ({filteredUnassigned.length})
              </button>
              <button
                onClick={() => setAssignModalTab("otherTables")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  assignModalTab === "otherTables"
                    ? "text-pink-600 border-pink-600"
                    : darkMode ? "text-gray-400 border-transparent hover:text-gray-200" : "text-gray-500 border-transparent hover:text-gray-700"
                }`}
              >
                On Other Tables ({filteredOtherGuests.length})
              </button>
            </div>

            <div className="relative mb-3">
              <input
                type="text"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Search guests..."
                className={`w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-pink-500 ${inputClass}`}
              />
              {guestSearch && (
                <button
                  onClick={() => setGuestSearch("")}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 ${darkMode ? "text-gray-400 hover:text-gray-200" : "text-gray-400 hover:text-gray-600"}`}
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {assignModalTab === "unassigned" && (
                <>
                  {filteredUnassigned.length === 0 ? (
                    <p className={`text-sm text-center py-4 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                      {guestSearch ? "No matching guests" : "No unassigned guests"}
                    </p>
                  ) : (
                    filteredUnassigned.slice(0, 50).map((guest) => {
                      const mealColor = getMealColor(guest.mealChoice);
                      return (
                        <button
                          key={guest.id}
                          onClick={() => handleAssignGuest(guest.id)}
                          className={`w-full text-left px-3 py-2 text-sm rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
                        >
                          {mealColor && (
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1"
                              style={{ backgroundColor: mealColor }}
                            />
                          )}
                          {guest.firstName} {guest.lastName}
                        </button>
                      );
                    })
                  )}
                  {filteredUnassigned.length > 50 && (
                    <p className={`text-xs text-center py-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                      +{filteredUnassigned.length - 50} more
                    </p>
                  )}
                </>
              )}

              {assignModalTab === "otherTables" && (
                <>
                  {filteredOtherGuests.length === 0 ? (
                    <p className={`text-sm text-center py-4 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                      {guestSearch ? "No matching guests" : "No guests on other tables"}
                    </p>
                  ) : (
                    filteredOtherGuests.slice(0, 50).map((guest) => {
                      const mealColor = getMealColor(guest.mealChoice);
                      return (
                        <button
                          key={guest.id}
                          onClick={() => handleAssignGuest(guest.id)}
                          className={`w-full text-left px-3 py-2 text-sm rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
                        >
                          <div className="flex justify-between">
                            <span className={darkMode ? "text-gray-100" : ""}>
                              {mealColor && (
                                <span
                                  className="inline-block w-2 h-2 rounded-full mr-1"
                                  style={{ backgroundColor: mealColor }}
                                />
                              )}
                              {guest.firstName} {guest.lastName}
                            </span>
                            <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                              {guest.tableName}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                  {filteredOtherGuests.length > 50 && (
                    <p className={`text-xs text-center py-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                      +{filteredOtherGuests.length - 50} more
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedSeat(null);
                  setGuestSearch("");
                }}
                className={`px-4 py-2 text-sm ${darkMode ? "text-gray-300 hover:text-gray-100" : "text-gray-600 hover:text-gray-700"}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seat Conflict Modal */}
      {showConflictModal && currentGuest && pendingGuestId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg shadow-xl p-6 w-80 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className={`text-lg font-medium mb-2 ${darkMode ? "text-gray-100" : ""}`}>Seat Occupied</h3>
            <p className={`text-sm mb-4 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
              This seat is occupied by <strong>{currentGuest.firstName} {currentGuest.lastName}</strong>.
              What would you like to do?
            </p>
            <div className="space-y-2">
              <button
                onClick={handleConflictReplace}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded hover:bg-pink-700"
              >
                Replace (move to unassigned)
              </button>
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  setPendingGuestId(null);
                  setShowAssignModal(true);
                }}
                className={`w-full px-4 py-2 text-sm border rounded ${darkMode ? "text-gray-300 border-gray-600 hover:bg-gray-700" : "text-gray-600 border-gray-300 hover:bg-gray-50"}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg shadow-xl p-6 w-96 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className={`text-lg font-medium mb-4 ${darkMode ? "text-gray-100" : ""}`}>
              Print Seating Plan
            </h3>

            {/* Font size control */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
                Font Size: {printFontSize}px
              </label>
              <input
                type="range"
                min="6"
                max="16"
                value={printFontSize}
                onChange={(e) => setPrintFontSize(parseInt(e.target.value))}
                className="w-full"
              />
              <div className={`flex justify-between text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>

            {/* Spacing control */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
                Spacing: {printSpacing < 3 ? "Compact" : printSpacing < 5 ? "Slightly Compact" : printSpacing === 5 ? "Normal" : printSpacing < 8 ? "Slightly Spacious" : printSpacing < 10 ? "Spacious" : "Extra Spacious"}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                value={printSpacing}
                onChange={(e) => setPrintSpacing(parseInt(e.target.value))}
                className="w-full"
              />
              <div className={`flex justify-between text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                <span>Compact</span>
                <span>Normal</span>
                <span>Spacious</span>
              </div>
            </div>

            {/* Show last name checkbox */}
            <div className="mb-4">
              <label className={`flex items-center gap-2 cursor-pointer ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
                <input
                  type="checkbox"
                  checked={printShowLastName}
                  onChange={(e) => setPrintShowLastName(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm">Show last names</span>
              </label>
            </div>

            {/* Show meals checkbox */}
            <div className="mb-4">
              <label className={`flex items-center gap-2 cursor-pointer ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
                <input
                  type="checkbox"
                  checked={printShowMeals}
                  onChange={(e) => setPrintShowMeals(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm">Show meals</span>
              </label>
            </div>

            <p className={`text-sm mb-4 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
              Choose page orientation. The plan will be scaled to fit on one page.
            </p>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  doPrint("portrait", printFontSize, printSpacing, printShowLastName, printShowMeals);
                }}
                className={`w-full px-4 py-3 text-sm border rounded flex items-center justify-center gap-2 ${darkMode ? "text-gray-200 border-gray-600 hover:bg-gray-700" : "text-gray-700 border-gray-300 hover:bg-gray-50"}`}
              >
                <span className="text-lg">📄</span>
                <div className="text-left">
                  <div className="font-medium">Portrait</div>
                  <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Best for tall layouts</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  doPrint("landscape", printFontSize, printSpacing, printShowLastName, printShowMeals);
                }}
                className={`w-full px-4 py-3 text-sm border rounded flex items-center justify-center gap-2 ${darkMode ? "text-gray-200 border-gray-600 hover:bg-gray-700" : "text-gray-700 border-gray-300 hover:bg-gray-50"}`}
              >
                <span className="text-lg">📄</span>
                <div className="text-left">
                  <div className="font-medium">Landscape</div>
                  <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Best for wide layouts</div>
                </div>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowPrintModal(false)}
                className={`px-4 py-2 text-sm ${darkMode ? "text-gray-300 hover:text-gray-100" : "text-gray-600 hover:text-gray-700"}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
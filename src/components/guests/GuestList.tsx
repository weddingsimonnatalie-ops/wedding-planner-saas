"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Edit2, Trash2, Copy, Mail, Upload, X, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2, Pencil, Tag, Utensils, Download, Plus, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { RsvpStatusBadge } from "./RsvpStatusBadge";
import { CsvImportModal } from "./CsvImportModal";
import { PrintGuestListButton } from "./PrintGuestListButton";
import { GuestModal } from "./GuestModal";
import { CSV_TEMPLATE_HEADERS } from "@/lib/csv";
import { usePermissions } from "@/hooks/usePermissions";
import { useWedding, getEmailBlockReason } from "@/context/WeddingContext";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  groupName: string | null;
  rsvpStatus: string;
  rsvpToken: string;
  isManualOverride: boolean;
  invitedToCeremony: boolean;
  invitedToReception: boolean;
  invitedToAfterparty: boolean;
  attendingCeremony: boolean | null;
  attendingReception: boolean | null;
  attendingAfterparty: boolean | null;
  attendingCeremonyMaybe: boolean;
  attendingReceptionMaybe: boolean;
  attendingAfterpartyMaybe: boolean;
  mealChoice: string | null;
  table: { id: string; name: string } | null;
  unsubscribedAt: string | Date | null;
}

interface MealOption {
  id: string;
  name: string;
}

interface Table {
  id: string;
  name: string;
}

interface Stats {
  total: number;
  accepted: number;
  partial: number;
  declined: number;
  pending: number;
  maybe: number;
  unassigned: number;
}

interface Props {
  guests: Guest[];
  groups: string[];
  mealOptions: MealOption[];
  tables: Table[];
  totalGuests: number;
  stats: Stats;
  hasFilters: boolean;
  currentFilters: {
    search?: string;
    status?: string;
    group?: string;
    tableAssigned?: string;
    tableId?: string;
    event?: string;
    meal?: string;
    dietary?: string;
  };
}

interface EmailDialogState {
  phase: "confirm" | "sending" | "done";
  guestsWithEmail: Guest[];
  guestsWithoutEmail: Guest[];
  includedIds: Set<string>;
  current: number;
  total: number;
  sent: Array<{ id: string; name: string }>;
  failed: Array<{ id: string; name: string; error: string }>;
}

export function GuestList({ guests, groups, mealOptions, tables, totalGuests, stats, hasFilters, currentFilters }: Props) {
  const router = useRouter();
  const perms = usePermissions();
  const { subscriptionStatus } = useWedding();
  const canSendEmail = subscriptionStatus === "ACTIVE" || subscriptionStatus === "PAST_DUE";
  const emailBlockReason = getEmailBlockReason(subscriptionStatus);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emailDialog, setEmailDialog] = useState<EmailDialogState | null>(null);
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const quickSelectRef = useRef<HTMLDivElement>(null);
  const [showSetStatus, setShowSetStatus] = useState(false);
  const setStatusRef = useRef<HTMLDivElement>(null);
  const [bulkStatusDialog, setBulkStatusDialog] = useState<{ status: string } | null>(null);
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);
  const [showSetMeal, setShowSetMeal] = useState(false);
  const setMealRef = useRef<HTMLDivElement>(null);
  const [bulkMealDialog, setBulkMealDialog] = useState<{ mealChoiceId: string | null; mealLabel: string } | null>(null);
  const [bulkMealUpdating, setBulkMealUpdating] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = useState(currentFilters.search ?? "");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mealMap = Object.fromEntries(mealOptions.map((m) => [m.id, m.name]));

  // Close quick select and set status dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (quickSelectRef.current && !quickSelectRef.current.contains(e.target as Node)) {
        setShowQuickSelect(false);
      }
      if (setStatusRef.current && !setStatusRef.current.contains(e.target as Node)) {
        setShowSetStatus(false);
      }
      if (setMealRef.current && !setMealRef.current.contains(e.target as Node)) {
        setShowSetMeal(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Keep search input in sync when URL changes (e.g. "Clear all filters")
  useEffect(() => {
    setSearchValue(currentFilters.search ?? "");
  }, [currentFilters.search]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function navigateFilter(url: string) {
    startTransition(() => router.push(url));
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      navigateFilter(buildUrl({ ...currentFilters, search: value }));
    }, 300);
  }

  function buildUrl(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
    return `/guests?${sp.toString()}`;
  }

  const filters = currentFilters;

  const EVENT_LABELS: Record<string, string> = {
    invited_ceremony:         "Invited to Ceremony",
    invited_reception:        "Invited to Reception",
    invited_afterparty:       "Invited to Afterparty",
    attending_ceremony:       "Attending Ceremony",
    attending_reception:      "Attending Reception",
    attending_afterparty:     "Attending Afterparty",
    not_attending_ceremony:   "Not attending Ceremony",
    not_attending_reception:  "Not attending Reception",
    not_attending_afterparty: "Not attending Afterparty",
  };

  const activeFilterCount = [filters.status, filters.group, filters.tableAssigned || filters.tableId, filters.event, filters.meal, filters.dietary].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || !!filters.search;

  const [showFilterPanel, setShowFilterPanel] = useState(activeFilterCount > 0);
  // Read localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    if (activeFilterCount > 0) return; // always open when filters active
    try {
      const stored = localStorage.getItem("guestFilterPanelOpen");
      if (stored !== null) setShowFilterPanel(stored === "true");
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep panel open whenever filters become active
  useEffect(() => {
    if (activeFilterCount > 0) setShowFilterPanel(true);
  }, [activeFilterCount]);

  function toggleFilterPanel() {
    const next = !showFilterPanel;
    setShowFilterPanel(next);
    try { localStorage.setItem("guestFilterPanelOpen", String(next)); } catch {}
  }

  // Meal label for active badge (meal filter value is the meal option ID)
  const mealBadgeLabel = filters.meal === "none"
    ? "No meal chosen"
    : filters.meal
      ? (mealOptions.find(m => m.id === filters.meal)?.name ?? filters.meal)
      : null;

  // Sort tables: Top Table / Head Table first, then alphabetical
  const sortedTables = [...tables].sort((a, b) => {
    const priority = ["top table", "head table"];
    const ai = priority.indexOf(a.name.toLowerCase());
    const bi = priority.indexOf(b.name.toLowerCase());
    if (ai !== -1 && bi === -1) return -1;
    if (bi !== -1 && ai === -1) return 1;
    if (ai !== -1 && bi !== -1) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  // Derive the select value for the table dropdown
  const tableSelectValue = filters.tableId ?? (filters.tableAssigned === "yes" ? "assigned" : filters.tableAssigned === "no" ? "unassigned" : "");

  // Name lookup for the active badge
  const selectedTableName = filters.tableId ? (tables.find(t => t.id === filters.tableId)?.name ?? filters.tableId) : null;

  // ── Selection ───────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === guests.length && guests.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(guests.map(g => g.id)));
    }
  }

  const allSelected = guests.length > 0 && selectedIds.size === guests.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < guests.length;

  function handleQuickSelect(type: string) {
    setShowQuickSelect(false);
    if (type === "clear") {
      setSelectedIds(new Set());
    } else if (type === "pending") {
      setSelectedIds(new Set(guests.filter(g => g.rsvpStatus === "PENDING").map(g => g.id)));
    } else if (type === "with-email") {
      setSelectedIds(new Set(guests.filter(g => g.email).map(g => g.id)));
    } else if (type === "pending-with-email") {
      setSelectedIds(new Set(guests.filter(g => g.rsvpStatus === "PENDING" && g.email).map(g => g.id)));
    }
  }

  // ── Individual guest actions ─────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm("Delete this guest?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/guests/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      showToast("Guest deleted");
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      startTransition(() => router.refresh());
    } else {
      showToast("Failed to delete guest", false);
    }
  }

  async function handleSendEmail(guest: Guest) {
    if (!guest.email) { showToast("Guest has no email address", false); return; }
    setSendingId(guest.id);
    const res = await fetch("/api/email/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId: guest.id }),
    });
    setSendingId(null);
    const data = await res.json();
    showToast(data.message ?? (res.ok ? "Email sent" : "Failed to send email"), res.ok);
  }

  async function copyRsvpLink(token: string) {
    const url = `${window.location.origin}/rsvp/${token}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast("RSVP link copied");
    } catch {
      showToast("Could not copy link", false);
    }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} guest${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    let successCount = 0;
    for (const id of ids) {
      const res = await fetch(`/api/guests/${id}`, { method: "DELETE" });
      if (res.ok) successCount++;
    }
    showToast(`${successCount} guest${successCount !== 1 ? "s" : ""} deleted`);
    startTransition(() => router.refresh());
  }

  async function handleBulkStatus() {
    if (!bulkStatusDialog) return;
    setBulkStatusUpdating(true);
    const res = await fetch("/api/guests/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestIds: Array.from(selectedIds), rsvpStatus: bulkStatusDialog.status }),
    });
    setBulkStatusUpdating(false);
    setBulkStatusDialog(null);
    if (res.ok) {
      const data = await res.json();
      showToast(`Status updated for ${data.updated} guest${data.updated !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      startTransition(() => router.refresh());
    } else {
      showToast("Failed to update status", false);
    }
  }

  async function handleBulkMeal() {
    if (!bulkMealDialog) return;
    setBulkMealUpdating(true);
    const receptionGuestIds = Array.from(selectedIds).filter(id => guests.find(g => g.id === id)?.invitedToReception);
    const res = await fetch("/api/guests/bulk-meal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestIds: receptionGuestIds, mealChoice: bulkMealDialog.mealChoiceId }),
    });
    setBulkMealUpdating(false);
    setBulkMealDialog(null);
    if (res.ok) {
      const data = await res.json();
      showToast(`Meal choice updated for ${data.updated} guest${data.updated !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      startTransition(() => router.refresh());
    } else {
      showToast("Failed to update meal choice", false);
    }
  }

  function openEmailDialog() {
    const selected = guests.filter(g => selectedIds.has(g.id));
    const guestsWithEmail = selected.filter(g => !!g.email);
    const guestsWithoutEmail = selected.filter(g => !g.email);
    setEmailDialog({
      phase: "confirm",
      guestsWithEmail,
      guestsWithoutEmail,
      includedIds: new Set(guestsWithEmail.map(g => g.id)),
      current: 0,
      total: guestsWithEmail.length,
      sent: [],
      failed: [],
    });
  }

  function toggleEmailIncluded(id: string) {
    setEmailDialog(d => {
      if (!d) return d;
      const next = new Set(d.includedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...d, includedIds: next };
    });
  }

  async function startSending() {
    if (!emailDialog) return;
    const toSend = emailDialog.guestsWithEmail.filter(g => emailDialog.includedIds.has(g.id));
    setEmailDialog(d => d ? { ...d, phase: "sending", current: 0, total: toSend.length, sent: [], failed: [] } : null);

    const sent: Array<{ id: string; name: string }> = [];
    const failed: Array<{ id: string; name: string; error: string }> = [];

    for (let i = 0; i < toSend.length; i++) {
      const guest = toSend[i];
      setEmailDialog(d => d ? { ...d, current: i + 1 } : null);

      try {
        const res = await fetch("/api/email/rsvp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestId: guest.id }),
        });
        const data = await res.json();
        if (res.ok) {
          sent.push({ id: guest.id, name: `${guest.firstName} ${guest.lastName}` });
        } else {
          failed.push({ id: guest.id, name: `${guest.firstName} ${guest.lastName}`, error: data.error ?? data.message ?? "Failed" });
        }
      } catch {
        failed.push({ id: guest.id, name: `${guest.firstName} ${guest.lastName}`, error: "Network error" });
      }

      setEmailDialog(d => d ? { ...d, sent: [...sent], failed: [...failed] } : null);

      if (i < toSend.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    setEmailDialog(d => d ? { ...d, phase: "done" } : null);
  }

  const csvTemplateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE_HEADERS + "Jane,Smith,jane@example.com,,,n,y,y,n,")}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900">Guests</h1>
        {perms.can.editGuests && (
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add guest
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-2 md:gap-3">
        {[
          { label: hasFilters ? "Filtered" : "Total", value: stats.total, color: hasFilters ? "text-primary" : "text-gray-900" },
          { label: "Accepted", value: stats.accepted, color: "text-green-600" },
          { label: "Partial", value: stats.partial, color: "text-orange-500" },
          { label: "Declined", value: stats.declined, color: "text-red-600" },
          { label: "Pending", value: stats.pending, color: "text-amber-600" },
          { label: "Maybe", value: stats.maybe, color: "text-gray-500" },
          { label: "Unassigned", value: stats.unassigned, color: "text-blue-600" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white rounded-lg md:rounded-xl border border-gray-200 px-2 py-1.5 md:px-4 md:py-3 text-center min-w-0"
          >
            <p className={`text-base md:text-xl font-bold ${color} truncate`}>{value}</p>
            <p className="text-[10px] md:text-xs text-gray-500 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-2">
        {/* Desktop toolbar */}
        <div className="hidden sm:flex items-center gap-2 flex-wrap">
          {perms.can.importExportGuests && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
          )}
          <a
            href="/api/guests/export"
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <a
            href={csvTemplateHref}
            download="guest-import-template.csv"
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Template CSV
          </a>
          {guests.length > 0 && perms.can.editGuests && (
            <div className="relative" ref={quickSelectRef}>
              <button
                type="button"
                onClick={() => setShowQuickSelect(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Quick select
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showQuickSelect && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-56">
                  <button
                    type="button"
                    onClick={() => handleQuickSelect("pending-with-email")}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Select all pending with email
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSelect("pending")}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Select all pending
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSelect("with-email")}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Select all with email
                  </button>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleQuickSelect("clear")}
                      className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <PrintGuestListButton />
        </div>

        {/* Mobile: More ▾ dropdown */}
        <div className="sm:hidden relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setShowMoreMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
            More
            <ChevronDown className="w-3 h-3" />
          </button>
          {showMoreMenu && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
              <div className="px-3 py-2 text-xs text-gray-400 font-medium uppercase tracking-wide">Print</div>
              <PrintGuestListButton inDropdown onClose={() => setShowMoreMenu(false)} />
              <div className="border-t border-gray-100 my-1" />
              {perms.can.importExportGuests && (
                <button
                  type="button"
                  onClick={() => { setShowImport(true); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV
                </button>
              )}
              <a
                href="/api/guests/export"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setShowMoreMenu(false)}
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </a>
              <a
                href={csvTemplateHref}
                download="guest-import-template.csv"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setShowMoreMenu(false)}
              >
                Template CSV
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Read-only banner */}
      {!perms.can.editGuests && (
        <ReadOnlyBanner message="You have view-only access to the guest list." />
      )}

      {/* Filters */}
      <div className="mb-4">
        {/* Top row: search + filters button + clear */}
        <form
          className="flex gap-2 mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            navigateFilter(buildUrl({ ...filters, search: searchValue }));
          }}
        >
          <input
            name="search"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search name…"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={toggleFilterPanel}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-sm border rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeFilterCount > 0 ? "bg-primary/10 border-primary/30 text-primary" : "text-gray-600 border-gray-300 hover:bg-gray-50"}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && <span>({activeFilterCount})</span>}
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilterPanel ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => { setShowFilterPanel(false); try { localStorage.setItem("guestFilterPanelOpen", "false"); } catch {} navigateFilter("/guests"); }}
            className="px-2 sm:px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap shrink-0"
          >
            Clear
          </button>
        </form>

        {/* Collapsible filter panel */}
        {showFilterPanel && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={filters.status ?? ""}
                  onChange={(e) => navigateFilter(buildUrl({ ...filters, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All statuses</option>
                  {["PENDING", "ACCEPTED", "PARTIAL", "DECLINED", "MAYBE"].map((s) => (
                    <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Group</label>
                <select
                  value={filters.group ?? ""}
                  onChange={(e) => navigateFilter(buildUrl({ ...filters, group: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All groups</option>
                  <option value="none">— No group —</option>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Table</label>
                <select
                  value={tableSelectValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      navigateFilter(buildUrl({ ...filters, tableAssigned: "", tableId: "" }));
                    } else if (v === "assigned") {
                      navigateFilter(buildUrl({ ...filters, tableAssigned: "yes", tableId: "" }));
                    } else if (v === "unassigned") {
                      navigateFilter(buildUrl({ ...filters, tableAssigned: "no", tableId: "" }));
                    } else {
                      navigateFilter(buildUrl({ ...filters, tableAssigned: "", tableId: v }));
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All tables</option>
                  <optgroup label="─────────────">
                    <option value="unassigned">— Unassigned —</option>
                    <option value="assigned">— Assigned (any) —</option>
                  </optgroup>
                  {sortedTables.length > 0 && (
                    <optgroup label="─────────────">
                      {sortedTables.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Event</label>
                <select
                  value={filters.event ?? ""}
                  onChange={(e) => navigateFilter(buildUrl({ ...filters, event: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All events</option>
                  <optgroup label="─────────────────────────">
                    <option value="invited_ceremony">Invited to Ceremony</option>
                    <option value="invited_reception">Invited to Reception</option>
                    <option value="invited_afterparty">Invited to Afterparty</option>
                  </optgroup>
                  <optgroup label="─────────────────────────">
                    <option value="attending_ceremony">Attending Ceremony</option>
                    <option value="attending_reception">Attending Reception</option>
                    <option value="attending_afterparty">Attending Afterparty</option>
                  </optgroup>
                  <optgroup label="─────────────────────────">
                    <option value="not_attending_ceremony">Not attending Ceremony</option>
                    <option value="not_attending_reception">Not attending Reception</option>
                    <option value="not_attending_afterparty">Not attending Afterparty</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Meal</label>
                <select
                  value={filters.meal ?? ""}
                  onChange={(e) => navigateFilter(buildUrl({ ...filters, meal: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All meal choices</option>
                  <option value="none">— No meal chosen —</option>
                  {mealOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Dietary</label>
                <select
                  value={filters.dietary ?? ""}
                  onChange={(e) => navigateFilter(buildUrl({ ...filters, dietary: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Any dietary needs</option>
                  <option value="has_notes">Has dietary notes</option>
                  <option value="no_notes">No dietary notes</option>
                </select>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setShowFilterPanel(false); try { localStorage.setItem("guestFilterPanelOpen", "false"); } catch {} navigateFilter("/guests"); }}
                className="text-sm text-primary hover:underline"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}

        {/* Active filter badges */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {filters.status && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                Status: {filters.status[0] + filters.status.slice(1).toLowerCase()}
                <button
                  type="button"
                  onClick={() => navigateFilter(buildUrl({ ...filters, status: "" }))}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.group && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                Group: {filters.group === "none" ? "— No group —" : filters.group}
                <button
                  type="button"
                  onClick={() => navigateFilter(buildUrl({ ...filters, group: "" }))}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.tableAssigned && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                Table: {filters.tableAssigned === "yes" ? "Assigned" : "Unassigned"}
                <button
                  type="button"
                  onClick={() => navigateFilter(buildUrl({ ...filters, tableAssigned: "" }))}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.tableId && selectedTableName && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                Table: {selectedTableName}
                <button
                  type="button"
                  onClick={() => navigateFilter(buildUrl({ ...filters, tableId: "" }))}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.event && EVENT_LABELS[filters.event] && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                Event: {EVENT_LABELS[filters.event]}
                <button
                  type="button"
                  onClick={() => navigateFilter(buildUrl({ ...filters, event: "" }))}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.meal && mealBadgeLabel && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                Meal: {mealBadgeLabel}
                <button
                  type="button"
                  onClick={() => navigateFilter(buildUrl({ ...filters, meal: "" }))}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.dietary && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                Dietary: {filters.dietary === "has_notes" ? "Has dietary notes" : "No dietary notes"}
                <button
                  type="button"
                  onClick={() => navigateFilter(buildUrl({ ...filters, dietary: "" }))}
                  className="hover:text-blue-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
        {hasActiveFilters && (
          <p className="text-sm text-gray-500 mt-2">
            Showing {guests.length} of {totalGuests} guest{totalGuests !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Selection count row */}
      {selectedIds.size > 0 && perms.can.editGuests && (
        <div className="flex items-center justify-end mb-2">
          <span className="text-sm text-gray-600 font-medium">
            {selectedIds.size} guest{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
        </div>
      )}

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && perms.can.editGuests && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-3 shadow-sm">
          {perms.can.manageRsvp && (
            <UpgradePrompt active={!canSendEmail} reason={emailBlockReason ?? ""}>
              <button
                type="button"
                onClick={canSendEmail ? openEmailDialog : undefined}
                disabled={!canSendEmail}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-3.5 h-3.5" />
                Send RSVP emails ({selectedIds.size})
              </button>
            </UpgradePrompt>
          )}
          {/* Set Status dropdown */}
          <div className="relative" ref={setStatusRef}>
            <button
              type="button"
              onClick={() => setShowSetStatus(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Tag className="w-3.5 h-3.5" />
              Set Status
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showSetStatus && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
                {[
                  { value: "PENDING",  label: "Pending",  dot: "bg-amber-400" },
                  { value: "ACCEPTED", label: "Accepted", dot: "bg-green-500" },
                  { value: "PARTIAL",  label: "Partial",  dot: "bg-orange-400" },
                  { value: "DECLINED", label: "Declined", dot: "bg-red-500" },
                  { value: "MAYBE",    label: "Maybe",    dot: "bg-gray-400" },
                ].map(({ value, label, dot }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setShowSetStatus(false); setBulkStatusDialog({ status: value }); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Set Meal dropdown */}
          <div className="relative" ref={setMealRef}>
            <button
              type="button"
              onClick={() => setShowSetMeal(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Utensils className="w-3.5 h-3.5" />
              Set Meal
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showSetMeal && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52">
                <button
                  type="button"
                  onClick={() => { setShowSetMeal(false); setBulkMealDialog({ mealChoiceId: null, mealLabel: "— No choice —" }); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
                >
                  — No choice —
                </button>
                {mealOptions.length > 0 && <div className="border-t border-gray-100 my-1" />}
                {mealOptions.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setShowSetMeal(false); setBulkMealDialog({ mealChoiceId: m.id, mealLabel: m.name }); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete ({selectedIds.size})
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1 px-2 py-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors ml-auto"
          >
            <X className="w-3.5 h-3.5" />
            Clear selection
          </button>
        </div>
      )}

      {/* Guest list */}
      {guests.length === 0 ? (
        hasActiveFilters ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-gray-700 font-medium">No guests match your filters</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting or clearing your filters.</p>
            <button
              type="button"
              onClick={() => { setShowFilterPanel(false); navigateFilter("/guests"); }}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <p className="text-gray-400">No guests found</p>
            {perms.can.editGuests && (
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                Add the first guest
              </button>
            )}
          </div>
        )
      ) : (
        <div className={`transition-opacity duration-150 ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
          {/* ── Mobile card layout (hidden on md+) ── */}
          <div className="md:hidden space-y-1.5">
            {guests.map((g) => (
              <Link
                key={g.id}
                href={`/guests/${g.id}`}
                className={`block bg-white rounded-xl border transition-colors ${perms.can.editGuests && selectedIds.has(g.id) ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div className="px-3 pt-2.5 pb-2">
                  <div className="flex items-center gap-2">
                    {perms.can.editGuests && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(g.id)}
                        onChange={() => toggleSelect(g.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer shrink-0"
                      />
                    )}
                    <span className="font-medium text-gray-900 truncate flex-1">
                      {g.firstName} {g.lastName}
                    </span>
                    {g.groupName && (
                      <span className="text-xs text-gray-500 truncate">{g.groupName}</span>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 ml-6">
                    <RsvpStatusBadge status={g.rsvpStatus} short />
                    {[
                      { key: "C", invited: g.invitedToCeremony,   attending: g.attendingCeremony,   maybe: g.attendingCeremonyMaybe },
                      { key: "R", invited: g.invitedToReception,  attending: g.attendingReception,  maybe: g.attendingReceptionMaybe },
                      { key: "A", invited: g.invitedToAfterparty, attending: g.attendingAfterparty, maybe: g.attendingAfterpartyMaybe },
                    ].map(({ key, invited, attending, maybe }) => (
                      <span
                        key={key}
                        className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold ${
                          !invited ? "opacity-0" :
                          attending === true  ? "bg-green-100 text-green-700" :
                          attending === false ? "bg-red-100 text-red-600" :
                          maybe               ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {key}
                      </span>
                    ))}
                    {g.unsubscribedAt && (
                      <span title="Unsubscribed from emails">
                        <XCircle className="w-3 h-3 text-gray-400 shrink-0" />
                      </span>
                    )}
                    <span className="flex-1" />
                    {g.table && (
                      <span className="text-gray-500">{g.table.name}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            <p className="text-xs text-gray-400 text-center py-2">
              {guests.length} guest{guests.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* ── Desktop table layout (hidden on mobile) ── */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {perms.can.editGuests && (
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        title="Select all"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Group</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Events</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">RSVP</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Meal</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Table</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {guests.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => perms.can.editGuests && toggleSelect(g.id)}
                    className={`hover:bg-gray-50 transition-colors ${perms.can.editGuests ? "cursor-pointer" : ""} ${perms.can.editGuests && selectedIds.has(g.id) ? "bg-blue-50 hover:bg-blue-50" : ""}`}
                  >
                    {perms.can.editGuests && (
                      <td className="px-4 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(g.id)}
                          onChange={() => toggleSelect(g.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/guests/${g.id}`} className="font-medium text-gray-900 hover:text-primary">
                        {g.firstName} {g.lastName}
                      </Link>
                      {g.email && (
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                          {g.unsubscribedAt && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]" title="Guest has unsubscribed from emails">
                              <XCircle className="w-3 h-3" />
                              Unsubscribed
                            </span>
                          )}
                          {g.email}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{g.groupName ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {[
                          { key: "C", label: "Ceremony",   invited: g.invitedToCeremony,   attending: g.attendingCeremony,   maybe: g.attendingCeremonyMaybe },
                          { key: "R", label: "Reception",  invited: g.invitedToReception,  attending: g.attendingReception,  maybe: g.attendingReceptionMaybe },
                          { key: "A", label: "Afterparty", invited: g.invitedToAfterparty, attending: g.attendingAfterparty, maybe: g.attendingAfterpartyMaybe },
                        ].map(({ key, label, invited, attending, maybe }) => (
                          <span
                            key={key}
                            title={!invited ? undefined :
                              attending === true  ? `${label}: attending` :
                              attending === false ? `${label}: not attending` :
                              maybe               ? `${label}: maybe` :
                              `${label}: no answer yet`
                            }
                            className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold ${
                              !invited ? "opacity-0 pointer-events-none" :
                              attending === true  ? "bg-green-100 text-green-700" :
                              attending === false ? "bg-red-100 text-red-600" :
                              maybe               ? "bg-amber-100 text-amber-700" :
                              "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {key}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <RsvpStatusBadge status={g.rsvpStatus} />
                        {g.isManualOverride && (
                          <span title="Status manually set by admin"><Pencil className="w-3 h-3 text-amber-500 shrink-0" /></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {g.mealChoice ? (mealMap[g.mealChoice] ?? g.mealChoice) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {g.table?.name ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title="Copy RSVP link"
                          onClick={() => copyRsvpLink(g.rsvpToken)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {perms.can.manageRsvp && (
                          <UpgradePrompt active={!canSendEmail} reason={emailBlockReason ?? ""}>
                            <button
                              title={canSendEmail ? "Send RSVP email" : undefined}
                              onClick={() => canSendEmail && handleSendEmail(g)}
                              disabled={sendingId === g.id || !canSendEmail}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          </UpgradePrompt>
                        )}
                        {perms.can.editGuests && (
                          <>
                            <Link
                              href={`/guests/${g.id}`}
                              title="Edit guest"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Link>
                            <button
                              title="Delete guest"
                              onClick={() => handleDelete(g.id)}
                              disabled={deletingId === g.id}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
              Showing {guests.length} guest{guests.length !== 1 ? "s" : ""}
              {" · C = Ceremony, R = Reception, A = Afterparty · Green = attending, Red = not attending, Grey = no answer"}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg transition-opacity ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Bulk set status confirmation dialog */}
      {bulkStatusDialog && (() => {
        const STATUS_LABELS: Record<string, string> = {
          PENDING: "Pending", ACCEPTED: "Accepted", PARTIAL: "Partial", DECLINED: "Declined", MAYBE: "Maybe",
        };
        const label = STATUS_LABELS[bulkStatusDialog.status] ?? bulkStatusDialog.status;
        const selectedGuests = guests.filter(g => selectedIds.has(g.id));
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
              <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  Set status to &ldquo;{label}&rdquo; for {selectedIds.size} guest{selectedIds.size !== 1 ? "s" : ""}?
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                <div className="space-y-0.5">
                  {selectedGuests.map(g => (
                    <div key={g.id} className="text-sm text-gray-700 py-0.5">
                      {g.firstName} {g.lastName}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 italic pt-1">
                  This will override their current status. If any of these guests later submit their own RSVP their status will be recalculated automatically.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBulkStatusDialog(null)}
                  disabled={bulkStatusUpdating}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkStatus}
                  disabled={bulkStatusUpdating}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {bulkStatusUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Set {label} for {selectedIds.size} guest{selectedIds.size !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk set meal confirmation dialog */}
      {bulkMealDialog && (() => {
        const selectedGuests = guests.filter(g => selectedIds.has(g.id));
        const receptionGuests = selectedGuests.filter(g => g.invitedToReception);
        const nonReceptionCount = selectedGuests.length - receptionGuests.length;
        const isClear = bulkMealDialog.mealChoiceId === null;
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
              <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  {isClear
                    ? `Clear meal choice for ${receptionGuests.length} guest${receptionGuests.length !== 1 ? "s" : ""}?`
                    : `Set meal choice to \u201c${bulkMealDialog.mealLabel}\u201d for ${receptionGuests.length} guest${receptionGuests.length !== 1 ? "s" : ""}?`}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                <div className="space-y-0.5">
                  {receptionGuests.map(g => (
                    <div key={g.id} className="text-sm text-gray-700 py-0.5">
                      {g.firstName} {g.lastName}
                    </div>
                  ))}
                </div>
                {nonReceptionCount > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Note: {nonReceptionCount} guest{nonReceptionCount !== 1 ? "s" : ""} in your selection {nonReceptionCount !== 1 ? "are" : "is"} not invited to the reception and will not have their meal choice updated.
                  </p>
                )}
                <p className="text-xs text-gray-400 italic pt-1">
                  {isClear
                    ? "This will remove their current meal selection."
                    : "This will override any meal choice the guest selected themselves via their RSVP link."}
                </p>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBulkMealDialog(null)}
                  disabled={bulkMealUpdating}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkMeal}
                  disabled={bulkMealUpdating || receptionGuests.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {bulkMealUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isClear
                    ? `Clear meal choice for ${receptionGuests.length} guest${receptionGuests.length !== 1 ? "s" : ""}`
                    : `Set ${bulkMealDialog.mealLabel} for ${receptionGuests.length} guest${receptionGuests.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk email dialog */}
      {emailDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* ── Confirm phase ── */}
            {emailDialog.phase === "confirm" && (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Send RSVP emails to {selectedIds.size} guest{selectedIds.size !== 1 ? "s" : ""}?
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {emailDialog.guestsWithEmail.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Will send ({emailDialog.guestsWithEmail.length} guest{emailDialog.guestsWithEmail.length !== 1 ? "s" : ""} with email address):
                      </p>
                      <div className="space-y-1">
                        {emailDialog.guestsWithEmail.map(g => (
                          <label key={g.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={emailDialog.includedIds.has(g.id)}
                              onChange={() => toggleEmailIncluded(g.id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600"
                            />
                            <span className="flex-1 text-sm text-gray-800">
                              {g.firstName} {g.lastName}
                              <span className="text-gray-400 ml-1.5">{g.email}</span>
                            </span>
                            <RsvpStatusBadge status={g.rsvpStatus} />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {emailDialog.guestsWithoutEmail.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Cannot send ({emailDialog.guestsWithoutEmail.length} guest{emailDialog.guestsWithoutEmail.length !== 1 ? "s" : ""} without email address):
                      </p>
                      <div className="space-y-1">
                        {emailDialog.guestsWithoutEmail.map(g => (
                          <div key={g.id} className="flex items-center gap-3 py-1.5 px-2 opacity-50">
                            <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-600">{g.firstName} {g.lastName} — no email on file</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {emailDialog.guestsWithEmail.length > 0 && (
                    <p className="text-xs text-gray-400 italic">
                      Note: guests who have already accepted will also receive an email. Untick to exclude them.
                    </p>
                  )}
                  {emailDialog.guestsWithEmail.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      None of the selected guests have an email address on file.
                    </p>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEmailDialog(null)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={startSending}
                    disabled={emailDialog.includedIds.size === 0}
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Send {emailDialog.includedIds.size} email{emailDialog.includedIds.size !== 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}

            {/* ── Sending phase ── */}
            {emailDialog.phase === "sending" && (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    Sending RSVP emails…
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{emailDialog.current} / {emailDialog.total} sent</span>
                      <span>{Math.round((emailDialog.current / emailDialog.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(emailDialog.current / emailDialog.total) * 100}%` }}
                      />
                    </div>
                  </div>
                  {emailDialog.sent.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sent</p>
                      <div className="space-y-0.5">
                        {emailDialog.sent.map(s => (
                          <div key={s.id} className="flex items-center gap-2 text-sm text-gray-700 py-0.5">
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            {s.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {emailDialog.failed.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Errors</p>
                      <div className="space-y-0.5">
                        {emailDialog.failed.map(f => (
                          <div key={f.id} className="flex items-center gap-2 text-sm text-red-600 py-0.5">
                            <XCircle className="w-4 h-4 shrink-0" />
                            {f.name} — {f.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Done phase ── */}
            {emailDialog.phase === "done" && (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                    Done
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {emailDialog.sent.length} email{emailDialog.sent.length !== 1 ? "s" : ""} sent successfully
                    {emailDialog.failed.length > 0 && ` · ${emailDialog.failed.length} failed`}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {emailDialog.sent.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sent</p>
                      <div className="space-y-0.5">
                        {emailDialog.sent.map(s => (
                          <div key={s.id} className="flex items-center gap-2 text-sm text-gray-700 py-0.5">
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            {s.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {emailDialog.failed.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Failed</p>
                      <div className="space-y-0.5">
                        {emailDialog.failed.map(f => (
                          <div key={f.id} className="flex items-center gap-2 text-sm text-red-600 py-0.5">
                            <XCircle className="w-4 h-4 shrink-0" />
                            {f.name} — {f.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setEmailDialog(null); setSelectedIds(new Set()); }}
                    className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add guest modal */}
      {addModalOpen && (
        <GuestModal
          onClose={() => setAddModalOpen(false)}
          groups={groups}
        />
      )}
    </div>
  );
}

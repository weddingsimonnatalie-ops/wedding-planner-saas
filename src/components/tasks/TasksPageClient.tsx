"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Edit2, Trash2, CheckSquare, ChevronDown, RefreshCw,
  Check, RotateCcw, Mail, X, Search,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { usePermissions } from "@/hooks/usePermissions";
import { useRefresh } from "@/context/RefreshContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { TaskModal, TaskData, TaskPriority, RecurringInterval } from "./TaskModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function dueDateLabel(dueDate: string | null, isCompleted: boolean): string | null {
  if (!dueDate || isCompleted) return null;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return `${n} day${n !== 1 ? "s" : ""} overdue`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return "Due " + new Date(dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dueDateClass(dueDate: string | null, isCompleted: boolean): string {
  if (!dueDate || isCompleted) return "text-gray-400";
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-red-600 font-medium";
  if (diffDays <= 1) return "text-amber-600 font-medium";
  const week = new Date(now);
  week.setDate(week.getDate() + 7);
  if (d <= week) return "text-amber-600 font-medium";
  return "text-gray-500";
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cls =
    priority === "HIGH"   ? "bg-red-100 text-red-700 border-red-200" :
    priority === "MEDIUM" ? "bg-amber-100 text-amber-700 border-amber-200" :
                            "bg-gray-100 text-gray-600 border-gray-200";
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

const INTERVAL_LABEL: Record<RecurringInterval, string> = {
  DAILY:       "daily",
  WEEKLY:      "weekly",
  FORTNIGHTLY: "fortnightly",
  MONTHLY:     "monthly",
};

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  isSelected,
  canBulkSelect,
  canComplete,
  onToggleSelect,
  onToggleComplete,
  onEdit,
  onDelete,
}: {
  task: TaskData;
  isSelected: boolean;
  canBulkSelect: boolean;
  canComplete: boolean;
  onToggleSelect: (id: string) => void;
  onToggleComplete: (task: TaskData) => void;
  onEdit?: (t: TaskData) => void;
  onDelete?: (t: TaskData) => void;
}) {
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);

  async function handleRemind(e: React.MouseEvent) {
    e.stopPropagation();
    setReminding(true);
    const res = await fetch("/api/email/task-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    setReminding(false);
    if (res.ok) setReminded(true);
  }

  const notesPreview = task.notes
    ? (task.notes.length > 80 ? task.notes.slice(0, 80) + "…" : task.notes)
    : null;

  const dueLabel = dueDateLabel(task.dueDate ?? null, task.isCompleted);
  const dueCls   = dueDateClass(task.dueDate ?? null, task.isCompleted);
  const isOverdue = !task.isCompleted && !!task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.(task)}
      onKeyDown={e => { if (onEdit && (e.key === "Enter" || e.key === " ")) onEdit(task); }}
      className={`bg-white rounded-xl border p-4 transition-all duration-200 ${
        isOverdue ? "border-red-200 bg-red-50/20" : "border-gray-200"
      } ${isSelected ? "ring-2 ring-primary" : ""} ${onEdit ? "cursor-pointer" : ""}`}
    >
      {/* Top row: checkbox + priority badge + category + recurring */}
      <div className="flex items-center gap-2 flex-wrap mb-1" onClick={e => e.stopPropagation()}>
        {canBulkSelect && (
          <label className="flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(task.id)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
          </label>
        )}
        <PriorityBadge priority={task.priority} />
        {task.category && (
          <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.category.colour }} />
            {task.category.name}
          </span>
        )}
        {task.isRecurring && task.recurringInterval && (
          <span title={`Recurring ${INTERVAL_LABEL[task.recurringInterval]}`} className="inline-flex items-center text-gray-400">
            <RefreshCw className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Title */}
      <p className={`text-sm font-semibold ${task.isCompleted ? "line-through text-gray-400" : "text-gray-900"}`}>
        {task.title}
      </p>

      {/* Due date + assignee + supplier */}
      {(dueLabel || task.assignedTo || task.supplier) && (
        <p className={`text-xs mt-0.5 ${dueCls}`} onClick={e => e.stopPropagation()}>
          {dueLabel}
          {task.assignedTo && (
            <span className="text-gray-500">{dueLabel ? " · " : ""}{task.assignedTo.name ?? task.assignedTo.email}</span>
          )}
          {task.supplier && (
            <>
              {(dueLabel || task.assignedTo) ? <span className="text-gray-400"> · </span> : null}
              <Link href={`/suppliers/${task.supplier.id}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>
                {task.supplier.name}
              </Link>
            </>
          )}
        </p>
      )}

      {/* Completed date */}
      {task.isCompleted && task.completedAt && (
        <p className="text-xs text-gray-400 mt-0.5">Completed {fmtDate(task.completedAt)}</p>
      )}

      {/* Notes */}
      {notesPreview && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">{notesPreview}</p>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap" onClick={e => e.stopPropagation()}>
        {canComplete && !task.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(task)}
            className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <Check className="w-3 h-3" /> Mark as Done
          </button>
        )}
        {canComplete && task.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(task)}
            className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Mark not done
          </button>
        )}
        {!task.isCompleted && (
          reminded ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3 h-3" /> Sent
            </span>
          ) : (
            <button
              type="button"
              onClick={handleRemind}
              disabled={reminding}
              className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] text-gray-500 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Mail className="w-3 h-3" /> {reminding ? "…" : "Reminder"}
            </button>
          )
        )}
        <div className="ml-auto flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────

function GroupSection({
  label, tasks, headerCls, borderCls,
  selectedIds, canBulkSelect, canComplete,
  onToggleSelect, onToggleSelectAll, onToggleComplete,
  onEdit, onDelete,
}: {
  label: string;
  tasks: TaskData[];
  headerCls: string;
  borderCls: string;
  selectedIds: Set<string>;
  canBulkSelect: boolean;
  canComplete: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[], select: boolean) => void;
  onToggleComplete: (task: TaskData) => void;
  onEdit?: (t: TaskData) => void;
  onDelete?: (t: TaskData) => void;
}) {
  if (tasks.length === 0) return null;

  const ids = tasks.map(t => t.id);
  const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
  const someSelected = ids.some(id => selectedIds.has(id));

  return (
    <div>
      {/* Group header */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-2 ${headerCls}`}>
        {canBulkSelect && (
          <label className="flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer -m-2 p-2">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
              onChange={() => onToggleSelectAll(ids, !allSelected)}
              className="w-3.5 h-3.5 rounded border-current text-primary focus:ring-primary cursor-pointer"
            />
          </label>
        )}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        <span className="text-xs opacity-70">({tasks.length})</span>
      </div>

      {/* Individual task cards */}
      <div className="space-y-3">
        {tasks.map(t => (
          <SwipeableRow
            key={t.id}
            actions={[
              ...(onDelete
                ? [{
                    icon: <Trash2 className="w-5 h-5" />,
                    label: "Delete",
                    colour: "bg-red-500",
                    onClick: () => onDelete(t),
                  }]
                : []),
            ]}
          >
            <TaskRow
              task={t}
              isSelected={selectedIds.has(t.id)}
              canBulkSelect={canBulkSelect}
              canComplete={canComplete}
              onToggleSelect={onToggleSelect}
              onToggleComplete={onToggleComplete}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </SwipeableRow>
        ))}
      </div>
    </div>
  );
}

// ── Filter data types ─────────────────────────────────────────────────────────

interface FilterUser     { id: string; name: string | null; email: string }
interface FilterCategory { id: string; name: string; isActive: boolean }
interface FilterSupplier { id: string; name: string }

// ── Main page client ──────────────────────────────────────────────────────────

export function TasksPageClient() {
  const router = useRouter();
  const { can: perms, isViewer, isRsvpManager } = usePermissions();
  const { refreshToken, triggerRefresh } = useRefresh();

  // Pull-to-refresh
  const { isPulling, pullDistance, isRefreshing, containerRef } = usePullToRefresh({
    onRefresh: () => router.refresh(),
  });

  const [tasks, setTasks]         = useState<TaskData[]>([]);
  const [users, setUsers]         = useState<FilterUser[]>([]);
  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [suppliers, setSuppliers] = useState<FilterSupplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<TaskData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskData | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [completedOpen, setCompletedOpen]   = useState(false);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchApi("/api/tasks")
      .then(r => {
        if (!r.ok) {
          setError("Failed to load tasks. Please refresh the page.");
          setLoading(false);
          return;
        }
        return r.json();
      })
      .then((data: TaskData[] | undefined) => {
        if (data) setTasks(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load tasks. Please refresh the page.");
        setLoading(false);
      });
  }, [refreshToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchApi("/api/users").then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {});
    fetchApi("/api/planning-categories").then(r => r.ok ? r.json() : []).then(setCategories).catch(() => {});
    fetchApi("/api/suppliers").then(r => r.ok ? r.json() : []).then(setSuppliers).catch(() => {});
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Toggle complete (single) ────────────────────────────────────────────────

  async function handleToggleComplete(task: TaskData) {
    if (!perms.completeTasks) return;
    const completing = !task.isCompleted;
    const now = new Date().toISOString();

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, isCompleted: completing, completedAt: completing ? now : null }
        : t
    ));

    const res = await fetch(`/api/tasks/${task.id}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: completing }),
    });

    if (!res.ok) {
      // Revert
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      showToast("Failed to update task", false);
      return;
    }

    const { task: updated, nextTask } = await res.json();
    setTasks(prev => {
      const next = prev.map(t => t.id === task.id ? updated : t);
      return nextTask ? [...next, nextTask] : next;
    });

    if (completing) {
      showToast("Task completed ✓");
    } else {
      showToast("Task marked incomplete");
    }
    triggerRefresh();
  }

  // ── Save (add / edit) ───────────────────────────────────────────────────────

  function handleSave(task: TaskData) {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = task;
        return next;
      }
      return [...prev, task];
    });
    setModalOpen(false);
    setEditing(null);
    showToast(editing ? "Task updated" : "Task added");
    triggerRefresh();
  }

  // ── Single delete ───────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/tasks/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setTasks(prev => prev.filter(t => t.id !== deleteTarget.id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      showToast("Task deleted");
    } else {
      showToast("Failed to delete", false);
    }
    setDeleteTarget(null);
  }

  // ── Bulk select ─────────────────────────────────────────────────────────────

  function handleToggleSelect(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }

  function handleToggleSelectAll(ids: string[], select: boolean) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      ids.forEach(id => select ? n.add(id) : n.delete(id));
      return n;
    });
  }

  // ── Bulk complete ───────────────────────────────────────────────────────────

  async function handleBulkComplete() {
    const ids = Array.from(selectedIds);
    const now = new Date().toISOString();

    // Optimistic: mark selected incomplete → complete
    setTasks(prev => prev.map(t =>
      ids.includes(t.id) && !t.isCompleted
        ? { ...t, isCompleted: true, completedAt: now }
        : t
    ));

    const responses = await Promise.all(
      ids.map(id =>
        fetch(`/api/tasks/${id}/complete`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: true }),
        })
      )
    );

    const nextTasks: TaskData[] = [];
    for (const res of responses) {
      if (res.ok) {
        const { nextTask } = await res.json();
        if (nextTask) nextTasks.push(nextTask);
      }
    }

    if (nextTasks.length > 0) {
      setTasks(prev => [...prev, ...nextTasks]);
    }

    setSelectedIds(new Set());
    showToast(`${ids.length} task${ids.length !== 1 ? "s" : ""} completed ✓`);
    triggerRefresh();
  }

  // ── Bulk delete ─────────────────────────────────────────────────────────────

  async function handleBulkDeleteConfirm() {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id =>
      fetch(`/api/tasks/${id}`, { method: "DELETE" })
    ));
    setTasks(prev => prev.filter(t => !ids.includes(t.id)));
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    showToast(`${ids.length} task${ids.length !== 1 ? "s" : ""} deleted`);
    triggerRefresh();
  }

  function openAdd()                { setEditing(null); setModalOpen(true); }
  function openEdit(task: TaskData) { setEditing(task); setModalOpen(true); }

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtersActive = !!(filterPriority || filterAssignee || filterCategory || filterSupplier);

  const filtered = tasks.filter(t => {
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterAssignee && t.assignedToId !== filterAssignee) return false;
    if (filterCategory && t.categoryId !== filterCategory) return false;
    if (filterSupplier && t.supplierId !== filterSupplier) return false;
    return true;
  });

  function clearFilters() {
    setFilterPriority(""); setFilterAssignee("");
    setFilterCategory(""); setFilterSupplier("");
  }

  // ── Group ───────────────────────────────────────────────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const overdue: TaskData[]     = [];
  const dueThisWeek: TaskData[] = [];
  const upcoming: TaskData[]    = [];
  const noDueDate: TaskData[]   = [];
  const completed: TaskData[]   = [];

  for (const t of filtered) {
    if (t.isCompleted) { completed.push(t); continue; }
    if (!t.dueDate)    { noDueDate.push(t); continue; }
    const d = new Date(t.dueDate);
    d.setHours(0, 0, 0, 0);
    if (d < today)         overdue.push(t);
    else if (d <= weekFromNow) dueThisWeek.push(t);
    else                   upcoming.push(t);
  }

  completed.sort((a, b) => {
    const da = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const db = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return db - da;
  });

  const completedVisible = showAllCompleted ? completed : completed.slice(0, 20);

  const editHandler   = perms.editTasks ? openEdit                              : undefined;
  const deleteHandler = perms.editTasks ? (t: TaskData) => setDeleteTarget(t) : undefined;
  const canBulkSelect = perms.completeTasks;
  const canComplete   = perms.completeTasks;

  const inputCls =
    "w-full sm:w-auto px-3 py-2 sm:py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white min-h-[44px] sm:min-h-0";

  const allTasksEmpty  = tasks.length === 0;
  const noGroupResults =
    overdue.length === 0 && dueThisWeek.length === 0 &&
    upcoming.length === 0 && noDueDate.length === 0 && completed.length === 0;

  const selCount = selectedIds.size;

  // Common props for GroupSection
  const groupProps = {
    selectedIds,
    canBulkSelect,
    canComplete,
    onToggleSelect: handleToggleSelect,
    onToggleSelectAll: handleToggleSelectAll,
    onToggleComplete: handleToggleComplete,
    onEdit: editHandler,
    onDelete: deleteHandler,
  };

  return (
    <div ref={containerRef} className="overflow-auto h-full relative">
      {/* Pull-to-refresh indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center py-2 z-10 bg-gray-50"
          style={{ transform: `translateY(${Math.min(pullDistance - 24, 0)}px)` }}
        >
          <RefreshCw className={`w-5 h-5 text-gray-400 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="ml-2 text-sm text-gray-500">
            {isRefreshing ? "Refreshing…" : pullDistance >= 64 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}

      <div className="max-w-3xl" style={{ paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }}>
      {/* ReadOnly banner */}
      {isViewer && (
        <ReadOnlyBanner message="You have view-only access to tasks." />
      )}
      {isRsvpManager && (
        <ReadOnlyBanner message="You can view and complete tasks but cannot add or edit them." />
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
        {perms.editTasks && (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add task
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="grid grid-cols-2 sm:flex sm:flex-row sm:flex-wrap gap-2 sm:items-center mb-4">
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={inputCls}>
          <option value="">All priorities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className={inputCls}>
          <option value="">All assignees</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
          ))}
        </select>

        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={inputCls}>
          <option value="">All categories</option>
          {categories.filter(c => c.isActive).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} className={inputCls}>
          <option value="">All suppliers</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="col-span-2 sm:col-span-1 text-xs text-gray-500 hover:text-gray-700 underline text-center sm:text-left self-center"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Task groups */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-16" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Empty: no tasks at all */}
          {allTasksEmpty && (
            <div className="py-16 text-center">
              <CheckSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600 mb-1">No tasks yet</p>
              <p className="text-sm text-gray-400 mb-4 max-w-xs mx-auto">
                Stay organised by adding tasks for everything you need to do before the big day.
              </p>
              {perms.editTasks && (
                <button
                  type="button"
                  onClick={openAdd}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add your first task
                </button>
              )}
            </div>
          )}

          {/* Empty: filters active but no results */}
          {!allTasksEmpty && noGroupResults && filtersActive && (
            <div className="py-16 text-center">
              <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600 mb-1">No tasks match your filters</p>
              <p className="text-sm text-gray-400 mb-4">Try adjusting or clearing your filters.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          <GroupSection label="Overdue"       tasks={overdue}      headerCls="text-red-700 bg-red-50"    borderCls="border-red-200"    {...groupProps} />
          <GroupSection label="Due this week" tasks={dueThisWeek}  headerCls="text-amber-700 bg-amber-50" borderCls="border-amber-200"  {...groupProps} />
          <GroupSection label="Upcoming"      tasks={upcoming}     headerCls="text-blue-700 bg-blue-50"  borderCls="border-blue-200"   {...groupProps} />
          <GroupSection label="No due date"   tasks={noDueDate}    headerCls="text-gray-600 bg-gray-50"  borderCls="border-gray-200"   {...groupProps} />

          {/* Completed (collapsible) */}
          {completed.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setCompletedOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-500 hover:text-gray-700 transition-colors min-h-[44px]"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${completedOpen ? "rotate-180" : ""}`} />
                Completed ({completed.length})
              </button>

              {completedOpen && (
                <div className="px-4 pb-3">
                  {completedVisible.map(t => (
                    <SwipeableRow
                      key={t.id}
                      actions={[
                        ...(canComplete
                          ? [{
                              icon: <Check className="w-5 h-5" />,
                              label: "Undo",
                              colour: "bg-green-500",
                              onClick: () => handleToggleComplete(t),
                            }]
                          : []),
                        ...(deleteHandler
                          ? [{
                              icon: <Trash2 className="w-5 h-5" />,
                              label: "Delete",
                              colour: "bg-red-500",
                              onClick: () => deleteHandler(t),
                            }]
                          : []),
                      ]}
                    >
                      <TaskRow
                        task={t}
                        isSelected={selectedIds.has(t.id)}
                        canBulkSelect={canBulkSelect}
                        canComplete={canComplete}
                        onToggleSelect={handleToggleSelect}
                        onToggleComplete={handleToggleComplete}
                        onEdit={editHandler}
                        onDelete={deleteHandler}
                      />
                    </SwipeableRow>
                  ))}
                  {!showAllCompleted && completed.length > 20 && (
                    <button
                      type="button"
                      onClick={() => setShowAllCompleted(true)}
                      className="mt-2 text-sm text-primary hover:underline"
                    >
                      Show all completed ({completed.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {selCount > 0 && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 flex items-center justify-center px-4 py-3 bg-white border-t border-gray-200 shadow-lg md:left-56" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-sm text-gray-600 font-medium mr-1">
              {selCount} selected
            </span>

            {perms.completeTasks && (
              <button
                type="button"
                onClick={handleBulkComplete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors min-h-[44px]"
              >
                <Check className="w-3.5 h-3.5" />
                Complete ({selCount})
              </button>
            )}

            {perms.editTasks && (
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors min-h-[44px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete ({selCount})
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Add / edit modal */}
      {modalOpen && perms.editTasks && (
        <TaskModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}

      {/* Single delete confirm */}
      {deleteTarget && (
        <ConfirmModal
          message={
            <span>
              Delete task <strong>{deleteTarget.title}</strong>? This cannot be undone.
            </span>
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Bulk delete confirm */}
      {bulkDeleteOpen && (
        <ConfirmModal
          message={
            <span>
              Delete <strong>{selCount} task{selCount !== 1 ? "s" : ""}</strong>? This cannot be undone.
            </span>
          }
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-16 right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}
      </div>
    </div>
  );
}

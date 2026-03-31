"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Edit2, Trash2, CheckSquare, ChevronDown, RefreshCw,
  Check, X, Search,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { usePermissions } from "@/hooks/usePermissions";
import { useRefresh } from "@/context/RefreshContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
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

function priorityDot(priority: TaskPriority) {
  const colour =
    priority === "HIGH"   ? "bg-red-500" :
    priority === "MEDIUM" ? "bg-amber-400" :
    "bg-gray-400";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${colour}`}
      title={priority.charAt(0) + priority.slice(1).toLowerCase()}
    />
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
  const notesPreview = task.notes
    ? (task.notes.length > 80 ? task.notes.slice(0, 80) + "…" : task.notes)
    : null;

  const metaParts: React.ReactNode[] = [];
  if (task.category) {
    metaParts.push(
      <span key="cat" className="flex items-center gap-1">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: task.category.colour }}
        />
        {task.category.name}
      </span>
    );
  }
  if (task.assignedTo) {
    metaParts.push(
      <span key="user">{task.assignedTo.name ?? task.assignedTo.email}</span>
    );
  }
  if (task.supplier) {
    metaParts.push(
      <Link
        key="supplier"
        href={`/suppliers/${task.supplier.id}`}
        className="text-primary hover:underline"
        onClick={e => e.stopPropagation()}
      >
        {task.supplier.name}
      </Link>
    );
  }

  const label = dueDateLabel(task.dueDate ?? null, task.isCompleted);
  const cls   = dueDateClass(task.dueDate ?? null, task.isCompleted);

  return (
    <div
      className={`flex items-start gap-2 py-3 border-b border-gray-100 last:border-0 transition-all duration-200 ${
        isSelected ? "bg-primary/5 -mx-4 px-4 rounded" : ""
      }`}
    >
      {/* Bulk select checkbox */}
      {canBulkSelect && (
        <label
          className="flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0 cursor-pointer -m-2 p-2"
          onClick={e => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(task.id)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          />
        </label>
      )}

      {/* Complete checkbox */}
      <button
        type="button"
        onClick={() => canComplete && onToggleComplete(task)}
        disabled={!canComplete}
        className={`shrink-0 group min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 p-2 ${
          canComplete ? "" : "cursor-not-allowed opacity-40"
        }`}
        title={
          !canComplete
            ? "You don't have permission to complete tasks"
            : task.isCompleted ? "Mark incomplete" : "Mark complete"
        }
      >
        {task.isCompleted ? (
          <div className="w-4 h-4 rounded border-2 border-primary bg-primary flex items-center justify-center transition-colors duration-200">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div className={`w-4 h-4 rounded border-2 border-gray-300 transition-colors duration-200 ${canComplete ? "group-hover:border-primary" : ""}`} />
        )}
      </button>

      {/* Priority dot */}
      <div className="mt-1 shrink-0">{priorityDot(task.priority)}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p
              className={`text-sm font-medium leading-tight transition-all duration-200 ${
                task.isCompleted ? "line-through text-gray-400" : "text-gray-900"
              }`}
            >
              {task.title}
            </p>
            {task.isRecurring && task.recurringInterval && (
              <span title={`Recurring ${INTERVAL_LABEL[task.recurringInterval]}`}>
                <RefreshCw className="w-3 h-3 shrink-0 text-gray-400" />
              </span>
            )}
          </div>
          {label && (
            <span className={`text-xs shrink-0 ${cls}`}>{label}</span>
          )}
        </div>

        {task.isCompleted && task.completedAt && (
          <p className="text-xs text-gray-400 mt-0.5">
            Completed {fmtDate(task.completedAt)}
          </p>
        )}

        {metaParts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs text-gray-500">
            {metaParts.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300 select-none">·</span>}
                {p}
              </span>
            ))}
          </div>
        )}

        {notesPreview && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{notesPreview}</p>
        )}
      </div>

      {/* Edit / Delete */}
      {(onEdit || onDelete) && (
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
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
    <div className={`bg-white rounded-xl border ${borderCls}`}>
      <div className="px-4 pt-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1 ${headerCls}`}>
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
      </div>
      <div className="px-4 pb-2">
        {tasks.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            isSelected={selectedIds.has(t.id)}
            canBulkSelect={canBulkSelect}
            canComplete={canComplete}
            onToggleSelect={onToggleSelect}
            onToggleComplete={onToggleComplete}
            onEdit={onEdit}
            onDelete={onDelete}
          />
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
    fetchApi("/api/task-categories").then(r => r.ok ? r.json() : []).then(setCategories).catch(() => {});
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
                    <TaskRow
                      key={t.id}
                      task={t}
                      isSelected={selectedIds.has(t.id)}
                      canBulkSelect={canBulkSelect}
                      canComplete={canComplete}
                      onToggleSelect={handleToggleSelect}
                      onToggleComplete={handleToggleComplete}
                      onEdit={editHandler}
                      onDelete={deleteHandler}
                    />
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
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center px-4 py-3 bg-white border-t border-gray-200 shadow-lg md:left-56" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
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

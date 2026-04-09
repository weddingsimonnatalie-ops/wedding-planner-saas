"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/fetch";
import { usePermissions } from "@/hooks/usePermissions";
import { useRefresh } from "@/context/RefreshContext";
import { SwipeableRow } from "@/components/ui/SwipeableRow";
import { PlannerItemModal } from "./PlannerItemModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import {
  Plus, Edit2, Trash2, MapPin, ChevronDown, CalendarDays,
  CheckSquare, Check, RotateCcw, Mail, RefreshCw,
} from "lucide-react";
import type { EventData, TaskData, TaskPriority } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(d: string | Date) {
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) +
    " at " +
    dt.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dueDateLabel(dueDate: string | null, isCompleted: boolean): string | null {
  if (!dueDate || isCompleted) return null;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? "s" : ""} overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return "Due " + new Date(dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dueDateCls(dueDate: string | null, isCompleted: boolean): string {
  if (!dueDate || isCompleted) return "text-gray-400";
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "text-red-600 font-medium";
  if (diff <= 1) return "text-amber-600 font-medium";
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
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}

// ── Event card ─────────────────────────────────────────────────────────────────

function EventCard({
  event,
  canComplete,
  onToggleComplete,
  onEdit,
  onDelete,
  dimmed = false,
}: {
  event: EventData;
  canComplete: boolean;
  onToggleComplete: (e: EventData) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  dimmed?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border border-blue-100 p-4 border-l-4 ${event.isCompleted ? "border-l-gray-300" : "border-l-blue-400"} ${dimmed ? "opacity-65" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Type label + category */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${event.isCompleted ? "text-gray-500 bg-gray-50 border-gray-200" : "text-blue-600 bg-blue-50 border-blue-100"}`}>
              <CalendarDays className="w-3 h-3" /> Event
            </span>
            {event.category && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium border"
                style={{ color: event.category.colour, borderColor: event.category.colour }}
              >
                {event.category.name}
              </span>
            )}
          </div>

          <p className={`text-sm font-semibold mb-1 ${event.isCompleted ? "line-through text-gray-400" : "text-gray-900"}`}>
            {event.title}
          </p>
          <p className="text-xs text-gray-500 font-medium mb-1">{fmtDateTime(event.date)}</p>

          {event.location && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">
              <MapPin className="w-3 h-3 shrink-0" />
              {event.location}
            </p>
          )}
          {event.supplier && (
            <p className="text-xs text-gray-400">
              Supplier:{" "}
              <Link href={`/suppliers/${event.supplier.id}`} className="text-primary hover:underline font-medium">
                {event.supplier.name}
              </Link>
            </p>
          )}
          {event.notes && (
            <p className="text-xs text-gray-400 line-clamp-2 mt-1">{event.notes}</p>
          )}
          {event.isCompleted && event.completedAt && (
            <p className="text-xs text-gray-400 mt-0.5">Completed {fmtDate(event.completedAt)}</p>
          )}
        </div>

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={onEdit}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
        {canComplete && !event.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(event)}
            className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <Check className="w-3 h-3" /> Mark as Done
          </button>
        )}
        {canComplete && event.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(event)}
            className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Mark not done
          </button>
        )}
      </div>
    </div>
  );
}

// ── Task card ──────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  canComplete,
  onToggleComplete,
  onEdit,
  onDelete,
  dimmed = false,
}: {
  task: TaskData;
  canComplete: boolean;
  onToggleComplete: (t: TaskData) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  dimmed?: boolean;
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

  const dueLabel = dueDateLabel(task.dueDate ?? null, task.isCompleted);
  const dueCls   = dueDateCls(task.dueDate ?? null, task.isCompleted);

  return (
    <div
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.()}
      onKeyDown={e => { if (onEdit && (e.key === "Enter" || e.key === " ")) onEdit(); }}
      className={`bg-white rounded-xl border border-gray-200 p-4 ${dimmed ? "opacity-65" : ""} ${onEdit ? "cursor-pointer" : ""}`}
    >
      {/* Top row: type label + priority + category + recurring */}
      <div className="flex items-center gap-2 flex-wrap mb-1" onClick={e => e.stopPropagation()}>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200">
          <CheckSquare className="w-3 h-3" /> Task
        </span>
        <PriorityBadge priority={task.priority} />
        {task.category && (
          <span className="flex items-center gap-1 text-xs font-medium text-gray-700">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.category.colour }} />
            {task.category.name}
          </span>
        )}
        {task.isRecurring && (
          <span title="Recurring"><RefreshCw className="w-3 h-3 text-gray-400" /></span>
        )}
      </div>

      {/* Title */}
      <p className={`text-sm font-semibold mb-0.5 ${task.isCompleted ? "line-through text-gray-400" : "text-gray-900"}`}>
        {task.title}
      </p>

      {/* Meta */}
      <p className={`text-xs ${dueCls}`} onClick={e => e.stopPropagation()}>
        {dueLabel}
        {task.assignedTo && (
          <span className="text-gray-500">{dueLabel ? " · " : ""}{task.assignedTo.name ?? task.assignedTo.email}</span>
        )}
        {task.supplier && (
          <>
            {(dueLabel || task.assignedTo) && <span className="text-gray-400"> · </span>}
            <Link href={`/suppliers/${task.supplier.id}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>
              {task.supplier.name}
            </Link>
          </>
        )}
      </p>
      {task.isCompleted && task.completedAt && (
        <p className="text-xs text-gray-400 mt-0.5">Completed {fmtDate(task.completedAt)}</p>
      )}
      {task.notes && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">{task.notes}</p>
      )}

      {/* Actions */}
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
              onClick={() => onEdit()}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete()}
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

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-2 ${cls}`}>
      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      <span className="text-xs opacity-70">({count})</span>
    </div>
  );
}

// ── Unified item types ─────────────────────────────────────────────────────────

type UnifiedItem =
  | { kind: "event"; data: EventData; sortDate: Date }
  | { kind: "task"; data: TaskData; sortDate: Date };

// ── Main component ─────────────────────────────────────────────────────────────

export function PlannerClient() {
  const { can: perms, isViewer, isRsvpManager } = usePermissions();
  const { refreshToken, triggerRefresh } = useRefresh();

  const [events, setEvents] = useState<EventData[]>([]);
  const [tasks, setTasks]   = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Modal state
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventData | null>(null);
  const [editingTask, setEditingTask]   = useState<TaskData | null>(null);

  // Delete state
  const [deleteEventId, setDeleteEventId]   = useState<string | null>(null);
  const [deleteTask, setDeleteTask]         = useState<TaskData | null>(null);

  const [pastOpen, setPastOpen] = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchApi("/api/appointments").then(r => r.ok ? r.json() : []),
      fetchApi("/api/tasks").then(r => r.ok ? r.json() : []),
    ])
      .then(([evts, tsks]) => {
        setEvents(evts);
        setTasks(tsks);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load. Please refresh the page.");
        setLoading(false);
      });
  }, [refreshToken]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  function handleEventSave(event: EventData) {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === event.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = event; return n; }
      return [...prev, event];
    });
    setModalOpen(false);
    setEditingEvent(null);
    showToast(editingEvent ? "Event updated" : "Event added");
    triggerRefresh();
  }

  async function handleEventDelete() {
    if (!deleteEventId) return;
    const res = await fetch(`/api/appointments/${deleteEventId}`, { method: "DELETE" });
    if (res.ok) {
      setEvents(prev => prev.filter(e => e.id !== deleteEventId));
      showToast("Event deleted");
      triggerRefresh();
    } else {
      showToast("Failed to delete", false);
    }
    setDeleteEventId(null);
  }

  async function handleEventToggleComplete(event: EventData) {
    if (!perms.completeTasks) return;
    const completing = !event.isCompleted;
    const now = new Date().toISOString();

    setEvents(prev => prev.map(e =>
      e.id === event.id ? { ...e, isCompleted: completing, completedAt: completing ? now : null } : e
    ));

    const res = await fetch(`/api/appointments/${event.id}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: completing }),
    });

    if (!res.ok) {
      setEvents(prev => prev.map(e => e.id === event.id ? event : e));
      showToast("Failed to update event", false);
      return;
    }

    const { appointment } = await res.json();
    setEvents(prev => prev.map(e => e.id === event.id ? appointment : e));

    showToast(completing ? "Event completed ✓" : "Event marked incomplete");
    triggerRefresh();
  }

  // ── Task handlers ──────────────────────────────────────────────────────────

  function handleTaskSave(task: TaskData) {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = task; return n; }
      return [...prev, task];
    });
    setModalOpen(false);
    setEditingTask(null);
    showToast(editingTask ? "Task updated" : "Task added");
    triggerRefresh();
  }

  async function handleTaskToggleComplete(task: TaskData) {
    if (!perms.completeTasks) return;
    const completing = !task.isCompleted;
    const now = new Date().toISOString();

    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, isCompleted: completing, completedAt: completing ? now : null } : t
    ));

    const res = await fetch(`/api/tasks/${task.id}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: completing }),
    });

    if (!res.ok) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      showToast("Failed to update task", false);
      return;
    }

    const { task: updated, nextTask } = await res.json();
    setTasks(prev => {
      const next = prev.map(t => t.id === task.id ? updated : t);
      return nextTask ? [...next, nextTask] : next;
    });

    showToast(completing ? "Task completed ✓" : "Task marked incomplete");
    triggerRefresh();
  }

  async function handleTaskDelete() {
    if (!deleteTask) return;
    const res = await fetch(`/api/tasks/${deleteTask.id}`, { method: "DELETE" });
    if (res.ok) {
      setTasks(prev => prev.filter(t => t.id !== deleteTask.id));
      showToast("Task deleted");
      triggerRefresh();
    } else {
      showToast("Failed to delete", false);
    }
    setDeleteTask(null);
  }

  // ── Open modals ────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingEvent(null);
    setEditingTask(null);
    setModalOpen(true);
  }

  function openEditEvent(event: EventData) {
    setEditingEvent(event);
    setEditingTask(null);
    setModalOpen(true);
  }

  function openEditTask(task: TaskData) {
    setEditingTask(task);
    setEditingEvent(null);
    setModalOpen(true);
  }

  // ── Determine modal type ───────────────────────────────────────────────────

  const modalType = editingTask ? "task" : "event";

  // ── Grouping ───────────────────────────────────────────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Overdue: tasks with a past due date, not completed
  const overdueTasks = tasks.filter(
    t => !t.isCompleted && t.dueDate && new Date(t.dueDate) < today
  );

  // Upcoming: future events (not completed) + future-due tasks (not completed), sorted chronologically
  const upcomingItems: UnifiedItem[] = [
    ...events
      .filter(e => !e.isCompleted && new Date(e.date) >= today)
      .map(e => ({ kind: "event" as const, data: e, sortDate: new Date(e.date) })),
    ...tasks
      .filter(t => !t.isCompleted && t.dueDate && new Date(t.dueDate) >= today)
      .map(t => ({ kind: "task" as const, data: t, sortDate: new Date(t.dueDate!) })),
  ].sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

  // No due date: tasks without a due date, not completed
  const noDueDateTasks = tasks.filter(t => !t.isCompleted && !t.dueDate);

  // Past & completed: past events + completed events + completed tasks (sorted by completedAt/date desc)
  const pastAndCompleted: UnifiedItem[] = [
    ...events
      .filter(e => e.isCompleted || new Date(e.date) < today)
      .map(e => ({
        kind: "event" as const,
        data: e,
        sortDate: e.completedAt ? new Date(e.completedAt) : new Date(e.date),
      })),
    ...tasks
      .filter(t => t.isCompleted)
      .map(t => ({
        kind: "task" as const,
        data: t,
        sortDate: t.completedAt ? new Date(t.completedAt) : new Date(t.updatedAt),
      })),
  ].sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());

  const isEmpty =
    overdueTasks.length === 0 &&
    upcomingItems.length === 0 &&
    noDueDateTasks.length === 0 &&
    pastAndCompleted.length === 0;

  const canAdd = perms.editAppointments || perms.editTasks;

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderEvent(event: EventData, dimmed = false) {
    return (
      <SwipeableRow
        key={`event-${event.id}`}
        actions={perms.editAppointments ? [{
          icon: <Trash2 className="w-5 h-5" />,
          label: "Delete",
          colour: "bg-red-500",
          onClick: () => setDeleteEventId(event.id),
        }] : []}
      >
        <EventCard
          event={event}
          dimmed={dimmed}
          canComplete={perms.completeTasks}
          onToggleComplete={handleEventToggleComplete}
          onEdit={perms.editAppointments ? () => openEditEvent(event) : undefined}
          onDelete={perms.editAppointments ? () => setDeleteEventId(event.id) : undefined}
        />
      </SwipeableRow>
    );
  }

  function renderTask(task: TaskData, dimmed = false) {
    return (
      <SwipeableRow
        key={`task-${task.id}`}
        actions={perms.editTasks ? [{
          icon: <Trash2 className="w-5 h-5" />,
          label: "Delete",
          colour: "bg-red-500",
          onClick: () => setDeleteTask(task),
        }] : []}
      >
        <TaskCard
          task={task}
          dimmed={dimmed}
          canComplete={perms.completeTasks}
          onToggleComplete={handleTaskToggleComplete}
          onEdit={perms.editTasks ? () => openEditTask(task) : undefined}
          onDelete={perms.editTasks ? () => setDeleteTask(task) : undefined}
        />
      </SwipeableRow>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Banners */}
      {isViewer && <ReadOnlyBanner message="You have view-only access." />}
      {isRsvpManager && <ReadOnlyBanner message="You can view and complete tasks but cannot add or edit items." />}

      {/* Add button */}
      {canAdd && (
        <div className="flex justify-end">
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-24" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && isEmpty && (
        <div className="py-20 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-200 mb-3">
            <CalendarDays className="w-8 h-8" />
            <CheckSquare className="w-8 h-8" />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">Nothing here yet</p>
          <p className="text-sm text-gray-400 mb-4">Add events and tasks to start planning.</p>
          {canAdd && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> Add your first item
            </button>
          )}
        </div>
      )}

      {/* ── Overdue ─────────────────────────────────────────────────────────── */}
      {!loading && overdueTasks.length > 0 && (
        <div>
          <SectionHeader label="Overdue" count={overdueTasks.length} cls="text-red-700 bg-red-50" />
          <div className="space-y-3">
            {overdueTasks.map(t => renderTask(t))}
          </div>
        </div>
      )}

      {/* ── Upcoming ────────────────────────────────────────────────────────── */}
      {!loading && upcomingItems.length > 0 && (
        <div>
          <SectionHeader label="Upcoming" count={upcomingItems.length} cls="text-blue-700 bg-blue-50" />
          <div className="space-y-3">
            {upcomingItems.map(item =>
              item.kind === "event"
                ? renderEvent(item.data)
                : renderTask(item.data)
            )}
          </div>
        </div>
      )}

      {/* ── No due date ─────────────────────────────────────────────────────── */}
      {!loading && noDueDateTasks.length > 0 && (
        <div>
          <SectionHeader label="No due date" count={noDueDateTasks.length} cls="text-gray-600 bg-gray-50" />
          <div className="space-y-3">
            {noDueDateTasks.map(t => renderTask(t))}
          </div>
        </div>
      )}

      {/* ── Past & completed ─────────────────────────────────────────────────── */}
      {!loading && pastAndCompleted.length > 0 && (
        <div>
          <button
            onClick={() => setPastOpen(o => !o)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${pastOpen ? "rotate-180" : ""}`} />
            Past &amp; completed ({pastAndCompleted.length})
          </button>

          {pastOpen && (
            <div className="space-y-3 mt-2">
              {pastAndCompleted.map(item =>
                item.kind === "event"
                  ? renderEvent(item.data, true)
                  : renderTask(item.data, true)
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <PlannerItemModal
          type={modalType}
          initialEvent={editingEvent}
          initialTask={editingTask}
          onEventSave={handleEventSave}
          onTaskSave={handleTaskSave}
          onClose={() => { setModalOpen(false); setEditingEvent(null); setEditingTask(null); }}
        />
      )}

      {/* ── Delete confirms ────────────────────────────────────────────────────── */}
      {deleteEventId && (
        <ConfirmModal
          message={
            <span>Delete this event? This cannot be undone.</span>
          }
          onConfirm={handleEventDelete}
          onCancel={() => setDeleteEventId(null)}
        />
      )}
      {deleteTask && (
        <ConfirmModal
          message={
            <span>Delete task <strong>{deleteTask.title}</strong>? This cannot be undone.</span>
          }
          onConfirm={handleTaskDelete}
          onCancel={() => setDeleteTask(null)}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${toast.ok ? "bg-green-600" : "bg-red-600"}`}
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

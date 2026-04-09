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

// ── Unified card design ─────────────────────────────────────────────────────────

const typeConfig = {
  event: {
    icon: CalendarDays,
    label: "Event",
    colour: "text-blue-600 bg-blue-50 border-blue-200",
    accent: "border-l-blue-400",
    accentDone: "border-l-gray-300",
  },
  task: {
    icon: CheckSquare,
    label: "Task",
    colour: "text-slate-600 bg-slate-50 border-slate-200",
    accent: "border-l-slate-300",
    accentDone: "border-l-gray-300",
  },
};

function TypeBadge({ type, isCompleted }: { type: "event" | "task"; isCompleted: boolean }) {
  const config = typeConfig[type];
  const Icon = config.icon;
  const cls = isCompleted
    ? "text-gray-400 bg-gray-50 border-gray-200"
    : config.colour;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function CategoryBadge({ name, colour }: { name: string; colour: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color: colour, borderColor: colour, backgroundColor: "transparent" }}
    >
      {name}
    </span>
  );
}

function MetaItem({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      {Icon && <Icon className="w-3 h-3 shrink-0 text-gray-400" />}
      {children}
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
  const config = typeConfig.event;
  const accentCls = event.isCompleted ? config.accentDone : config.accent;
  const borderCls = event.isCompleted ? "border-gray-200" : "border-gray-100";

  return (
    <div
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={onEdit}
      onKeyDown={e => { if (onEdit && (e.key === "Enter" || e.key === " ")) onEdit(); }}
      className={`group bg-white rounded-xl border border-l-[3px] p-4 transition-all duration-200 ${accentCls} ${borderCls} ${dimmed ? "opacity-60" : ""} ${onEdit ? "cursor-pointer hover:shadow-sm hover:border-gray-200" : ""}`}
    >
      {/* Badge row */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <TypeBadge type="event" isCompleted={event.isCompleted} />
        {event.category && <CategoryBadge name={event.category.name} colour={event.category.colour} />}
      </div>

      {/* Title */}
      <p className={`text-sm font-semibold mb-1.5 ${event.isCompleted ? "line-through text-gray-400" : "text-gray-900"}`}>
        {event.title}
      </p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <MetaItem>
          <span className="font-medium">{fmtDateTime(event.date)}</span>
        </MetaItem>
        {event.location && <MetaItem icon={MapPin}>{event.location}</MetaItem>}
        {event.supplier && (
          <MetaItem>
            <Link
              href={`/suppliers/${event.supplier.id}`}
              className="text-primary hover:underline font-medium"
              onClick={e => e.stopPropagation()}
            >
              {event.supplier.name}
            </Link>
          </MetaItem>
        )}
      </div>

      {/* Notes */}
      {event.notes && (
        <p className="text-xs text-gray-400 mt-2 line-clamp-1">{event.notes}</p>
      )}

      {/* Completion status */}
      {event.isCompleted && event.completedAt && (
        <p className="text-xs text-gray-400 mt-1.5">Completed {fmtDate(event.completedAt)}</p>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap" onClick={e => e.stopPropagation()}>
        {canComplete && !event.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(event)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Mark as Done
          </button>
        )}
        {canComplete && event.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(event)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Undo
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
  const dueCls = dueDateCls(task.dueDate ?? null, task.isCompleted);
  const isOverdue = !task.isCompleted && !!task.dueDate && new Date(task.dueDate) < new Date();

  // Determine accent and border styling
  const config = typeConfig.task;
  const accentCls = task.isCompleted
    ? config.accentDone
    : isOverdue
      ? "border-l-red-400"
      : config.accent;
  const borderCls = task.isCompleted || isOverdue ? "border-gray-200" : "border-gray-100";

  return (
    <div
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={onEdit}
      onKeyDown={e => { if (onEdit && (e.key === "Enter" || e.key === " ")) onEdit(); }}
      className={`group bg-white rounded-xl border border-l-[3px] p-4 transition-all duration-200 ${accentCls} ${borderCls} ${dimmed ? "opacity-60" : ""} ${onEdit ? "cursor-pointer hover:shadow-sm hover:border-gray-200" : ""}`}
    >
      {/* Badge row */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <TypeBadge type="task" isCompleted={task.isCompleted} />
        {task.category && <CategoryBadge name={task.category.name} colour={task.category.colour} />}
        <PriorityBadge priority={task.priority} />
        {task.isRecurring && (
          <span className="inline-flex items-center text-xs text-gray-400" title="Recurring">
            <RefreshCw className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Title */}
      <p className={`text-sm font-semibold mb-1.5 ${task.isCompleted ? "line-through text-gray-400" : "text-gray-900"}`}>
        {task.title}
      </p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {dueLabel && (
          <span className={`text-xs font-medium ${dueCls}`}>{dueLabel}</span>
        )}
        {task.assignedTo && (
          <MetaItem>
            {task.assignedTo.name ?? task.assignedTo.email}
          </MetaItem>
        )}
        {task.supplier && (
          <MetaItem>
            <Link
              href={`/suppliers/${task.supplier.id}`}
              className="text-primary hover:underline font-medium"
              onClick={e => e.stopPropagation()}
            >
              {task.supplier.name}
            </Link>
          </MetaItem>
        )}
      </div>

      {/* Completion status */}
      {task.isCompleted && task.completedAt && (
        <p className="text-xs text-gray-400 mt-1.5">Completed {fmtDate(task.completedAt)}</p>
      )}

      {/* Notes */}
      {task.notes && (
        <p className="text-xs text-gray-400 mt-2 line-clamp-1 italic">{task.notes}</p>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap" onClick={e => e.stopPropagation()}>
        {canComplete && !task.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(task)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Mark as Done
          </button>
        )}
        {canComplete && task.isCompleted && (
          <button
            type="button"
            onClick={() => onToggleComplete(task)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Undo
          </button>
        )}
        {!task.isCompleted && (
          reminded ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600 px-2 py-1">
              <Check className="w-3.5 h-3.5" /> Sent
            </span>
          ) : (
            <button
              type="button"
              onClick={handleRemind}
              disabled={reminding}
              className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 text-gray-500 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Mail className="w-3.5 h-3.5" /> {reminding ? "Sending…" : "Reminder"}
            </button>
          )
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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

const sectionStyles: Record<string, { text: string; bg: string; dot: string }> = {
  Overdue: { text: "text-red-700", bg: "bg-red-50", dot: "bg-red-400" },
  Upcoming: { text: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-400" },
  "No due date": { text: "text-gray-600", bg: "bg-gray-100", dot: "bg-gray-400" },
};

function SectionHeader({ label, count }: { label: string; count: number }) {
  const style = sectionStyles[label] ?? { text: "text-gray-600", bg: "bg-gray-100", dot: "bg-gray-400" };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 ${style.bg}`}>
      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
      <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>{label}</span>
      <span className={`text-xs ${style.text} opacity-70`}>({count})</span>
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
        <div className="py-16 text-center">
          <div className="w-24 h-16 mx-auto mb-4">
            <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
              <rect x="15" y="15" width="90" height="50" rx="4" className="fill-primary/5 stroke-primary/20" strokeWidth="1.5" />
              <rect x="25" y="28" width="40" height="4" rx="1" className="fill-primary/20" />
              <rect x="25" y="38" width="55" height="4" rx="1" className="fill-primary/15" />
              <rect x="25" y="48" width="30" height="4" rx="1" className="fill-primary/10" />
              <circle cx="85" cy="52" r="10" className="fill-primary/10 stroke-primary/20" strokeWidth="1.5" />
              <path d="M82 52l2 2 4-4" className="stroke-primary/40" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1 font-display">No items yet</h3>
          <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Add events and tasks to start planning your wedding.</p>
          {canAdd && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add your first item
            </button>
          )}
        </div>
      )}

      {/* ── Overdue ─────────────────────────────────────────────────────────── */}
      {!loading && overdueTasks.length > 0 && (
        <div>
          <SectionHeader label="Overdue" count={overdueTasks.length} />
          <div className="space-y-3">
            {overdueTasks.map(t => renderTask(t))}
          </div>
        </div>
      )}

      {/* ── Upcoming ────────────────────────────────────────────────────────── */}
      {!loading && upcomingItems.length > 0 && (
        <div>
          <SectionHeader label="Upcoming" count={upcomingItems.length} />
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
          <SectionHeader label="No due date" count={noDueDateTasks.length} />
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

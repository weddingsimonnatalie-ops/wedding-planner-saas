"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchApi } from "@/lib/fetch";
import { ModalShell } from "@/components/ui/ModalShell";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";
import { CalendarDays, CheckSquare } from "lucide-react";
import type { EventData, TaskData, PlannerItemType, TaskPriority, RecurringInterval } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const REMINDER_OPTIONS = [
  { label: "None", value: "" },
  { label: "1 day before", value: "1" },
  { label: "2 days before", value: "2" },
  { label: "3 days before", value: "3" },
  { label: "1 week before", value: "7" },
  { label: "2 weeks before", value: "14" },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  VIEWER: "Viewer",
  RSVP_MANAGER: "RSVP Manager",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDatetimeLocal(d: string | Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function toDateInput(d: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; colour: string; isActive?: boolean }
interface User { id: string; name: string | null; email: string; role: string }
interface Supplier { id: string; name: string }

interface Props {
  type: PlannerItemType;
  initialEvent?: EventData | null;
  initialTask?: TaskData | null;
  prefillSupplierId?: string;
  prefillSupplierName?: string;
  onEventSave?: (event: EventData) => void;
  onTaskSave?: (task: TaskData) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlannerItemModal({
  type: initialType,
  initialEvent,
  initialTask,
  prefillSupplierId,
  prefillSupplierName,
  onEventSave,
  onTaskSave,
  onClose,
}: Props) {
  const isEditing = !!(initialEvent || initialTask);
  const [itemType, setItemType] = useState<PlannerItemType>(
    initialEvent ? "event" : initialTask ? "task" : initialType
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Event form state ──────────────────────────────────────────────────────

  const [eventForm, setEventForm] = useState({
    title: initialEvent?.title ?? "",
    categoryId: initialEvent?.categoryId ?? "",
    date: toDatetimeLocal(initialEvent?.date ?? null),
    location: initialEvent?.location ?? "",
    notes: initialEvent?.notes ?? "",
    supplierId: initialEvent?.supplierId ?? prefillSupplierId ?? "",
    reminderDays: initialEvent?.reminderDays != null ? String(initialEvent.reminderDays) : "",
  });

  // ── Task form state ───────────────────────────────────────────────────────

  const [taskForm, setTaskForm] = useState({
    title: initialTask?.title ?? "",
    notes: initialTask?.notes ?? "",
    priority: (initialTask?.priority ?? "MEDIUM") as TaskPriority,
    dueDate: toDateInput(initialTask?.dueDate ?? null),
    categoryId: initialTask?.categoryId ?? "",
    assignedToId: initialTask?.assignedToId ?? "",
    supplierId: initialTask?.supplierId ?? prefillSupplierId ?? "",
    isRecurring: initialTask?.isRecurring ?? false,
    recurringInterval: (initialTask?.recurringInterval ?? "WEEKLY") as RecurringInterval,
    recurringEndDate: toDateInput(initialTask?.recurringEndDate ?? null),
  });

  // ── Dirty tracking ────────────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    if (itemType === "event") {
      return (
        eventForm.title !== (initialEvent?.title ?? "") ||
        eventForm.categoryId !== (initialEvent?.categoryId ?? "") ||
        eventForm.date !== toDatetimeLocal(initialEvent?.date ?? null) ||
        eventForm.location !== (initialEvent?.location ?? "") ||
        eventForm.notes !== (initialEvent?.notes ?? "") ||
        eventForm.supplierId !== (initialEvent?.supplierId ?? prefillSupplierId ?? "") ||
        eventForm.reminderDays !== (initialEvent?.reminderDays != null ? String(initialEvent.reminderDays) : "")
      );
    } else {
      return (
        taskForm.title !== (initialTask?.title ?? "") ||
        taskForm.notes !== (initialTask?.notes ?? "") ||
        taskForm.priority !== (initialTask?.priority ?? "MEDIUM") ||
        taskForm.dueDate !== toDateInput(initialTask?.dueDate ?? null) ||
        taskForm.categoryId !== (initialTask?.categoryId ?? "") ||
        taskForm.assignedToId !== (initialTask?.assignedToId ?? "") ||
        taskForm.supplierId !== (initialTask?.supplierId ?? prefillSupplierId ?? "") ||
        taskForm.isRecurring !== (initialTask?.isRecurring ?? false) ||
        taskForm.recurringInterval !== (initialTask?.recurringInterval ?? "WEEKLY") ||
        taskForm.recurringEndDate !== toDateInput(initialTask?.recurringEndDate ?? null)
      );
    }
  }, [eventForm, taskForm, initialEvent, initialTask, prefillSupplierId, itemType]);

  const formId = initialEvent
    ? `planner-event-${initialEvent.id}`
    : initialTask
    ? `planner-task-${initialTask.id}`
    : "planner-item-new";
  const formName = initialEvent
    ? `Event: ${initialEvent.title}`
    : initialTask
    ? `Task: ${initialTask.title}`
    : itemType === "event" ? "New Event" : "New Task";

  useFormDirtyRegistration(formId, formName, isDirty);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchApi("/api/planning-categories")
      .then(r => r.json())
      .then((data: Category[]) => {
        setCategories(data);
        if (!initialEvent && !eventForm.categoryId && data.length > 0) {
          setEventForm(f => ({ ...f, categoryId: data[0].id }));
        }
      })
      .catch(() => {});

    fetchApi("/api/users")
      .then(r => r.json())
      .then((data: User[]) => setUsers(data))
      .catch(() => {});

    fetchApi("/api/suppliers")
      .then(r => r.json())
      .then((data: Supplier[]) => setSuppliers(data))
      .catch(() => {});
  }, []);

  const filteredSuppliers = supplierFilter
    ? suppliers.filter(s => s.name.toLowerCase().includes(supplierFilter.toLowerCase()))
    : suppliers;

  const activeCategories = categories.filter(c => c.isActive !== false);

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (itemType === "event") {
      if (!eventForm.title.trim()) { setError("Title is required"); return; }
      if (!eventForm.date) { setError("Date and time are required"); return; }
      setSaving(true);

      const payload = {
        title: eventForm.title.trim(),
        categoryId: eventForm.categoryId || null,
        date: new Date(eventForm.date).toISOString(),
        location: eventForm.location || null,
        notes: eventForm.notes || null,
        supplierId: eventForm.supplierId || null,
        reminderDays: eventForm.reminderDays !== "" ? Number(eventForm.reminderDays) : null,
      };

      const url = initialEvent ? `/api/appointments/${initialEvent.id}` : "/api/appointments";
      const method = initialEvent ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      setSaving(false);

      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      onEventSave?.(data);
    } else {
      if (!taskForm.title.trim()) { setError("Title is required"); return; }
      setSaving(true);

      const payload = {
        title: taskForm.title.trim(),
        notes: taskForm.notes || null,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || null,
        categoryId: taskForm.categoryId || null,
        assignedToId: taskForm.assignedToId || null,
        supplierId: taskForm.supplierId || null,
        isRecurring: taskForm.isRecurring,
        recurringInterval: taskForm.isRecurring ? taskForm.recurringInterval : null,
        recurringEndDate: taskForm.isRecurring && taskForm.recurringEndDate ? taskForm.recurringEndDate : null,
      };

      const url = initialTask ? `/api/tasks/${initialTask.id}` : "/api/tasks";
      const method = initialTask ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      setSaving(false);

      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      onTaskSave?.(data);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";
  const isEvent = itemType === "event";

  const modalTitle = isEditing
    ? (isEvent ? "Edit event" : "Edit task")
    : (isEvent ? "Add event" : "Add task");

  const submitLabel = saving
    ? "Saving…"
    : isEditing
    ? "Save changes"
    : isEvent ? "Add event" : "Save task";

  return (
    <ModalShell
      title={modalTitle}
      onClose={onClose}
      formId="planner-item-form"
      submitLabel={submitLabel}
      submitDisabled={saving}
    >
      <form id="planner-item-form" onSubmit={handleSave} className="p-5 space-y-4">
        {/* Type toggle — new items only */}
        {!isEditing && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => { setItemType("event"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                isEvent ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Event
            </button>
            <button
              type="button"
              onClick={() => { setItemType("task"); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                !isEvent ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              Task
            </button>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            required
            autoFocus
            value={isEvent ? eventForm.title : taskForm.title}
            onChange={e =>
              isEvent
                ? setEventForm(f => ({ ...f, title: e.target.value }))
                : setTaskForm(f => ({ ...f, title: e.target.value }))
            }
            className={inputCls}
            placeholder={isEvent ? "e.g. Dress fitting at Bridal Boutique" : "e.g. Book flowers consultation"}
          />
        </div>

        {/* Category + [Event: Date&time | Task: Priority] */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={isEvent ? eventForm.categoryId : taskForm.categoryId}
              onChange={e =>
                isEvent
                  ? setEventForm(f => ({ ...f, categoryId: e.target.value }))
                  : setTaskForm(f => ({ ...f, categoryId: e.target.value }))
              }
              className={inputCls}
            >
              <option value="">— None —</option>
              {activeCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {isEvent ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; time *</label>
              <input
                type="datetime-local"
                required
                value={eventForm.date}
                onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
                className={inputCls}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={taskForm.priority}
                onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                className={inputCls}
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          )}
        </div>

        {/* Event only: Location */}
        {isEvent && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={eventForm.location}
              onChange={e => setEventForm(f => ({ ...f, location: e.target.value }))}
              className={inputCls}
              placeholder="Address or venue name"
            />
          </div>
        )}

        {/* Task only: Due date + Assigned to */}
        {!isEvent && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned to</label>
              <select
                value={taskForm.assignedToId}
                onChange={e => setTaskForm(f => ({ ...f, assignedToId: e.target.value }))}
                className={inputCls}
              >
                <option value="">— Unassigned —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email} ({ROLE_LABELS[u.role] ?? u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Event only: Email reminder */}
        {isEvent && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email reminder</label>
            <select
              value={eventForm.reminderDays}
              onChange={e => setEventForm(f => ({ ...f, reminderDays: e.target.value }))}
              className={inputCls}
            >
              {REMINDER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Linked supplier */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Linked supplier</label>
          {!isEvent && prefillSupplierId ? (
            <p className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-gray-50">
              {prefillSupplierName ?? suppliers.find(s => s.id === prefillSupplierId)?.name ?? "…"}
            </p>
          ) : (
            <>
              {suppliers.length > 5 && (
                <input
                  type="text"
                  value={supplierFilter}
                  onChange={e => setSupplierFilter(e.target.value)}
                  className={inputCls + " mb-1"}
                  placeholder={isEvent ? "Filter suppliers…" : "Search suppliers…"}
                />
              )}
              <select
                value={isEvent ? eventForm.supplierId : taskForm.supplierId}
                onChange={e =>
                  isEvent
                    ? setEventForm(f => ({ ...f, supplierId: e.target.value }))
                    : setTaskForm(f => ({ ...f, supplierId: e.target.value }))
                }
                className={inputCls}
              >
                <option value="">— None —</option>
                {filteredSuppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={isEvent ? eventForm.notes : taskForm.notes}
            onChange={e =>
              isEvent
                ? setEventForm(f => ({ ...f, notes: e.target.value }))
                : setTaskForm(f => ({ ...f, notes: e.target.value }))
            }
            rows={3}
            className={inputCls}
            placeholder="Any additional details…"
          />
        </div>

        {/* Task only: Recurring section */}
        {!isEvent && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taskForm.isRecurring}
                onChange={e => setTaskForm(f => ({ ...f, isRecurring: e.target.checked }))}
                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
              />
              <span className="text-sm font-medium text-gray-700">Repeat this task</span>
            </label>

            {taskForm.isRecurring && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-6">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Repeat every</label>
                  <select
                    value={taskForm.recurringInterval}
                    onChange={e => setTaskForm(f => ({ ...f, recurringInterval: e.target.value as RecurringInterval }))}
                    className={inputCls}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="FORTNIGHTLY">Fortnightly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End date (optional)</label>
                  <input
                    type="date"
                    value={taskForm.recurringEndDate}
                    onChange={e => setTaskForm(f => ({ ...f, recurringEndDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </form>
    </ModalShell>
  );
}

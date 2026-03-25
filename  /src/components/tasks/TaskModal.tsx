"use client";

import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type RecurringInterval = "DAILY" | "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";

export interface TaskCategory {
  id: string;
  name: string;
  colour: string;
  isActive: boolean;
}

export interface TaskUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface TaskSupplier {
  id: string;
  name: string;
}

export interface TaskData {
  id: string;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  categoryId: string | null;
  category: TaskCategory | null;
  assignedToId: string | null;
  assignedTo: TaskUser | null;
  supplierId: string | null;
  supplier: TaskSupplier | null;
  isRecurring: boolean;
  recurringInterval: RecurringInterval | null;
  recurringEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateInput(d: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  VIEWER: "Viewer",
  RSVP_MANAGER: "RSVP Manager",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  initial?: TaskData | null;
  prefillSupplierId?: string;
  prefillSupplierName?: string;
  onSave: (task: TaskData) => void;
  onClose: () => void;
}

export function TaskModal({ initial, prefillSupplierId, prefillSupplierName, onSave, onClose }: Props) {
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [suppliers, setSuppliers] = useState<TaskSupplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: initial?.title ?? "",
    notes: initial?.notes ?? "",
    priority: initial?.priority ?? ("MEDIUM" as TaskPriority),
    dueDate: toDateInput(initial?.dueDate ?? null),
    categoryId: initial?.categoryId ?? "",
    assignedToId: initial?.assignedToId ?? "",
    supplierId: initial?.supplierId ?? prefillSupplierId ?? "",
    isRecurring: initial?.isRecurring ?? false,
    recurringInterval: initial?.recurringInterval ?? ("WEEKLY" as RecurringInterval),
    recurringEndDate: toDateInput(initial?.recurringEndDate ?? null),
  });

  // ── Track dirty state for inactivity warning ───────────────────────────────
  const isDirty = useMemo(() => {
    const initialTitle = initial?.title ?? "";
    const initialNotes = initial?.notes ?? "";
    const initialPriority = initial?.priority ?? "MEDIUM";
    const initialDueDate = toDateInput(initial?.dueDate ?? null);
    const initialCategoryId = initial?.categoryId ?? "";
    const initialAssignedToId = initial?.assignedToId ?? "";
    const initialSupplierId = initial?.supplierId ?? prefillSupplierId ?? "";
    const initialIsRecurring = initial?.isRecurring ?? false;
    const initialRecurringInterval = initial?.recurringInterval ?? "WEEKLY";
    const initialRecurringEndDate = toDateInput(initial?.recurringEndDate ?? null);

    return (
      form.title !== initialTitle ||
      form.notes !== initialNotes ||
      form.priority !== initialPriority ||
      form.dueDate !== initialDueDate ||
      form.categoryId !== initialCategoryId ||
      form.assignedToId !== initialAssignedToId ||
      form.supplierId !== initialSupplierId ||
      form.isRecurring !== initialIsRecurring ||
      form.recurringInterval !== initialRecurringInterval ||
      form.recurringEndDate !== initialRecurringEndDate
    );
  }, [form, initial, prefillSupplierId]);

  const formId = initial ? `task-${initial.id}` : "task-new";
  const formName = initial ? `Task: ${initial.title}` : "New Task";
  useFormDirtyRegistration(formId, formName, isDirty);

  useEffect(() => {
    fetchApi("/api/task-categories")
      .then(r => r.json())
      .then((data: TaskCategory[]) => setCategories(data.filter(c => c.isActive)))
      .catch(() => {});

    fetchApi("/api/users")
      .then(r => r.json())
      .then((data: TaskUser[]) => setUsers(data))
      .catch(() => {});

    fetchApi("/api/suppliers")
      .then(r => r.json())
      .then((data: TaskSupplier[]) => setSuppliers(data))
      .catch(() => {});
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredSuppliers = supplierFilter
    ? suppliers.filter(s => s.name.toLowerCase().includes(supplierFilter.toLowerCase()))
    : suppliers;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setError("");
    setSaving(true);

    const payload = {
      title: form.title.trim(),
      notes: form.notes || null,
      priority: form.priority,
      dueDate: form.dueDate || null,
      categoryId: form.categoryId || null,
      assignedToId: form.assignedToId || null,
      supplierId: form.supplierId || null,
      isRecurring: form.isRecurring,
      recurringInterval: form.isRecurring ? form.recurringInterval : null,
      recurringEndDate: form.isRecurring && form.recurringEndDate ? form.recurringEndDate : null,
    };

    const url = initial ? `/api/tasks/${initial.id}` : "/api/tasks";
    const method = initial ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
    onSave(data);
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {initial ? "Edit task" : "Add task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              required
              autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Book flowers consultation"
            />
          </div>

          {/* Category + Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className={inputCls}
              >
                <option value="">— None —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                className={inputCls}
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {/* Due date + Assigned to */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned to</label>
              <select
                value={form.assignedToId}
                onChange={e => setForm(f => ({ ...f, assignedToId: e.target.value }))}
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

          {/* Linked supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Linked supplier</label>
            {prefillSupplierId ? (
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
                    placeholder="Search suppliers…"
                  />
                )}
                <select
                  value={form.supplierId}
                  onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
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
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className={inputCls}
              placeholder="Any additional details…"
            />
          </div>

          {/* Recurring */}
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))}
                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
              />
              <span className="text-sm font-medium text-gray-700">Repeat this task</span>
            </label>

            {form.isRecurring && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-6">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Repeat every</label>
                  <select
                    value={form.recurringInterval}
                    onChange={e => setForm(f => ({ ...f, recurringInterval: e.target.value as RecurringInterval }))}
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
                    value={form.recurringEndDate}
                    onChange={e => setForm(f => ({ ...f, recurringEndDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : initial ? "Save changes" : "Save task"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

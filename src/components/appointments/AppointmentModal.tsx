"use client";

import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";

// ── Shared constants ──────────────────────────────────────────────────────────

export const REMINDER_OPTIONS = [
  { label: "None", value: "" },
  { label: "1 day before", value: "1" },
  { label: "2 days before", value: "2" },
  { label: "3 days before", value: "3" },
  { label: "1 week before", value: "7" },
  { label: "2 weeks before", value: "14" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppointmentCategory {
  id: string;
  name: string;
  colour: string;
}

export interface AppointmentData {
  id: string;
  title: string;
  categoryId: string | null;
  category: AppointmentCategory | null;
  date: string;
  location: string | null;
  notes: string | null;
  supplierId: string | null;
  reminderDays: number | null;
  supplier: { id: string; name: string } | null;
}

interface Supplier { id: string; name: string }

interface Props {
  initial?: AppointmentData | null;
  prefillSupplierId?: string;
  onSave: (appt: AppointmentData) => void;
  onClose: () => void;
}

// Format a Date for datetime-local input: YYYY-MM-DDTHH:mm
function toDatetimeLocal(d: string | Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function AppointmentModal({ initial, prefillSupplierId, onSave, onClose }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [apptCategories, setApptCategories] = useState<AppointmentCategory[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: initial?.title ?? "",
    categoryId: initial?.categoryId ?? "",
    date: toDatetimeLocal(initial?.date ?? null),
    location: initial?.location ?? "",
    notes: initial?.notes ?? "",
    supplierId: initial?.supplierId ?? prefillSupplierId ?? "",
    reminderDays: initial?.reminderDays != null ? String(initial.reminderDays) : "",
  });

  // ── Track dirty state for inactivity warning ───────────────────────────────
  const isDirty = useMemo(() => {
    const initialTitle = initial?.title ?? "";
    const initialCategoryId = initial?.categoryId ?? "";
    const initialDate = toDatetimeLocal(initial?.date ?? null);
    const initialLocation = initial?.location ?? "";
    const initialNotes = initial?.notes ?? "";
    const initialSupplierId = initial?.supplierId ?? prefillSupplierId ?? "";
    const initialReminderDays = initial?.reminderDays != null ? String(initial.reminderDays) : "";

    return (
      form.title !== initialTitle ||
      form.categoryId !== initialCategoryId ||
      form.date !== initialDate ||
      form.location !== initialLocation ||
      form.notes !== initialNotes ||
      form.supplierId !== initialSupplierId ||
      form.reminderDays !== initialReminderDays
    );
  }, [form, initial, prefillSupplierId]);

  const formId = initial ? `appointment-${initial.id}` : "appointment-new";
  const formName = initial ? `Appointment: ${initial.title}` : "New Appointment";
  useFormDirtyRegistration(formId, formName, isDirty);

  useEffect(() => {
    fetchApi("/api/suppliers")
      .then(r => r.json())
      .then((data: Supplier[]) => setSuppliers(data))
      .catch(() => {});

    fetchApi("/api/appointment-categories")
      .then(r => r.json())
      .then((data: AppointmentCategory[]) => {
        setApptCategories(data);
        // If creating new appointment and no category yet, prefill with first
        if (!initial && !form.categoryId && data.length > 0) {
          setForm(f => ({ ...f, categoryId: data[0].id }));
        }
      })
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
    if (!form.date) { setError("Date and time are required"); return; }
    setError("");
    setSaving(true);

    const payload = {
      title: form.title,
      categoryId: form.categoryId || null,
      date: new Date(form.date).toISOString(),
      location: form.location || null,
      notes: form.notes || null,
      supplierId: form.supplierId || null,
      reminderDays: form.reminderDays !== "" ? Number(form.reminderDays) : null,
    };

    const url = initial ? `/api/appointments/${initial.id}` : "/api/appointments";
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
            {initial ? "Edit appointment" : "Add appointment"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
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
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Dress fitting at Bridal Boutique"
              autoFocus
            />
          </div>

          {/* Category + Date & time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className={inputCls}
              >
                <option value="">— None —</option>
                {apptCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; time *</label>
              <input
                type="datetime-local"
                required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {/* Location + Supplier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className={inputCls}
                placeholder="Address or venue name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Linked supplier</label>
              {suppliers.length > 5 && (
                <input
                  type="text"
                  value={supplierFilter}
                  onChange={e => setSupplierFilter(e.target.value)}
                  className={inputCls + " mb-1"}
                  placeholder="Filter suppliers…"
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
            </div>
          </div>

          {/* Reminder */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email reminder</label>
            <select
              value={form.reminderDays}
              onChange={e => setForm(f => ({ ...f, reminderDays: e.target.value }))}
              className={inputCls}
            >
              {REMINDER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
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
              {saving ? "Saving…" : initial ? "Save changes" : "Add appointment"}
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

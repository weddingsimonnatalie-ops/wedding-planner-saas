"use client";

import { useState, useEffect } from "react";
import { fetchApi } from "@/lib/fetch";
import { ModalShell } from "@/components/ui/ModalShell";

interface TimelineEvent {
  id: string;
  startTime: string;
  durationMins: number;
  title: string;
  location: string | null;
  notes: string | null;
  categoryId: string | null;
  category: { id: string; name: string; colour: string } | null;
  supplierId?: string | null;
  supplier: { id: string; name: string } | null;
}

interface TimelineEventModalProps {
  event: TimelineEvent | null;
  onClose: () => void;
  onSave: () => void;
}

interface Supplier {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  colour: string;
  isActive: boolean;
}

const DURATION_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
];

export function TimelineEventModal({ event, onClose, onSave }: TimelineEventModalProps) {
  const isEditing = !!event;
  const [title, setTitle] = useState(event?.title ?? "");
  const [startTime, setStartTime] = useState("");
  const [durationMins, setDurationMins] = useState(event?.durationMins ?? 30);
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [categoryId, setCategoryId] = useState(event?.categoryId ?? "");
  const [supplierId, setSupplierId] = useState(event?.supplierId ?? "");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [suppliersRes, categoriesRes] = await Promise.all([
          fetchApi("/api/suppliers"),
          fetchApi("/api/timeline-categories"),
        ]);

        if (suppliersRes.ok) {
          const data = await suppliersRes.json();
          setSuppliers((data.suppliers || data || []).map((s: Supplier) => ({ id: s.id, name: s.name })));
        }

        if (categoriesRes.ok) {
          const data = await categoriesRes.json();
          setCategories((data || []).filter((c: Category) => c.isActive));
        }
      } catch {
        // Ignore
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (event?.startTime) {
      const date = new Date(event.startTime);
      const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      setStartTime(localDateTime.toISOString().slice(0, 16));
    }
  }, [event]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!startTime) {
      setError("Start time is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = isEditing ? `/api/timeline/${event.id}` : "/api/timeline";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startTime: new Date(startTime).toISOString(),
          durationMins,
          location: location.trim() || null,
          notes: notes.trim() || null,
          categoryId: categoryId || null,
          supplierId: supplierId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save event");
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";

  return (
    <ModalShell
      title={isEditing ? "Edit event" : "Add event"}
      onClose={onClose}
      formId="timeline-event-modal-form"
      submitLabel={loading ? "Saving…" : isEditing ? "Save changes" : "Add event"}
      submitDisabled={loading}
    >
      <form id="timeline-event-modal-form" onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="e.g. Hair & Makeup"
          />
        </div>

        {/* Start time + Duration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
            <select
              value={durationMins}
              onChange={(e) => setDurationMins(Number(e.target.value))}
              className={inputCls}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputCls}
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputCls}
            placeholder="e.g. Bridal Suite"
          />
        </div>

        {/* Vendor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor <span className="text-gray-400 font-normal">(optional)</span></label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={inputCls}
          >
            <option value="">— None —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="Additional details…"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </form>
    </ModalShell>
  );
}

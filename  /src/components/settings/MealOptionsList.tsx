"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

interface MealOption {
  id: string;
  name: string;
  description: string | null;
  course: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  initialOptions: MealOption[];
  mealCounts: Record<string, number>;
}

const emptyOption = { name: "", description: "", course: "", isActive: true, sortOrder: 0 };

export function MealOptionsList({ initialOptions, mealCounts }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [options, setOptions] = useState(initialOptions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<typeof emptyOption>(emptyOption);
  const [showAdd, setShowAdd] = useState(false);
  const [newData, setNewData] = useState<typeof emptyOption>(emptyOption);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleAdd() {
    setError("");
    if (!newData.name.trim()) { setError("Name is required"); return; }
    const res = await fetch("/api/meal-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newData, sortOrder: options.length }),
    });
    if (res.ok) {
      const created = await res.json();
      setOptions([...options, created]);
      setShowAdd(false);
      setNewData(emptyOption);
      showToast("Meal option added");
      startTransition(() => router.refresh());
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to add");
    }
  }

  async function handleUpdate(id: string) {
    setError("");
    if (!editData.name.trim()) { setError("Name is required"); return; }
    const res = await fetch(`/api/meal-options/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    if (res.ok) {
      const updated = await res.json();
      setOptions(options.map((o) => (o.id === id ? updated : o)));
      setEditingId(null);
      showToast("Saved");
      startTransition(() => router.refresh());
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    const res = await fetch(`/api/meal-options/${id}`, { method: "DELETE" });
    if (res.ok) {
      setOptions(options.filter((o) => o.id !== id));
      showToast("Deleted");
      startTransition(() => router.refresh());
    }
  }

  return (
    <div>
      {options.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 mb-3">No meal options yet.</p>
      )}

      <div className="space-y-2 mb-3">
        {options.map((opt) =>
          editingId === opt.id ? (
            <div key={opt.id} className="border border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5">
              <OptionFields data={editData} onChange={setEditData} />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => handleUpdate(opt.id)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium">
                  <Check className="w-3 h-3" /> Save
                </button>
                <button onClick={() => { setEditingId(null); setError(""); }} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600">
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={opt.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${opt.isActive ? "text-gray-900" : "text-gray-400 line-through"}`}>
                    {opt.name}
                  </span>
                  {opt.course && <span className="text-xs text-gray-400">({opt.course})</span>}
                  {!opt.isActive && <span className="text-xs text-gray-400 italic">inactive</span>}
                </div>
                {opt.description && <p className="text-xs text-gray-400">{opt.description}</p>}
              </div>
              {mealCounts[opt.id] !== undefined && (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {mealCounts[opt.id]} confirmed
                </span>
              )}
              <button
                onClick={() => { setEditingId(opt.id); setEditData({ name: opt.name, description: opt.description ?? "", course: opt.course ?? "", isActive: opt.isActive, sortOrder: opt.sortOrder }); setError(""); }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(opt.id, opt.name)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        )}
      </div>

      {showAdd && (
        <div className="border border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5 mb-3">
          <OptionFields data={newData} onChange={setNewData} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium">
              <Check className="w-3 h-3" /> Add
            </button>
            <button onClick={() => { setShowAdd(false); setError(""); setNewData(emptyOption); }} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <button
          onClick={() => { setShowAdd(true); setError(""); }}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add meal option
        </button>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2.5 rounded-lg text-sm text-white bg-green-600 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function OptionFields({
  data,
  onChange,
}: {
  data: { name: string; description: string; course: string; isActive: boolean; sortOrder: number };
  onChange: (d: typeof data) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
        <input
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g. Chicken"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Course</label>
        <input
          value={data.course}
          onChange={(e) => onChange({ ...data, course: e.target.value })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Main"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <input
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Optional"
        />
      </div>
      <div className="col-span-3 flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={data.isActive}
            onChange={(e) => onChange({ ...data, isActive: e.target.checked })}
            className="w-3.5 h-3.5 rounded"
          />
          <span className="text-xs text-gray-600">Active (shown on RSVP forms)</span>
        </label>
      </div>
    </div>
  );
}

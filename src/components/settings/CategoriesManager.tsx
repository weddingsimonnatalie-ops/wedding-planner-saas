"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useWedding } from "@/context/WeddingContext";

const PRESET_COLOURS = [
  "#64748b", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#a855f7", "#ec4899",
];

interface Category {
  id: string;
  name: string;
  colour: string;
  sortOrder: number;
  isActive: boolean;
  allocatedAmount?: number | null;
}

interface Props {
  entityType: "planning" | "timeline";
  apiBase: string;
}

export function CategoriesManager({ entityType, apiBase }: Props) {
  const { currencySymbol } = useWedding();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Per-row edit state
  const [editName, setEditName] = useState<Record<string, string>>({});
  const [editColour, setEditColour] = useState<Record<string, string>>({});
  const [editAllocated, setEditAllocated] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState("#6366f1");
  const [newAllocated, setNewAllocated] = useState("");
  const [adding, setAdding] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; count: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const entityLabel = entityType === "timeline" ? "event" : "item";

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetchApi(apiBase)
      .then(async r => {
        if (!r.ok) {
          setError("Failed to load categories. Please refresh the page.");
          setLoading(false);
          return;
        }
        const data = await r.json();
        setCategories(data);
        const names: Record<string, string> = {};
        const colours: Record<string, string> = {};
        const allocated: Record<string, string> = {};
        data.forEach((c: Category) => {
          names[c.id] = c.name;
          colours[c.id] = c.colour;
          allocated[c.id] = c.allocatedAmount != null ? String(c.allocatedAmount) : "";
        });
        setEditName(names);
        setEditColour(colours);
        setEditAllocated(allocated);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load categories. Please refresh the page.");
        setLoading(false);
      });
  }, [apiBase]);

  async function handleSaveRow(id: string) {
    setSaving(s => ({ ...s, [id]: true }));
    const body: Record<string, unknown> = { name: editName[id], colour: editColour[id] };
    if (entityType === "planning") {
      body.allocatedAmount = editAllocated[id] === "" ? null : parseFloat(editAllocated[id]) || null;
    }
    const res = await fetch(`${apiBase}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(s => ({ ...s, [id]: false }));
    if (res.ok) {
      const updated = await res.json();
      setCategories(prev => prev.map(c => c.id === id ? updated : c));
      showToast("Saved");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Failed to save", false);
    }
  }

  async function handleToggleActive(cat: Category) {
    const res = await fetch(`${apiBase}/${cat.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !cat.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCategories(prev => prev.map(c => c.id === cat.id ? updated : c));
      showToast(updated.isActive ? "Category enabled" : "Category disabled");
    } else {
      showToast("Failed to update", false);
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const idx = categories.findIndex(c => c.id === id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === categories.length - 1) return;

    const newCats = [...categories];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newCats[idx], newCats[swapIdx]] = [newCats[swapIdx], newCats[idx]];
    setCategories(newCats);

    const res = await fetch(`${apiBase}/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: newCats.map(c => c.id) }),
    });
    if (!res.ok) {
      // Revert optimistic update on failure
      setCategories(categories);
      showToast("Failed to reorder", false);
    }
  }

  async function handleDeleteClick(cat: Category) {
    // Check usage count
    const res = await fetch(`${apiBase}/${cat.id}`, { method: "DELETE" });
    if (res.status === 409) {
      const d = await res.json();
      setDeleteTarget({ id: cat.id, name: cat.name, count: d.count });
    } else if (res.ok) {
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      showToast("Category deleted");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Failed to delete", false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`${apiBase}/${deleteTarget.id}?force=true`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      setCategories(prev => prev.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("Category deleted");
    } else {
      const d = await res.json();
      setDeleteTarget(null);
      showToast(d.error ?? "Failed to delete", false);
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const body: Record<string, unknown> = { name: newName.trim(), colour: newColour };
    if (entityType === "planning") {
      body.allocatedAmount = newAllocated === "" ? null : parseFloat(newAllocated) || null;
    }
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setAdding(false);
    if (res.ok) {
      const created = await res.json();
      setCategories(prev => [...prev, created]);
      setEditName(n => ({ ...n, [created.id]: created.name }));
      setEditColour(c => ({ ...c, [created.id]: created.colour }));
      setEditAllocated(a => ({ ...a, [created.id]: created.allocatedAmount != null ? String(created.allocatedAmount) : "" }));
      setNewName("");
      setNewColour("#6366f1");
      setNewAllocated("");
      setShowAdd(false);
      showToast("Category added");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Failed to add", false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {categories.map((cat, idx) => {
          const isDirty =
            editName[cat.id] !== cat.name ||
            editColour[cat.id] !== cat.colour ||
            (entityType === "planning" && (editAllocated[cat.id] ?? "") !== (cat.allocatedAmount != null ? String(cat.allocatedAmount) : ""));

          return (
            <div key={cat.id} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
              {/* Up/Down arrows */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleMove(cat.id, "up")}
                  disabled={idx === 0}
                  className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleMove(cat.id, "down")}
                  disabled={idx === categories.length - 1}
                  className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Colour swatch */}
              <div className="relative">
                <div
                  className="w-6 h-6 rounded-full border-2 border-white shadow cursor-pointer ring-1 ring-gray-200"
                  style={{ backgroundColor: editColour[cat.id] ?? cat.colour }}
                  title="Click to change colour"
                />
                <input
                  type="color"
                  value={editColour[cat.id] ?? cat.colour}
                  onChange={e => setEditColour(c => ({ ...c, [cat.id]: e.target.value }))}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>

              {/* Colour presets (inline) */}
              <div className="hidden sm:flex gap-1 flex-shrink-0">
                {PRESET_COLOURS.map(c => (
                  <button
                    key={c}
                    onClick={() => setEditColour(ec => ({ ...ec, [cat.id]: c }))}
                    className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
                      (editColour[cat.id] ?? cat.colour) === c
                        ? "border-gray-600 scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>

              {/* Name input */}
              <input
                value={editName[cat.id] ?? cat.name}
                onChange={e => setEditName(n => ({ ...n, [cat.id]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && isDirty && handleSaveRow(cat.id)}
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />

              {/* Row 2 on mobile: budget + active + save + delete */}
              <div className="flex items-center gap-2 w-full sm:w-auto order-last sm:order-none">
                {entityType === "planning" && (
                  <div className="flex items-center gap-1 flex-1 sm:flex-none">
                    <span className="text-xs text-gray-400">{currencySymbol}</span>
                    <input
                      type="number"
                      value={editAllocated[cat.id] ?? ""}
                      onChange={e => setEditAllocated(a => ({ ...a, [cat.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && isDirty && handleSaveRow(cat.id)}
                      placeholder="Budget"
                      className="flex-1 sm:flex-none px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      style={{ minWidth: '4rem', width: `${Math.max(4, (editAllocated[cat.id] ?? "").length) + 3}ch` }}
                    />
                  </div>
                )}

                {/* Active toggle */}
                <button
                  onClick={() => handleToggleActive(cat)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                    cat.isActive
                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                      : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                  }`}
                  title={cat.isActive ? "Click to disable" : "Click to enable"}
                >
                  {cat.isActive ? "Active" : "Inactive"}
                </button>

                {/* Save button */}
                {isDirty && (
                  <button
                    onClick={() => handleSaveRow(cat.id)}
                    disabled={saving[cat.id]}
                    className="flex items-center gap-1 px-2.5 py-1 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50 flex-shrink-0"
                  >
                    <Save className="w-3 h-3" />
                    {saving[cat.id] ? "Saving…" : "Save"}
                  </button>
                )}

                {/* Delete button */}
                <button
                  onClick={() => handleDeleteClick(cat)}
                  disabled={categories.length <= 1}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-20 disabled:cursor-not-allowed"
                  title={categories.length <= 1 ? "Cannot delete the last category" : "Delete"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {showAdd ? (
        <div className="mt-3 p-3 border border-primary/30 rounded-xl bg-primary/5 space-y-3">
          <p className="text-xs font-medium text-gray-700">New category</p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Colour presets */}
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLOURS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColour(c)}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    newColour === c ? "border-gray-600 scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="Category name"
              className="flex-1 min-w-[160px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {/* Budget allocation (supplier only) */}
            {entityType === "planning" && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">{currencySymbol}</span>
                <input
                  type="number"
                  value={newAllocated}
                  onChange={e => setNewAllocated(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                  placeholder="Budget"
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add category"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewName(""); setNewColour("#6366f1"); setNewAllocated(""); }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add category
        </button>
      )}

      {deleteTarget && (
        <ConfirmModal
          message={
            <span>
              <strong>{deleteTarget.name}</strong> is used by{" "}
              <strong>
                {deleteTarget.count} {entityLabel}
                {deleteTarget.count !== 1 ? "s" : ""}
              </strong>
              . They will be uncategorised if deleted. Are you sure?
            </span>
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && (
        <div
          className={`fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

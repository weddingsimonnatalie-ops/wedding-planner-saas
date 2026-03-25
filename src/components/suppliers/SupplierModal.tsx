"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { useRefresh } from "@/context/RefreshContext";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";

interface SupplierCategory { id: string; name: string }

const STATUS_OPTIONS = [
  { value: "ENQUIRY",   label: "Enquiry" },
  { value: "QUOTED",    label: "Quoted" },
  { value: "BOOKED",    label: "Booked" },
  { value: "COMPLETE",  label: "Complete" },
  { value: "CANCELLED", label: "Cancelled" },
];

interface Props {
  onClose: () => void;
}

export function SupplierModal({ onClose }: Props) {
  const router = useRouter();
  const { triggerRefresh } = useRefresh();

  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [categoryId, setCategoryId]     = useState("");
  const [status, setStatus]             = useState("ENQUIRY");
  const [name, setName]                 = useState("");
  const [contactName, setContactName]   = useState("");
  const [phone, setPhone]               = useState("");
  const [email, setEmail]               = useState("");
  const [website, setWebsite]           = useState("");
  const [contractValue, setContractValue] = useState("");
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");

  // ── Track dirty state for inactivity warning ───────────────────────────────
  const isDirty = useMemo(() => {
    // Check if any field has been filled in
    return (
      name !== "" ||
      contactName !== "" ||
      phone !== "" ||
      email !== "" ||
      website !== "" ||
      contractValue !== "" ||
      categoryId !== "" ||
      status !== "ENQUIRY" // default
    );
  }, [name, contactName, phone, email, website, contractValue, categoryId, status]);

  useFormDirtyRegistration("supplier-modal", "New Supplier", isDirty);

  useEffect(() => {
    fetchApi("/api/supplier-categories")
      .then(r => r.json())
      .then((data: SupplierCategory[]) => {
        setCategories(data);
        if (data.length > 0) setCategoryId(data[0].id);
      })
      .catch(() => {});
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Supplier name is required"); return; }
    setError("");
    setSaving(true);

    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: categoryId || null,
        status,
        name: name.trim(),
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        contractValue: contractValue ? Number(contractValue) : null,
      }),
    });

    setSaving(false);

    if (res.ok) {
      const created = await res.json();
      router.refresh();
      triggerRefresh();
      router.push(`/suppliers/${created.id}`);
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to create supplier");
    }
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
          <h2 className="text-base font-semibold text-gray-900">Add supplier</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Category + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={inputCls}
              >
                <option value="">— None —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Supplier name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier name <span className="text-red-500">*</span>
            </label>
            <input
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. The Grand Hotel"
              className={inputCls}
            />
          </div>

          {/* Contact name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact name</label>
              <input
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 07700 900000"
                className={inputCls}
              />
            </div>
          </div>

          {/* Email + Website */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. contact@supplier.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="e.g. https://supplier.com"
                className={inputCls}
              />
            </div>
          </div>

          {/* Contract value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contract value (£)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={contractValue}
              onChange={e => setContractValue(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving ? "Creating…" : "Create & open"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

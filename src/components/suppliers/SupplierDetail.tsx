"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/fetch";
import { ArrowLeft, Edit2, Save, X, Trash2, Plus, Check, Mail, Paperclip, Download, Eye, RotateCcw, Pencil } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SupplierAppointmentsSection } from "@/components/suppliers/SupplierAppointmentsSection";
import { SupplierTasksSection } from "@/components/suppliers/SupplierTasksSection";
import { usePermissions } from "@/hooks/usePermissions";
import { useWedding, getEmailBlockReason, getUploadBlockReason } from "@/context/WeddingContext";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { useFormDirtyRegistration } from "@/hooks/useFormDirtyRegistration";

interface SupplierCategory { id: string; name: string; colour: string }

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  ENQUIRY:   { label: "Enquiry",   cls: "bg-gray-100 text-gray-700" },
  QUOTED:    { label: "Quoted",    cls: "bg-blue-100 text-blue-700" },
  BOOKED:    { label: "Booked",    cls: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
  COMPLETE:  { label: "Complete",  cls: "bg-purple-100 text-purple-700" },
};

const STATUS_ORDER = ["ENQUIRY", "QUOTED", "BOOKED", "COMPLETE"];

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: "Pending",   cls: "bg-amber-100 text-amber-700" },
  PAID:      { label: "Paid",      cls: "bg-green-100 text-green-700" },
  OVERDUE:   { label: "Overdue",   cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-500" },
};

interface Payment {
  id: string; label: string; amount: number;
  dueDate: Date | string | null; paidDate: Date | string | null; status: string; notes: string | null;
}
interface Attachment {
  id: string; filename: string; storedAs: string; mimeType: string; sizeBytes: number; uploadedAt: Date | string;
  paymentId: string | null;
}
interface SupplierData {
  id: string;
  categoryId: string | null;
  category: SupplierCategory | null;
  name: string; contactName: string | null;
  email: string | null; phone: string | null; website: string | null;
  notes: string | null; contractValue: number | null;
  contractSigned: boolean; contractSignedAt: Date | string | null;
  status: string; payments: Payment[]; attachments: Attachment[];
}

// Converts a Date object or ISO string to the YYYY-MM-DD format required by <input type="date">
function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

function fmt(n: number) {
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SupplierDetail({ initialSupplier }: { initialSupplier: SupplierData }) {
  const { can: perms } = usePermissions();
  const { subscriptionStatus } = useWedding();
  const canSendEmail = subscriptionStatus === "ACTIVE" || subscriptionStatus === "PAST_DUE";
  const emailBlockReason = getEmailBlockReason(subscriptionStatus);
  const canUpload = subscriptionStatus === "ACTIVE" || subscriptionStatus === "PAST_DUE";
  const uploadBlockReason = getUploadBlockReason(subscriptionStatus);
  const router = useRouter();
  const [supplier, setSupplier] = useState(initialSupplier);
  const [payments, setPayments] = useState<Payment[]>(initialSupplier.payments);
  const [attachments, setAttachments] = useState<Attachment[]>(initialSupplier.attachments);
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    categoryId: initialSupplier.categoryId ?? "",
    name: initialSupplier.name,
    contactName: initialSupplier.contactName ?? "",
    email: initialSupplier.email ?? "",
    phone: initialSupplier.phone ?? "",
    website: initialSupplier.website ?? "",
    notes: initialSupplier.notes ?? "",
    contractValue: initialSupplier.contractValue?.toString() ?? "",
    contractSigned: initialSupplier.contractSigned,
    contractSignedAt: toDateInputValue(initialSupplier.contractSignedAt),
    status: initialSupplier.status,
  });
  const [savingInfo, setSavingInfo] = useState(false);

  // Payment form state
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payForm, setPayForm] = useState({ label: "", amount: "", dueDate: "" });
  const [savingPay, setSavingPay] = useState(false);

  // Edit payment state
  const [editingPayId, setEditingPayId] = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({
    label: "", amount: "", dueDate: "", status: "PENDING", paidDate: "", notes: "",
  });
  const [editPayErrors, setEditPayErrors] = useState<Record<string, string>>({});
  const [savingEditPay, setSavingEditPay] = useState(false);

  // Attachment upload + preview
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [markUnpaidId, setMarkUnpaidId] = useState<string | null>(null);

  // ── Track dirty state for inactivity warning ───────────────────────────────
  const isDirty = useMemo(() => {
    // Supplier info editing
    if (editing) {
      const s = initialSupplier;
      return (
        (form.categoryId || "") !== (s.categoryId || "") ||
        form.name !== s.name ||
        (form.contactName || "") !== (s.contactName || "") ||
        (form.email || "") !== (s.email || "") ||
        (form.phone || "") !== (s.phone || "") ||
        (form.website || "") !== (s.website || "") ||
        (form.notes || "") !== (s.notes || "") ||
        (form.contractValue || "") !== (s.contractValue?.toString() || "") ||
        form.contractSigned !== s.contractSigned ||
        form.contractSignedAt !== toDateInputValue(s.contractSignedAt) ||
        form.status !== s.status
      );
    }
    // Payment editing (inline)
    if (editingPayId !== null) {
      return true;
    }
    // Adding new payment
    if (showAddPayment && (payForm.label.trim() !== "" || payForm.amount !== "")) {
      return true;
    }
    return false;
  }, [editing, editingPayId, showAddPayment, form, payForm, initialSupplier]);

  const formId = `supplier-${initialSupplier.id}`;
  const formName = `Supplier: ${initialSupplier.name}`;
  useFormDirtyRegistration(formId, formName, isDirty);

  // Load supplier categories
  useEffect(() => {
    fetchApi("/api/supplier-categories")
      .then(r => r.json())
      .then((data: SupplierCategory[]) => setCategories(data))
      .catch(() => {});
  }, []);

  // Close lightbox on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewAtt(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // Derived payment totals
  const totalPaid = payments.filter(p => p.status === "PAID").reduce((a, p) => a + p.amount, 0);
  const contracted = supplier.contractValue ?? 0;
  const remaining = Math.max(0, contracted - totalPaid);
  const pct = contracted > 0 ? Math.min(100, (totalPaid / contracted) * 100) : 0;

  // ── Supplier info save ──────────────────────────────────────────────────────

  async function handleSaveInfo() {
    setSavingInfo(true);
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        categoryId: form.categoryId || null,
        contractValue: form.contractValue !== "" ? Number(form.contractValue) : null,
        contractSignedAt: form.contractSigned && form.contractSignedAt ? form.contractSignedAt : null,
      }),
    });
    setSavingInfo(false);
    if (res.ok) {
      const updated = await res.json();
      setSupplier(prev => ({ ...prev, ...updated }));
      setEditing(false);
      showToast("Saved");
    } else {
      showToast("Failed to save", false);
    }
  }

  async function handleAdvanceStatus(newStatus: string) {
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setSupplier(prev => ({ ...prev, status: newStatus }));
      setForm(f => ({ ...f, status: newStatus }));
      showToast(`Status updated to ${STATUS_CONFIG[newStatus]?.label}`);
    }
  }

  async function handleDeleteSupplier() {
    if (!confirm(`Delete "${supplier.name}"? This will remove all payments and attachments.`)) return;
    const res = await fetch(`/api/suppliers/${supplier.id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
      router.push("/suppliers");
    } else {
      showToast("Failed to delete", false);
    }
  }

  // ── Payments ────────────────────────────────────────────────────────────────

  async function handleAddPayment() {
    if (!payForm.label.trim() || !payForm.amount) return;
    setSavingPay(true);
    const res = await fetch(`/api/suppliers/${supplier.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payForm),
    });
    setSavingPay(false);
    if (res.ok) {
      const p = await res.json();
      setPayments(prev => [...prev, p]);
      setPayForm({ label: "", amount: "", dueDate: "" });
      setShowAddPayment(false);
      showToast("Payment added");
      router.refresh();
    } else {
      const d = await res.json();
      showToast(d.error ?? "Failed to add payment", false);
    }
  }

  function openEditPayment(p: Payment) {
    setEditingPayId(p.id);
    setEditPayForm({
      label: p.label,
      amount: String(p.amount),
      dueDate: toDateInputValue(p.dueDate),
      status: p.status,
      paidDate: toDateInputValue(p.paidDate),
      notes: p.notes ?? "",
    });
    setEditPayErrors({});
  }

  function handleEditStatusChange(newStatus: string) {
    setEditPayForm(f => {
      const today = new Date().toISOString().slice(0, 10);
      return {
        ...f,
        status: newStatus,
        paidDate: newStatus === "PAID" ? (f.paidDate || today) : "",
      };
    });
  }

  async function handleSaveEditPayment() {
    const errs: Record<string, string> = {};
    if (!editPayForm.label.trim()) errs.label = "Label is required";
    if (!editPayForm.amount || Number(editPayForm.amount) <= 0) errs.amount = "Amount must be a positive number";
    if (editPayForm.status === "PAID" && !editPayForm.paidDate) errs.paidDate = "Paid date is required when status is Paid";
    if (Object.keys(errs).length > 0) { setEditPayErrors(errs); return; }

    setSavingEditPay(true);
    const res = await fetch(`/api/suppliers/${supplier.id}/payments/${editingPayId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editPayForm.label.trim(),
        amount: Number(editPayForm.amount),
        dueDate: editPayForm.dueDate || null,
        status: editPayForm.status,
        paidDate: editPayForm.status === "PAID" ? (editPayForm.paidDate || null) : null,
        notes: editPayForm.notes || null,
      }),
    });
    setSavingEditPay(false);
    if (res.ok) {
      const updated = await res.json();
      setPayments(prev => prev.map(p => p.id === editingPayId ? updated : p));
      setEditingPayId(null);
      showToast("Payment updated");
      router.refresh();
    } else {
      showToast("Failed to update payment", false);
    }
  }

  async function handleMarkPaid(paymentId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/suppliers/${supplier.id}/payments/${paymentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID", paidDate: today }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPayments(prev => prev.map(p => p.id === paymentId ? updated : p));
      showToast("Marked as paid");
      router.refresh();
    } else {
      showToast("Failed to update payment", false);
    }
  }

  async function handleMarkUnpaid(paymentId: string) {
    const payment = payments.find(p => p.id === paymentId);
    const isOverdue = payment?.dueDate && new Date(payment.dueDate) < new Date();
    const newStatus = isOverdue ? "OVERDUE" : "PENDING";
    const res = await fetch(`/api/suppliers/${supplier.id}/payments/${paymentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, paidDate: null }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPayments(prev => prev.map(p => p.id === paymentId ? updated : p));
      showToast("Payment marked as unpaid");
      router.refresh();
    } else {
      showToast("Failed to update payment", false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!confirm("Delete this payment?")) return;
    const res = await fetch(`/api/suppliers/${supplier.id}/payments/${paymentId}`, { method: "DELETE" });
    if (res.ok) {
      setPayments(prev => prev.filter(p => p.id !== paymentId));
      showToast("Payment deleted");
      router.refresh();
    } else {
      showToast("Failed to delete payment", false);
    }
  }

  async function handleSendReminder(paymentId: string) {
    const res = await fetch("/api/email/payment-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    const d = await res.json();
    showToast(d.message ?? (res.ok ? "Reminder sent" : "Failed to send"), res.ok);
  }

  // ── Attachments ─────────────────────────────────────────────────────────────

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/suppliers/${supplier.id}/attachments`, { method: "POST", body: fd });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (res.ok) {
      const att = await res.json();
      setAttachments(prev => [att, ...prev]);
      showToast("File uploaded");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Upload failed", false);
    }
  }

  async function handleDeleteAttachment(attId: string) {
    if (!confirm("Delete this file?")) return;
    const res = await fetch(`/api/suppliers/${supplier.id}/attachments/${attId}`, { method: "DELETE" });
    if (res.ok) {
      setAttachments(prev => prev.filter(a => a.id !== attId));
      showToast("File deleted");
    } else {
      showToast("Failed to delete file", false);
    }
  }

  const cfg = STATUS_CONFIG[supplier.status] ?? STATUS_CONFIG.ENQUIRY;
  const statusIdx = STATUS_ORDER.indexOf(supplier.status);

  return (
    <div>
      {!perms.editSuppliers && (
        <ReadOnlyBanner message="You have view-only access to suppliers." />
      )}

      {/* Back + title */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push("/suppliers")} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 truncate">{supplier.name}</h1>
          <p className="text-xs text-gray-400">{supplier.category?.name ?? "—"}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
      </div>

      {/* Status workflow */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Status:</span>
        {STATUS_ORDER.map((s, i) => {
          const c = STATUS_CONFIG[s];
          const isCurrent = supplier.status === s;
          const isDone = statusIdx > i;
          return (
            <button
              key={s}
              onClick={() => perms.editSuppliers && !isCurrent && handleAdvanceStatus(s)}
              disabled={isCurrent || !perms.editSuppliers}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                isCurrent
                  ? `${c.cls} border-transparent cursor-default`
                  : isDone || !perms.editSuppliers
                  ? "bg-gray-50 border-gray-200 text-gray-400"
                  : "bg-white border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
              }`}
            >
              {isDone && <Check className="w-3 h-3 inline mr-1" />}
              {c.label}
            </button>
          );
        })}
        <button
          onClick={() => perms.editSuppliers && handleAdvanceStatus("CANCELLED")}
          disabled={supplier.status === "CANCELLED" || !perms.editSuppliers}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ml-auto ${
            supplier.status === "CANCELLED"
              ? "bg-red-100 text-red-700 border-transparent cursor-default"
              : "bg-white border-gray-200 text-gray-400" + (perms.editSuppliers ? " hover:border-red-300 hover:text-red-500" : "")
          }`}
        >
          Cancelled
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ── Left: Supplier info ──────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">Supplier info</p>
              {editing ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveInfo}
                    disabled={savingInfo}
                    className="flex items-center gap-1 px-3 py-1 bg-primary text-white rounded-lg text-xs font-medium"
                  >
                    <Save className="w-3 h-3" /> {savingInfo ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setForm({ categoryId: supplier.categoryId ?? "", name: supplier.name, contactName: supplier.contactName ?? "", email: supplier.email ?? "", phone: supplier.phone ?? "", website: supplier.website ?? "", notes: supplier.notes ?? "", contractValue: supplier.contractValue?.toString() ?? "", contractSigned: supplier.contractSigned, contractSignedAt: toDateInputValue(supplier.contractSignedAt), status: supplier.status }); }}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : perms.editSuppliers ? (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              ) : null}
            </div>

            <div className="p-4 space-y-3">
              {editing ? (
                <>
                  <Field label="Category">
                    <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className={inputCls}>
                      <option value="">— None —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Name *">
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Contact name">
                    <input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Phone">
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Website">
                    <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" className={inputCls} />
                  </Field>
                  <Field label="Contract value (£)">
                    <input type="number" min={0} step="0.01" value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: e.target.value }))} className={inputCls} />
                  </Field>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox" id="contractSigned" checked={form.contractSigned}
                      onChange={e => setForm(f => ({ ...f, contractSigned: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="contractSigned" className="text-xs text-gray-700">Contract signed</label>
                  </div>
                  {form.contractSigned && (
                    <Field label="Signed date">
                      <input type="date" value={form.contractSignedAt} onChange={e => setForm(f => ({ ...f, contractSignedAt: e.target.value }))} className={inputCls} />
                    </Field>
                  )}
                  <Field label="Notes">
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className={inputCls} />
                  </Field>
                </>
              ) : (
                <>
                  <InfoRow label="Category" value={supplier.category?.name ?? null} />
                  <InfoRow label="Contact" value={supplier.contactName} />
                  <InfoRow label="Email" value={supplier.email} link={supplier.email ? `mailto:${supplier.email}` : undefined} />
                  <InfoRow label="Phone" value={supplier.phone} link={supplier.phone ? `tel:${supplier.phone}` : undefined} />
                  <InfoRow label="Website" value={supplier.website} link={supplier.website ?? undefined} external />
                  <InfoRow label="Contract value" value={supplier.contractValue != null ? fmt(supplier.contractValue) : null} />
                  <InfoRow
                    label="Contract signed"
                    value={supplier.contractSigned ? `Yes${supplier.contractSignedAt ? ` · ${fmtDate(supplier.contractSignedAt)}` : ""}` : "No"}
                  />
                  {supplier.notes && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Notes</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{supplier.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Delete */}
          {perms.editSuppliers && (
            <button
              onClick={handleDeleteSupplier}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete supplier
            </button>
          )}
        </div>

        {/* ── Right: Payments + Attachments ───────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Payments */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Payments</p>
              {perms.editPayments && (
                <button
                  onClick={() => setShowAddPayment(s => !s)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  <Plus className="w-3.5 h-3.5" /> Add payment
                </button>
              )}
            </div>

            {/* Progress */}
            {contracted > 0 && (
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Paid {fmt(totalPaid)} of {fmt(contracted)}</span>
                  <span className={remaining > 0 ? "text-amber-700" : "text-green-700"}>
                    {remaining > 0 ? `${fmt(remaining)} remaining` : "Fully paid"}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            {/* Payment rows */}
            <div className="divide-y divide-gray-50">
              {payments.length === 0 && !showAddPayment && (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">No payments yet</p>
              )}
              {payments.map(p => {
                // ── Inline edit form ──────────────────────────────────────────
                if (editingPayId === p.id) {
                  return (
                    <div key={p.id} className="px-4 py-3 space-y-2.5 bg-gray-50/60">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="text-xs text-gray-400 block mb-0.5">Label</label>
                          <input
                            autoFocus
                            value={editPayForm.label}
                            onChange={e => setEditPayForm(f => ({ ...f, label: e.target.value }))}
                            className={inputCls}
                          />
                          {editPayErrors.label && <p className="text-xs text-red-500 mt-0.5">{editPayErrors.label}</p>}
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-0.5">Amount (£)</label>
                          <input
                            type="number" min={0} step="0.01"
                            value={editPayForm.amount}
                            onChange={e => setEditPayForm(f => ({ ...f, amount: e.target.value }))}
                            className={inputCls}
                          />
                          {editPayErrors.amount && <p className="text-xs text-red-500 mt-0.5">{editPayErrors.amount}</p>}
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-0.5">Due date</label>
                          <input
                            type="date"
                            value={editPayForm.dueDate}
                            onChange={e => setEditPayForm(f => ({ ...f, dueDate: e.target.value }))}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-0.5">Status</label>
                          <select
                            value={editPayForm.status}
                            onChange={e => handleEditStatusChange(e.target.value)}
                            className={inputCls}
                          >
                            <option value="PENDING">Pending</option>
                            <option value="PAID">Paid</option>
                            <option value="OVERDUE">Overdue</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                        </div>
                        {editPayForm.status === "PAID" && (
                          <div>
                            <label className="text-xs text-gray-400 block mb-0.5">Paid date</label>
                            <input
                              type="date"
                              value={editPayForm.paidDate}
                              onChange={e => setEditPayForm(f => ({ ...f, paidDate: e.target.value }))}
                              className={inputCls}
                            />
                            {editPayErrors.paidDate && <p className="text-xs text-red-500 mt-0.5">{editPayErrors.paidDate}</p>}
                          </div>
                        )}
                        <div className={editPayForm.status === "PAID" ? "col-span-2" : "col-span-2"}>
                          <label className="text-xs text-gray-400 block mb-0.5">Notes</label>
                          <input
                            value={editPayForm.notes}
                            onChange={e => setEditPayForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional notes"
                            className={inputCls}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEditPayment}
                          disabled={savingEditPay}
                          className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50"
                        >
                          {savingEditPay ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditingPayId(null); setEditPayErrors({}); }}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                // ── Normal row ────────────────────────────────────────────────
                const ps = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.PENDING;
                const canPay = p.status === "PENDING" || p.status === "OVERDUE";
                return (
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-800">{p.label}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ps.cls}`}>{ps.label}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {fmt(p.amount)}
                        {p.dueDate && ` · Due ${fmtDate(p.dueDate)}`}
                        {p.paidDate && ` · Paid ${fmtDate(p.paidDate)}`}
                      </p>
                      {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                    </div>
                    {perms.editPayments && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {canPay && (
                          <button
                            onClick={() => handleMarkPaid(p.id)}
                            title="Mark as paid"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {p.status === "PAID" && (
                          <button
                            onClick={() => setMarkUnpaidId(p.id)}
                            title="Mark as unpaid"
                            className="p-1.5 rounded-lg text-gray-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <UpgradePrompt active={!canSendEmail} reason={emailBlockReason ?? ""}>
                          <button
                            onClick={canSendEmail ? () => handleSendReminder(p.id) : undefined}
                            disabled={!canSendEmail}
                            title={canSendEmail ? "Send reminder email" : undefined}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        </UpgradePrompt>
                        <button
                          onClick={() => openEditPayment(p)}
                          title="Edit payment"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeletePayment(p.id)}
                          title="Delete payment"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add payment form */}
            {showAddPayment && perms.editPayments && (
              <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3 sm:col-span-1">
                    <input
                      autoFocus
                      value={payForm.label}
                      onChange={e => setPayForm(f => ({ ...f, label: e.target.value }))}
                      placeholder="Label (e.g. Deposit)"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <input
                      type="number" min={0} step="0.01"
                      value={payForm.amount}
                      onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="Amount (£)"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      value={payForm.dueDate}
                      onChange={e => setPayForm(f => ({ ...f, dueDate: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddPayment}
                    disabled={savingPay || !payForm.label.trim() || !payForm.amount}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {savingPay ? "Adding…" : "Add"}
                  </button>
                  <button onClick={() => setShowAddPayment(false)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Appointments */}
          <SupplierAppointmentsSection supplierId={supplier.id} />

          {/* Tasks */}
          <SupplierTasksSection supplierId={supplier.id} supplierName={supplier.name} />

          {/* Attachments */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Attachments</p>
              {perms.editSuppliers && (
                <>
                  <UpgradePrompt active={!canUpload} reason={uploadBlockReason ?? ""}>
                    <button
                      onClick={canUpload ? () => fileInputRef.current?.click() : undefined}
                      disabled={uploading || !canUpload}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {uploading ? "Uploading…" : "Upload file"}
                    </button>
                  </UpgradePrompt>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleUpload}
                  />
                </>
              )}
            </div>

            <div className="divide-y divide-gray-50">
              {attachments.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">
                  No files yet · Upload PDF, DOC, DOCX, JPG or PNG (max 20 MB)
                </p>
              ) : (
                attachments.map(att => {
                  const linkedPayment = att.paymentId
                    ? payments.find(p => p.id === att.paymentId)
                    : null;
                  return (
                    <div key={att.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-800 truncate">{att.filename}</p>
                          {att.paymentId && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                              Receipt
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {fmtSize(att.sizeBytes)} · {fmtDate(att.uploadedAt)}
                          {linkedPayment && ` · ${linkedPayment.label}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <AttachmentViewButton att={att} supplierId={supplier.id} onPreview={setPreviewAtt} />
                        <a
                          href={`/api/uploads/${supplier.id}/${att.storedAs}`}
                          download={att.filename}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        {perms.editSuppliers && (
                          <button
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {markUnpaidId && (
        <ConfirmModal
          message="Mark this payment as unpaid?"
          onConfirm={() => { handleMarkUnpaid(markUnpaidId); setMarkUnpaidId(null); }}
          onCancel={() => setMarkUnpaidId(null)}
        />
      )}

      {/* Image lightbox */}
      {previewAtt && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-50"
          onClick={() => setPreviewAtt(null)}
        >
          <button
            onClick={() => setPreviewAtt(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={`/api/uploads/${supplier.id}/${previewAtt.storedAs}`}
            alt={previewAtt.filename}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm truncate max-w-md">
            {previewAtt.filename}
          </p>
        </div>
      )}

      {toast && (
        <div className={`fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${toast.ok ? "bg-green-600" : "bg-red-600"}`} style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Attachment view button ────────────────────────────────────────────────────

function attType(mimeType: string): "image" | "pdf" | "word" {
  if (mimeType === "image/jpeg" || mimeType === "image/png") return "image";
  if (mimeType === "application/pdf") return "pdf";
  return "word";
}

function AttachmentViewButton({
  att,
  supplierId,
  onPreview,
}: {
  att: Attachment;
  supplierId: string;
  onPreview: (att: Attachment) => void;
}) {
  const type = attType(att.mimeType);
  const url = `/api/uploads/${supplierId}/${att.storedAs}`;

  if (type === "image") {
    return (
      <button
        onClick={() => onPreview(att)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        title="Preview image"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
    );
  }

  if (type === "pdf") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        title="Open PDF in new tab"
      >
        <Eye className="w-3.5 h-3.5" />
      </a>
    );
  }

  // Word documents — no native browser preview
  return (
    <span
      title="Download to view Word documents"
      className="p-1.5 text-gray-200 cursor-default"
      aria-hidden="true"
    >
      <Eye className="w-3.5 h-3.5" />
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value, link, external }: { label: string; value: string | null | undefined; link?: string; external?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-gray-400 w-24 flex-shrink-0">{label}</span>
      {link ? (
        <a
          href={link}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="text-sm text-primary hover:underline truncate"
        >
          {value}
        </a>
      ) : (
        <span className="text-sm text-gray-700">{value}</span>
      )}
    </div>
  );
}

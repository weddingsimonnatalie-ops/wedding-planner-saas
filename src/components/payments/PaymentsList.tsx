"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, RotateCcw, Mail, Pencil, Trash2, ChevronDown, CreditCard, X, Plus,
  Paperclip, Eye, Camera, FileText,
} from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { ConfirmModal } from "@/components/ConfirmModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useWedding, getEmailBlockReason, getUploadBlockReason } from "@/context/WeddingContext";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { PaymentModal } from "./PaymentModal";
import { ReceiptUploadModal } from "./ReceiptUploadModal";
import { ReceiptViewModal } from "./ReceiptViewModal";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SupplierInfo {
  id: string;
  name: string;
  contractValue: number | null;
  totalPaid: number;
  category: { id: string; name: string; colour: string } | null;
}

interface ReceiptInfo {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface PaymentItem {
  id: string;
  label: string;
  amount: number;
  dueDate: string | null;
  paidDate: string | null;
  status: string;
  notes: string | null;
  supplier: SupplierInfo;
  receipt: ReceiptInfo | null;
}

interface EditForm {
  label: string;
  amount: string;
  dueDate: string;
  status: string;
  paidDate: string;
  notes: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDateInputValue(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: "Pending",   cls: "bg-amber-100 text-amber-700" },
  PAID:      { label: "Paid",      cls: "bg-green-100 text-green-700" },
  OVERDUE:   { label: "Overdue",   cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = PAYMENT_STATUS[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Summary bar ────────────────────────────────────────────────────────────────

function SummaryBar({ payments }: { payments: PaymentItem[] }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const totalRemaining = payments
    .filter(p => p.status !== "PAID" && p.status !== "CANCELLED")
    .reduce((s, p) => s + p.amount, 0);

  const dueThisMonth = payments
    .filter(p => {
      if (p.status === "PAID" || p.status === "CANCELLED" || p.status === "OVERDUE") return false;
      if (!p.dueDate) return false;
      const d = new Date(p.dueDate);
      return d >= today && d <= monthEnd;
    })
    .reduce((s, p) => s + p.amount, 0);

  const totalOverdue = payments
    .filter(p => p.status === "OVERDUE")
    .reduce((s, p) => s + p.amount, 0);

  const paidThisYear = payments
    .filter(p => p.status === "PAID" && p.paidDate && new Date(p.paidDate) >= yearStart)
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      <div className="rounded-lg sm:rounded-xl border border-gray-200 bg-gray-50 px-2 py-1.5 sm:p-4 text-center min-w-0">
        <p className={`text-base sm:text-lg font-bold text-gray-900 truncate ${totalRemaining > 0 ? "" : ""}`}>{fmt(totalRemaining)}</p>
        <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">Remaining</p>
      </div>
      <div className="rounded-lg sm:rounded-xl border border-amber-200 bg-amber-50 px-2 py-1.5 sm:p-4 text-center min-w-0">
        <p className="text-base sm:text-lg font-bold text-amber-700 truncate">{fmt(dueThisMonth)}</p>
        <p className="text-[10px] sm:text-xs text-amber-600 leading-tight">Due this month</p>
      </div>
      <div className="rounded-lg sm:rounded-xl border border-red-200 bg-red-50 px-2 py-1.5 sm:p-4 text-center min-w-0">
        <p className="text-base sm:text-lg font-bold text-red-700 truncate">{fmt(totalOverdue)}</p>
        <p className="text-[10px] sm:text-xs text-red-500 leading-tight">Overdue</p>
      </div>
      <div className="rounded-lg sm:rounded-xl border border-green-200 bg-green-50 px-2 py-1.5 sm:p-4 text-center min-w-0">
        <p className="text-base sm:text-lg font-bold text-green-700 truncate">{fmt(paidThisYear)}</p>
        <p className="text-[10px] sm:text-xs text-green-600 leading-tight">Paid this year</p>
      </div>
    </div>
  );
}

// ── Inline edit form ───────────────────────────────────────────────────────────

const INPUT_CLS = "w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white";

function PaymentEditForm({
  payment,
  onSave,
  onCancel,
}: {
  payment: PaymentItem;
  onSave: (form: EditForm) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    label: payment.label,
    amount: String(payment.amount),
    dueDate: toDateInputValue(payment.dueDate),
    status: payment.status,
    paidDate: toDateInputValue(payment.paidDate),
    notes: payment.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function handleStatusChange(s: string) {
    const today = new Date().toISOString().slice(0, 10);
    setForm(f => ({
      ...f,
      status: s,
      paidDate: s === "PAID" ? (f.paidDate || today) : f.paidDate,
    }));
  }

  async function handleSubmit() {
    const errs: Record<string, string> = {};
    if (!form.label.trim()) errs.label = "Required";
    if (!form.amount || Number(form.amount) <= 0) errs.amount = "Must be greater than 0";
    if (form.status === "PAID" && !form.paidDate) errs.paidDate = "Required when status is Paid";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      await onSave(form);
    } catch {
      // parent shows toast; form stays open
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-primary/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-700">
          Edit payment ·{" "}
          <Link href={`/suppliers/${payment.supplier.id}`} className="text-primary hover:underline">
            {payment.supplier.name}
          </Link>
        </p>
        <button type="button" onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
          <input
            className={`${INPUT_CLS} ${errors.label ? "border-red-400" : ""}`}
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          />
          {errors.label && <p className="text-xs text-red-500 mt-0.5">{errors.label}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount (£)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={`${INPUT_CLS} ${errors.amount ? "border-red-400" : ""}`}
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          />
          {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Due date</label>
          <input
            type="date"
            className={INPUT_CLS}
            value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select
            className={INPUT_CLS}
            value={form.status}
            onChange={e => handleStatusChange(e.target.value)}
          >
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {form.status === "PAID" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Paid date</label>
            <input
              type="date"
              className={`${INPUT_CLS} ${errors.paidDate ? "border-red-400" : ""}`}
              value={form.paidDate}
              onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))}
            />
            {errors.paidDate && <p className="text-xs text-red-500 mt-0.5">{errors.paidDate}</p>}
          </div>
        )}

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            rows={2}
            className={`${INPUT_CLS} resize-none`}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ── Payment card ───────────────────────────────────────────────────────────────

function PaymentCard({
  payment,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onMarkPaid,
  onMarkUnpaid,
  onSendReminder,
  onDelete,
  onUploadReceipt,
  onViewReceipt,
  onDeleteReceipt,
  readOnly = false,
}: {
  payment: PaymentItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (form: EditForm) => Promise<void>;
  onMarkPaid: () => Promise<void>;
  onMarkUnpaid: () => Promise<void>;
  onSendReminder: () => Promise<void>;
  onDelete: () => void;
  onUploadReceipt: () => void;
  onViewReceipt: () => void;
  onDeleteReceipt: () => void;
  readOnly?: boolean;
}) {
  if (isEditing) {
    return (
      <PaymentEditForm
        payment={payment}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
      />
    );
  }

  const { subscriptionStatus } = useWedding();
  const canSendEmail = subscriptionStatus === "ACTIVE" || subscriptionStatus === "PAST_DUE";
  const emailBlockReason = getEmailBlockReason(subscriptionStatus);
  const canUpload = subscriptionStatus === "ACTIVE" || subscriptionStatus === "PAST_DUE";
  const uploadBlockReason = getUploadBlockReason(subscriptionStatus);

  const { supplier } = payment;
  const pct =
    supplier.contractValue && supplier.contractValue > 0
      ? Math.min(100, (supplier.totalPaid / supplier.contractValue) * 100)
      : null;
  const overdue = payment.status === "OVERDUE";
  const paid = payment.status === "PAID";
  const cancelled = payment.status === "CANCELLED";
  const actionable = !paid && !cancelled;

  return (
    <div
      className={`bg-white rounded-xl border p-4 ${
        overdue ? "border-red-200 bg-red-50/20" : "border-gray-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={payment.status} />
            <Link
              href={`/suppliers/${supplier.id}`}
              className="text-sm font-medium text-gray-700 hover:text-primary hover:underline truncate"
            >
              {supplier.name}
            </Link>
          </div>
          <p className="text-sm font-semibold text-gray-900">{payment.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {fmt(payment.amount)}
            {payment.dueDate && ` · Due ${fmtDate(payment.dueDate)}`}
            {payment.paidDate && ` · Paid ${fmtDate(payment.paidDate)}`}
          </p>
          {payment.notes && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">{payment.notes}</p>
          )}
          {pct !== null && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                <span>Supplier total</span>
                <span>{fmt(supplier.totalPaid)} / {fmt(supplier.contractValue!)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Receipt section */}
          {payment.receipt ? (
            <div className="mt-3 p-2 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-3">
              {payment.receipt.mimeType.startsWith("image/") ? (
                <div className="w-10 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                  <img
                    src={`/api/payments/${payment.id}/receipt`}
                    alt="Receipt"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{payment.receipt.filename}</p>
                <p className="text-xs text-gray-400">{fmtSize(payment.receipt.sizeBytes)}</p>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={onViewReceipt}
                    className="p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="View receipt"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteReceipt}
                    className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete receipt"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : !readOnly ? (
            <div className="mt-3">
              <div className="flex gap-2">
                <UpgradePrompt active={!canUpload} reason={uploadBlockReason ?? ""}>
                  <button
                    type="button"
                    onClick={canUpload ? onUploadReceipt : undefined}
                    disabled={!canUpload}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Upload receipt
                  </button>
                </UpgradePrompt>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Action bar */}
      {!readOnly && <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
        {actionable && (
          <button
            type="button"
            onClick={onMarkPaid}
            className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <Check className="w-3 h-3" /> Mark as paid
          </button>
        )}
        {paid && (
          <button
            type="button"
            onClick={onMarkUnpaid}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Mark as unpaid
          </button>
        )}
        {actionable && (
          <UpgradePrompt active={!canSendEmail} reason={emailBlockReason ?? ""}>
            <button
              type="button"
              onClick={canSendEmail ? onSendReminder : undefined}
              disabled={!canSendEmail}
              title={canSendEmail ? "Send reminder email" : undefined}
              className="flex items-center gap-1 px-2.5 py-1 text-gray-500 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="w-3 h-3" /> Reminder
            </button>
          </UpgradePrompt>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onStartEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>}
    </div>
  );
}

// ── Group section ──────────────────────────────────────────────────────────────

interface GroupSectionProps {
  title: string;
  accentCls?: string;
  payments: PaymentItem[];
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, form: EditForm) => Promise<void>;
  onMarkPaid: (p: PaymentItem) => Promise<void>;
  onMarkUnpaid: (p: PaymentItem) => Promise<void>;
  onSendReminder: (id: string) => Promise<void>;
  onDelete: (p: PaymentItem) => void;
  onUploadReceipt: (p: PaymentItem) => void;
  onViewReceipt: (p: PaymentItem) => void;
  onDeleteReceipt: (p: PaymentItem) => void;
  collapsible?: boolean;
  initiallyOpen?: boolean;
  readOnly?: boolean;
}

function GroupSection({
  title,
  accentCls = "text-gray-500",
  payments,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onMarkPaid,
  onMarkUnpaid,
  onSendReminder,
  onDelete,
  onUploadReceipt,
  onViewReceipt,
  onDeleteReceipt,
  collapsible,
  initiallyOpen = true,
  readOnly = false,
}: GroupSectionProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide hover:text-gray-700 transition-colors ${accentCls}`}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {title} ({payments.length})
          </button>
        ) : (
          <p className={`text-xs font-semibold uppercase tracking-wide ${accentCls}`}>{title}</p>
        )}
        <p className="text-xs font-medium text-gray-400">{fmt(total)}</p>
      </div>
      <div className="h-px bg-gray-200 mb-3" />

      {(!collapsible || open) && (
        <div className="space-y-3">
          {payments.map(p => (
            <PaymentCard
              key={p.id}
              payment={p}
              isEditing={editingId === p.id}
              onStartEdit={() => onStartEdit(p.id)}
              onCancelEdit={onCancelEdit}
              onSaveEdit={form => onSaveEdit(p.id, form)}
              onMarkPaid={() => onMarkPaid(p)}
              onMarkUnpaid={() => onMarkUnpaid(p)}
              onSendReminder={() => onSendReminder(p.id)}
              onDelete={() => onDelete(p)}
              onUploadReceipt={() => onUploadReceipt(p)}
              onViewReceipt={() => onViewReceipt(p)}
              onDeleteReceipt={() => onDeleteReceipt(p)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PaymentsList() {
  const { can: perms } = usePermissions();
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PaymentItem | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploadReceiptPayment, setUploadReceiptPayment] = useState<PaymentItem | null>(null);
  const [viewReceiptPayment, setViewReceiptPayment] = useState<PaymentItem | null>(null);
  const [deleteReceiptConfirm, setDeleteReceiptConfirm] = useState<PaymentItem | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchApi("/api/payments");
      if (!res.ok) {
        if (!silent) setError("Failed to load payments. Please refresh the page.");
        return;
      }
      const data = await res.json();
      setPayments(data);
      setError("");
    } catch {
      if (!silent) setError("Failed to load payments. Please refresh the page.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter logic ──────────────────────────────────────────────────────────

  function applyFilters(list: PaymentItem[]): PaymentItem[] {
    let result = list;

    if (statusFilter) {
      result = result.filter(p => p.status === statusFilter);
    }
    if (supplierFilter) {
      result = result.filter(p => p.supplier.id === supplierFilter);
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateFilter) {
      case "overdue":
        result = result.filter(p => p.status === "OVERDUE");
        break;
      case "this_week": {
        const end = new Date(todayStart);
        end.setDate(end.getDate() + 7);
        result = result.filter(p => {
          if (!p.dueDate) return false;
          const d = new Date(p.dueDate);
          return d >= todayStart && d <= end;
        });
        break;
      }
      case "this_month": {
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        result = result.filter(p => {
          if (!p.dueDate) return false;
          const d = new Date(p.dueDate);
          return d >= todayStart && d <= end;
        });
        break;
      }
      case "3_months": {
        const end = new Date(todayStart);
        end.setMonth(end.getMonth() + 3);
        result = result.filter(p => {
          if (!p.dueDate) return false;
          const d = new Date(p.dueDate);
          return d >= todayStart && d <= end;
        });
        break;
      }
      case "6_months": {
        const end = new Date(todayStart);
        end.setMonth(end.getMonth() + 6);
        result = result.filter(p => {
          if (!p.dueDate) return false;
          const d = new Date(p.dueDate);
          return d >= todayStart && d <= end;
        });
        break;
      }
      case "custom": {
        result = result.filter(p => {
          if (!p.dueDate) return !customFrom && !customTo;
          const d = new Date(p.dueDate);
          if (customFrom && d < new Date(customFrom)) return false;
          if (customTo && d > new Date(customTo)) return false;
          return true;
        });
        break;
      }
    }

    return result;
  }

  const filtered = applyFilters(payments);

  // ── Group filtered payments ───────────────────────────────────────────────

  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in3months = new Date(todayStart);
  in3months.setMonth(in3months.getMonth() + 3);
  in3months.setHours(23, 59, 59, 999);

  const groups = {
    overdue: [] as PaymentItem[],
    thisMonth: [] as PaymentItem[],
    threeMonths: [] as PaymentItem[],
    future: [] as PaymentItem[],
    paid: [] as PaymentItem[],
  };

  for (const p of filtered) {
    if (p.status === "PAID" || p.status === "CANCELLED") {
      groups.paid.push(p);
    } else if (p.status === "OVERDUE") {
      groups.overdue.push(p);
    } else {
      // PENDING
      if (!p.dueDate || new Date(p.dueDate) > in3months) {
        groups.future.push(p);
      } else if (new Date(p.dueDate) <= monthEnd) {
        groups.thisMonth.push(p);
      } else {
        groups.threeMonths.push(p);
      }
    }
  }

  // ── Mutation handlers ────────────────────────────────────────────────────

  async function handleMarkPaid(payment: PaymentItem) {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/suppliers/${payment.supplier.id}/payments/${payment.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID", paidDate: today }),
    });
    if (res.ok) {
      showToast("Marked as paid");
      await load(true);
      router.refresh();
    } else {
      showToast("Failed to update", false);
    }
  }

  async function handleMarkUnpaid(payment: PaymentItem) {
    const isOverdue = payment.dueDate && new Date(payment.dueDate) < todayStart;
    const newStatus = isOverdue ? "OVERDUE" : "PENDING";
    const res = await fetch(`/api/suppliers/${payment.supplier.id}/payments/${payment.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, paidDate: null }),
    });
    if (res.ok) {
      showToast("Payment marked as unpaid");
      await load(true);
      router.refresh();
    } else {
      showToast("Failed to update", false);
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

  async function handleDelete(payment: PaymentItem) {
    const res = await fetch(`/api/suppliers/${payment.supplier.id}/payments/${payment.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      showToast("Payment deleted");
      setDeleteConfirm(null);
      await load(true);
      router.refresh();
    } else {
      showToast("Failed to delete", false);
    }
  }

  async function handleSaveEdit(paymentId: string, form: EditForm): Promise<void> {
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    const res = await fetch(`/api/suppliers/${payment.supplier.id}/payments/${paymentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: form.label.trim(),
        amount: Number(form.amount),
        dueDate: form.dueDate || null,
        status: form.status,
        paidDate: form.status === "PAID" ? (form.paidDate || null) : null,
        notes: form.notes || null,
      }),
    });
    if (res.ok) {
      showToast("Payment updated");
      setEditingId(null);
      await load(true);
      router.refresh();
    } else {
      showToast("Failed to update", false);
      throw new Error("Save failed");
    }
  }

  // Receipt handlers
  function handleUploadReceipt(payment: PaymentItem) {
    setUploadReceiptPayment(payment);
  }

  function handleViewReceipt(payment: PaymentItem) {
    setViewReceiptPayment(payment);
  }

  function handleDeleteReceipt(payment: PaymentItem) {
    setDeleteReceiptConfirm(payment);
  }

  async function confirmDeleteReceipt() {
    if (!deleteReceiptConfirm) return;
    const res = await fetch(`/api/payments/${deleteReceiptConfirm.id}/receipt`, {
      method: "DELETE",
    });
    if (res.ok) {
      showToast("Receipt deleted");
      setDeleteReceiptConfirm(null);
      await load(true);
      router.refresh();
    } else {
      showToast("Failed to delete receipt", false);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const supplierOptions = Array.from(
    new Map(payments.map(p => [p.supplier.id, p.supplier.name])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const FILTER_CLS = "px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white";

  const commonProps = {
    editingId,
    onStartEdit: (id: string) => setEditingId(id),
    onCancelEdit: () => setEditingId(null),
    onSaveEdit: handleSaveEdit,
    onMarkPaid: handleMarkPaid,
    onMarkUnpaid: handleMarkUnpaid,
    onSendReminder: handleSendReminder,
    onDelete: (p: PaymentItem) => setDeleteConfirm(p),
    onUploadReceipt: handleUploadReceipt,
    onViewReceipt: handleViewReceipt,
    onDeleteReceipt: handleDeleteReceipt,
    readOnly: !perms.editPayments,
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white h-20" />
          ))}
        </div>
        <div className="h-10 bg-white rounded-xl border border-gray-200" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!perms.editPayments && (
        <ReadOnlyBanner message="You have view-only access to payments." />
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
        {perms.editPayments && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add payment
          </button>
        )}
      </div>

      {/* Summary bar — always uses full unfiltered dataset */}
      <SummaryBar payments={payments} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={FILTER_CLS}
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="OVERDUE">Overdue</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {supplierOptions.length > 1 && (
          <select
            value={supplierFilter}
            onChange={e => setSupplierFilter(e.target.value)}
            className={FILTER_CLS}
          >
            <option value="">All suppliers</option>
            {supplierOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className={FILTER_CLS}
        >
          <option value="">All time</option>
          <option value="overdue">Overdue</option>
          <option value="this_week">Due this week</option>
          <option value="this_month">Due this month</option>
          <option value="3_months">Due in 3 months</option>
          <option value="6_months">Due in 6 months</option>
          <option value="custom">Custom range</option>
        </select>

        {dateFilter === "custom" && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className={FILTER_CLS}
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className={FILTER_CLS}
            />
          </>
        )}
      </div>

      {/* Empty states */}
      {payments.length === 0 && (
        <div className="py-16 text-center">
          <CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 mb-1">No payments yet</p>
          <Link href="/suppliers" className="text-sm text-primary hover:underline">
            Add payments via a supplier →
          </Link>
        </div>
      )}

      {payments.length > 0 && filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">No payments match your filters</p>
        </div>
      )}

      {/* Groups */}
      {groups.overdue.length > 0 && (
        <GroupSection
          title="Overdue"
          accentCls="text-red-600"
          payments={groups.overdue}
          {...commonProps}
        />
      )}
      {groups.thisMonth.length > 0 && (
        <GroupSection
          title="Due this month"
          accentCls="text-amber-600"
          payments={groups.thisMonth}
          {...commonProps}
        />
      )}
      {groups.threeMonths.length > 0 && (
        <GroupSection
          title="Due in 3 months"
          payments={groups.threeMonths}
          {...commonProps}
        />
      )}
      {groups.future.length > 0 && (
        <GroupSection
          title="Future"
          payments={groups.future}
          {...commonProps}
        />
      )}
      {groups.paid.length > 0 && (
        <GroupSection
          title="Paid"
          accentCls="text-green-700"
          payments={groups.paid}
          collapsible
          initiallyOpen={false}
          {...commonProps}
        />
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <ConfirmModal
          message={
            <span>
              Delete{" "}
              <strong>
                {deleteConfirm.supplier.name} — {deleteConfirm.label}
              </strong>{" "}
              ({fmt(deleteConfirm.amount)})?
            </span>
          }
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Add payment modal */}
      {showAddModal && (
        <PaymentModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            load(true);
            router.refresh();
          }}
        />
      )}

      {/* Receipt upload modal */}
      {uploadReceiptPayment && (
        <ReceiptUploadModal
          payment={uploadReceiptPayment}
          onClose={() => setUploadReceiptPayment(null)}
          onUploaded={() => {
            setUploadReceiptPayment(null);
            load(true);
            router.refresh();
          }}
        />
      )}

      {/* Receipt view modal */}
      {viewReceiptPayment && viewReceiptPayment.receipt && (
        <ReceiptViewModal
          payment={viewReceiptPayment}
          onClose={() => setViewReceiptPayment(null)}
        />
      )}

      {/* Delete receipt confirm modal */}
      {deleteReceiptConfirm && (
        <ConfirmModal
          message={
            <span>
              Delete receipt for{" "}
              <strong>
                {deleteReceiptConfirm.supplier.name} — {deleteReceiptConfirm.label}
              </strong>
              ?
            </span>
          }
          onConfirm={confirmDeleteReceipt}
          onCancel={() => setDeleteReceiptConfirm(null)}
        />
      )}
    </div>
  );
}

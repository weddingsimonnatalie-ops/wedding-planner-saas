"use client";

import { useState, useEffect } from "react";
import { Plus, ExternalLink, ChevronDown } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { usePermissions } from "@/hooks/usePermissions";
import { useWedding } from "@/context/WeddingContext";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { SupplierModal } from "./SupplierModal";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  ENQUIRY:   { label: "Enquiry",   cls: "bg-gray-100 text-gray-700" },
  QUOTED:    { label: "Quoted",    cls: "bg-blue-100 text-blue-700" },
  BOOKED:    { label: "Booked",    cls: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
  COMPLETE:  { label: "Complete",  cls: "bg-purple-100 text-purple-700" },
};

interface SupplierCategory { id: string; name: string; colour: string; allocatedAmount: number | null }
interface Payment { id: string; amount: number; status: string; dueDate: string | null; }
interface Supplier {
  id: string;
  categoryId: string | null;
  category: SupplierCategory | null;
  name: string;
  contactName: string | null;
  status: string;
  contractValue: number | null;
  payments: Payment[];
}

function fmt(symbol: string, n: number) {
  return symbol + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function supplierTotals(s: Supplier) {
  const contracted = s.contractValue ?? 0;
  const paid = s.payments.filter(p => p.status === "PAID").reduce((a, p) => a + p.amount, 0);
  const remaining = Math.max(0, contracted - paid);
  return { contracted, paid, remaining };
}

export function SupplierList({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const { can: perms } = usePermissions();
  const { currencySymbol } = useWedding();
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [showStats, setShowStats] = useState(false);

  // Sync server-rendered data into state whenever the parent server component re-renders
  useEffect(() => {
    setSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  useEffect(() => {
    fetchApi("/api/supplier-categories")
      .then(r => r.json())
      .then((data: SupplierCategory[]) => setCategories(data))
      .catch(() => {
        setError("Failed to load categories. Please refresh the page.");
      });
  }, []);

  // Summary totals
  const totals = suppliers.reduce(
    (acc, s) => {
      const t = supplierTotals(s);
      acc.contracted += t.contracted;
      acc.paid += t.paid;
      acc.remaining += t.remaining;
      acc.overdue += s.payments.filter(p => p.status === "OVERDUE").length;
      return acc;
    },
    { contracted: 0, paid: 0, remaining: 0, overdue: 0 }
  );

  const filtered = suppliers.filter(s => {
    if (catFilter && s.categoryId !== catFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    return true;
  });

  const groupNames = Array.from(
    new Set(filtered.map(s => s.category?.name ?? "Uncategorised"))
  ).sort();

  return (
    <div>
      {!perms.editSuppliers && (
        <ReadOnlyBanner message="You have view-only access to suppliers." />
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Suppliers</h1>
        {perms.editSuppliers && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        )}
      </div>

      {/* Summary bar - collapsible on mobile */}
      <div className="flex flex-col gap-2 md:gap-3 mb-4">
        {/* Mobile: Collapsible header */}
        <button
          type="button"
          onClick={() => setShowStats(s => !s)}
          className="md:hidden flex items-center justify-between w-full bg-white rounded-lg border border-gray-200 px-4 py-2.5"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900">{fmt(currencySymbol, totals.contracted)}</span>
            <span className="text-sm font-medium text-gray-700">Contracted</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showStats ? "rotate-180" : ""}`} />
        </button>
        {/* Mobile: Collapsible single-column list */}
        {showStats && (
          <div className="flex flex-col gap-1 md:hidden">
            {[
              { label: "Paid", value: fmt(currencySymbol, totals.paid), cls: "text-green-700" },
              { label: "Remaining", value: fmt(currencySymbol, totals.remaining), cls: "text-amber-700" },
              { label: "Overdue", value: String(totals.overdue), cls: totals.overdue > 0 ? "text-red-600" : "text-gray-500" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
                <span className={`font-semibold text-sm ${cls}`}>{value}</span>
                <span className="text-sm text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        )}
        {/* Desktop: 4-column card grid */}
        <div className="hidden md:grid md:grid-cols-4 md:gap-3">
          {[
            { label: "Contracted", value: fmt(currencySymbol, totals.contracted), cls: "text-gray-900" },
            { label: "Paid", value: fmt(currencySymbol, totals.paid), cls: "text-green-700" },
            { label: "Remaining", value: fmt(currencySymbol, totals.remaining), cls: "text-amber-700" },
            { label: "Overdue", value: String(totals.overdue), cls: totals.overdue > 0 ? "text-red-600" : "text-gray-500" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center min-w-0">
              <p className={`text-xl font-bold ${cls} truncate`}>{value}</p>
              <p className="text-xs text-gray-500 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(catFilter || statusFilter) && (
          <button onClick={() => { setCatFilter(""); setStatusFilter(""); }} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2 min-h-[44px]">
            Clear
          </button>
        )}
      </div>

      {/* Grouped supplier cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">No suppliers yet</p>
          {perms.editSuppliers && (
            <button type="button" onClick={() => setIsModalOpen(true)} className="mt-2 text-sm text-primary hover:underline">
              Add the first supplier
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupNames.map(groupName => {
            const catSuppliers = filtered.filter(s => (s.category?.name ?? "Uncategorised") === groupName);
            const cat = categories.find(c => c.name === groupName);
            const groupContracted = catSuppliers.reduce((sum, s) => sum + (s.contractValue ?? 0), 0);
            const allocated = cat?.allocatedAmount ?? null;
            const isOverAllocated = allocated !== null && groupContracted > allocated;
            return (
              <div key={groupName}>
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{groupName}</h2>
                  {allocated !== null && (
                    <span className={`text-xs font-medium ${isOverAllocated ? "text-red-600" : "text-gray-400"}`}>
                      {fmt(currencySymbol, groupContracted)} contracted
                      <span className="text-gray-300 mx-1">/</span>
                      <span className="text-gray-500">{fmt(currencySymbol, allocated)} allocated</span>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {catSuppliers.map(s => {
                    const { contracted, paid, remaining } = supplierTotals(s);
                    const overdueCount = s.payments.filter(p => p.status === "OVERDUE").length;
                    const pct = contracted > 0 ? Math.min(100, (paid / contracted) * 100) : 0;
                    const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.ENQUIRY;
                    return (
                      <a
                        key={s.id}
                        href={`/suppliers/${s.id}`}
                        className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm hover:border-gray-300 transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{s.name}</p>
                            {s.contactName && <p className="text-xs text-gray-400 truncate">{s.contactName}</p>}
                          </div>
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                          <div>
                            <p className="text-gray-400">Contracted</p>
                            <p className="font-medium text-gray-800">{contracted > 0 ? fmt(currencySymbol, contracted) : "—"}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Paid</p>
                            <p className="font-medium text-green-700">{paid > 0 ? fmt(currencySymbol, paid) : "—"}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Remaining</p>
                            <p className={`font-medium ${remaining > 0 ? "text-amber-700" : "text-gray-400"}`}>
                              {remaining > 0 ? fmt(currencySymbol, remaining) : "—"}
                            </p>
                          </div>
                        </div>

                        {contracted > 0 && (
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}

                        {overdueCount > 0 && (
                          <p className="text-xs text-red-600 font-medium">
                            {overdueCount} overdue payment{overdueCount > 1 ? "s" : ""}
                          </p>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <SupplierModal onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}

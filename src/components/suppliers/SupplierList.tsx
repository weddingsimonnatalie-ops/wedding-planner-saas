"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Download, Upload, ChevronDown, FileSpreadsheet, Briefcase } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { usePermissions } from "@/hooks/usePermissions";
import { useWedding, getSupplierCapBlockReason } from "@/context/WeddingContext";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { SupplierModal } from "./SupplierModal";
import { CsvImportModal } from "./CsvImportModal";
import { CSV_TEMPLATE_HEADERS, CSV_TEMPLATE_EXAMPLE } from "@/lib/supplier-csv";
import { EmptyState } from "@/components/ui/EmptyState";

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

export function SupplierList({ initialSuppliers, initialStatus = "" }: { initialSuppliers: Supplier[]; initialStatus?: string }) {
  const { can: perms, isAdmin } = usePermissions();
  const { currencySymbol, subscriptionStatus } = useWedding();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [error, setError] = useState("");
  const [showStats, setShowStats] = useState(false);

  const supplierCapBlockReason = getSupplierCapBlockReason(subscriptionStatus, suppliers.length);
  const atCap = !!supplierCapBlockReason;
  const nearCap = subscriptionStatus === "FREE" && suppliers.length >= 25 && suppliers.length < 30;

  const csvTemplateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE_HEADERS + CSV_TEMPLATE_EXAMPLE)}`;

  // Sync server-rendered data into state whenever the parent server component re-renders
  useEffect(() => {
    setSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  useEffect(() => {
    fetchApi("/api/planning-categories")
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

      {(nearCap || atCap) && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-between gap-4 mb-4 ${atCap ? "bg-red-50 text-red-800 border border-red-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
          <span>
            {atCap
              ? "You've reached the 30-supplier Free Tier limit. Upgrade to add unlimited suppliers."
              : `You're using ${suppliers.length} of 30 free suppliers. Upgrade to add unlimited suppliers.`}
          </span>
          {isAdmin && (
            <Link href="/billing" className="shrink-0 underline hover:no-underline font-semibold">
              Upgrade
            </Link>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Suppliers</h1>
        <div className="flex items-center gap-2">
          <a
            href={csvTemplateHref}
            download="supplier-import-template.csv"
            className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" /> Template
          </a>
          <button
            type="button"
            onClick={() => {
              const link = document.createElement("a");
              link.href = "/api/suppliers/export";
              link.download = `suppliers-${new Date().toISOString().split("T")[0]}.csv`;
              link.click();
            }}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          {perms.editSuppliers && (
            <>
              <UpgradePrompt active={atCap} reason={supplierCapBlockReason ?? ""}>
                <button
                  type="button"
                  onClick={atCap ? undefined : () => setIsImportOpen(true)}
                  className={`hidden md:flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors ${atCap ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
                >
                  <Upload className="w-4 h-4" /> Import
                </button>
              </UpgradePrompt>
              <UpgradePrompt active={atCap} reason={supplierCapBlockReason ?? ""}>
                <button
                  type="button"
                  onClick={atCap ? undefined : () => setIsModalOpen(true)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${atCap ? "opacity-50 cursor-not-allowed bg-gray-300 text-gray-500" : "bg-primary text-white hover:bg-primary/90"}`}
                >
                  <Plus className="w-4 h-4" /> Add Supplier
                </button>
              </UpgradePrompt>
            </>
          )}
        </div>
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
        <div className="hidden md:grid md:grid-cols-4 md:gap-3 animate-fade-in-up">
          {[
            { label: "Contracted", value: fmt(currencySymbol, totals.contracted), cls: "text-gray-900" },
            { label: "Paid", value: fmt(currencySymbol, totals.paid), cls: "text-green-700" },
            { label: "Remaining", value: fmt(currencySymbol, totals.remaining), cls: "text-amber-700" },
            { label: "Overdue", value: String(totals.overdue), cls: totals.overdue > 0 ? "text-red-600" : "text-gray-500" },
          ].map(({ label, value, cls }, index) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center min-w-0 transition-all duration-200 hover:shadow-sm hover:border-gray-300"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <p className={`text-xl font-bold ${cls} tabular-nums truncate`}>{value}</p>
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
        <EmptyState
          variant="suppliers"
          title="No suppliers yet"
          description="Add vendors to track bookings and payments"
          actionLabel={perms.editSuppliers ? "Add your first supplier" : undefined}
          onClick={perms.editSuppliers ? () => setIsModalOpen(true) : undefined}
        />
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

      {isImportOpen && (
        <CsvImportModal
          onClose={() => setIsImportOpen(false)}
          onImported={() => {
            setIsImportOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

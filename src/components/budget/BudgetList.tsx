"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Settings, TrendingUp, TrendingDown, DollarSign, PiggyBank, AlertTriangle } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { usePermissions } from "@/hooks/usePermissions";
import { useRefresh } from "@/context/RefreshContext";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface CategoryBreakdown {
  id: string;
  name: string;
  colour: string;
  allocated: number;
  contracted: number;
  paid: number;
  remaining: number;
  isOverBudget: boolean;
  supplierCount: number;
}

interface BudgetSummary {
  totalBudget: number | null;
  totalAllocated: number;
  totalContracted: number;
  totalPaid: number;
  totalRemaining: number;
  categories: CategoryBreakdown[];
  unallocated: {
    contracted: number;
    paid: number;
    supplierCount: number;
  };
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtFloat(n: number) {
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProgressCircle({ percent, colour, size = 80 }: { percent: number; colour: string; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - Math.min(percent, 100) / 100 * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="6"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}

function CategoryCard({ category }: { category: CategoryBreakdown }) {
  const percentUsed = category.allocated > 0 ? (category.paid / category.allocated) * 100 : 0;
  const progressColour = category.isOverBudget
    ? "#ef4444"
    : percentUsed > 90
    ? "#f59e0b"
    : percentUsed > 70
    ? "#eab308"
    : "#22c55e";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-4">
        {/* Progress circle */}
        <div className="relative flex-shrink-0">
          <ProgressCircle percent={percentUsed} colour={progressColour} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-medium text-gray-600">
              {Math.round(percentUsed)}%
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: category.colour }}
            />
            <h3 className="font-medium text-gray-900 truncate">{category.name}</h3>
            {category.isOverBudget && (
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <span className="text-gray-400">Allocated:</span>
              <span className="ml-1 text-gray-700">{fmt(category.allocated)}</span>
            </div>
            <div>
              <span className="text-gray-400">Spent:</span>
              <span className="ml-1 text-gray-700">{fmt(category.paid)}</span>
            </div>
            <div>
              <span className="text-gray-400">Contracted:</span>
              <span className="ml-1 text-gray-700">{fmt(category.contracted)}</span>
            </div>
            <div>
              <span className="text-gray-400">Remaining:</span>
              <span className={`ml-1 ${category.remaining < 0 ? "text-red-600 font-medium" : "text-gray-700"}`}>
                {fmt(category.remaining)}
              </span>
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-400">
            {category.supplierCount} supplier{category.supplierCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(percentUsed, 100)}%`,
            backgroundColor: progressColour,
          }}
        />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────────

export function BudgetList() {
  const { can } = usePermissions();
  const { refreshToken } = useRefresh();
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showStats, setShowStats] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchApi("/api/budget/summary");
      if (!res.ok) {
        throw new Error("Failed to load budget");
      }
      const data = await res.json();
      setSummary(data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load budget. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  usePullToRefresh({ onRefresh: load });

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-100 rounded w-1/4" />
        <div className="h-24 bg-gray-100 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
        {error}
      </div>
    );
  }

  if (!summary) return null;

  const totalBudget = summary.totalBudget;
  const hasBudget = totalBudget !== null;
  const allocatedPercent = hasBudget && totalBudget > 0
    ? (summary.totalAllocated / totalBudget) * 100
    : 0;
  const spentPercent = hasBudget && totalBudget > 0
    ? (summary.totalPaid / totalBudget) * 100
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Budget</h1>
        {can.editBudget && (
          <Link
            href="/settings?tab=categories"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            Manage categories
          </Link>
        )}
      </div>

      {!can.accessBudget && (
        <ReadOnlyBanner message="You have view-only access to budget information." />
      )}

      {/* Summary bar - Mobile collapsible */}
      <div className="flex flex-col gap-2 md:gap-3 mb-4">
        {/* Mobile: Collapsible header */}
        <button
          type="button"
          onClick={() => setShowStats(s => !s)}
          className="md:hidden flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-primary" />
            <span className="text-lg font-bold">
              {hasBudget ? fmt(summary.totalBudget) : "No budget set"}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {summary.categories.length} categories
          </span>
        </button>

        {/* Mobile: Collapsible content */}
        {showStats && (
          <div className="md:hidden flex flex-col gap-2 bg-white rounded-lg border border-gray-200 p-3">
            {hasBudget && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Budget</span>
                <span className="font-medium">{fmt(summary.totalBudget)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Allocated</span>
              <span className="font-medium">{fmt(summary.totalAllocated)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Contracted</span>
              <span className="font-medium">{fmt(summary.totalContracted)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Paid</span>
              <span className="font-medium">{fmt(summary.totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Remaining</span>
              <span className={`font-medium ${summary.totalRemaining < 0 ? "text-red-600" : ""}`}>
                {fmt(summary.totalRemaining)}
              </span>
            </div>
          </div>
        )}

        {/* Desktop: 4-column grid */}
        <div className="hidden md:grid md:grid-cols-4 md:gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              {hasBudget ? "Total Budget" : "Allocated"}
            </div>
            <div className="text-xl font-bold text-gray-900">
              {hasBudget ? fmt(summary.totalBudget) : fmt(summary.totalAllocated)}
            </div>
            {hasBudget && allocatedPercent > 0 && (
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.min(allocatedPercent, 100)}%` }}
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Contracted
            </div>
            <div className="text-xl font-bold text-gray-900">{fmt(summary.totalContracted)}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <TrendingDown className="w-4 h-4" />
              Paid
            </div>
            <div className="text-xl font-bold text-gray-900">{fmt(summary.totalPaid)}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <PiggyBank className="w-4 h-4" />
              Remaining
            </div>
            <div className={`text-xl font-bold ${summary.totalRemaining < 0 ? "text-red-600" : "text-gray-900"}`}>
              {fmt(summary.totalRemaining)}
            </div>
          </div>
        </div>
      </div>

      {/* Set budget prompt (ADMIN only, when no budget set) */}
      {!hasBudget && can.editBudget && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">No total budget set</span>
          </div>
          <p className="text-sm text-amber-700 mt-1">
            Set your overall wedding budget in Settings to see how you&apos;re tracking against your total.
          </p>
          <Link
            href="/settings"
            className="inline-block mt-2 text-sm font-medium text-primary hover:underline"
          >
            Set total budget →
          </Link>
        </div>
      )}

      {/* Categories */}
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
        Budget by Category
      </h2>

      {summary.categories.length === 0 && summary.unallocated.supplierCount === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <PiggyBank className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No categories yet</p>
          {can.editBudget && (
            <Link
              href="/settings?tab=categories"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              Add categories in Settings
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Categories with allocation */}
          {summary.categories.filter(c => c.allocated > 0 || c.supplierCount > 0).map(cat => (
            <CategoryCard key={cat.id} category={cat} />
          ))}

          {/* Categories with no allocation and no suppliers */}
          {summary.categories.filter(c => c.allocated === 0 && c.supplierCount === 0).length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-600">
                {summary.categories.filter(c => c.allocated === 0 && c.supplierCount === 0).length} empty categories
              </summary>
              <div className="mt-2 space-y-2">
                {summary.categories.filter(c => c.allocated === 0 && c.supplierCount === 0).map(cat => (
                  <CategoryCard key={cat.id} category={cat} />
                ))}
              </div>
            </details>
          )}

          {/* Unallocated suppliers */}
          {summary.unallocated.supplierCount > 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Uncategorised Suppliers</span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                {summary.unallocated.supplierCount} supplier{summary.unallocated.supplierCount !== 1 ? "s" : ""} not assigned to a category.
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Contracted:</span>
                  <span className="ml-1">{fmt(summary.unallocated.contracted)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Paid:</span>
                  <span className="ml-1">{fmt(summary.unallocated.paid)}</span>
                </div>
              </div>
              {can.editBudget && (
                <Link
                  href="/suppliers"
                  className="mt-2 inline-block text-sm text-primary hover:underline"
                >
                  Assign to categories →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
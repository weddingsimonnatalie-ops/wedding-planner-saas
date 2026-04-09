"use client";

import { Briefcase } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmt } from "../DashboardClient";

interface DashboardBudgetOverviewProps {
  contracted: number;
  paid: number;
  remaining: number;
  currencySymbol: string;
}

export function DashboardBudgetOverview({
  contracted,
  paid,
  remaining,
  currencySymbol,
}: DashboardBudgetOverviewProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionHeader title="Budget overview" href="/suppliers" />
      <div className="mt-4 space-y-3">
        {[
          { label: "Contracted", value: contracted, cls: "text-gray-900" },
          { label: "Paid",       value: paid,       cls: "text-green-700" },
          { label: "Remaining",  value: remaining,  cls: "text-amber-700" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="flex justify-between items-baseline">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-sm font-semibold tabular-nums ${cls}`}>{fmt(currencySymbol, value)}</span>
          </div>
        ))}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
            style={{ width: `${contracted > 0 ? Math.min(100, (paid / contracted) * 100) : 0}%` }}
          />
        </div>
        {contracted === 0 && (
          <EmptyState
            icon={Briefcase}
            title="No suppliers yet"
            description="Add suppliers to track your budget"
            actionLabel="Add your first supplier"
            href="/suppliers"
          />
        )}
      </div>
    </div>
  );
}
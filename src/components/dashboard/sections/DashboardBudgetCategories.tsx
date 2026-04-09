"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { fmt } from "../DashboardClient";

interface DashboardBudgetCategoriesProps {
  categories: { id: string; name: string; colour: string; allocated: number; paid: number }[];
  currencySymbol: string;
}

export function DashboardBudgetCategories({
  categories,
  currencySymbol,
}: DashboardBudgetCategoriesProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionHeader title="Budget by category" href="/budget" />
      <div className="mt-4 space-y-3">
        {categories.slice(0, 4).map(cat => {
          const percent = cat.allocated > 0 ? Math.min(100, (cat.paid / cat.allocated) * 100) : 0;
          const isOver = cat.paid > cat.allocated && cat.allocated > 0;
          const progressGradient = isOver
            ? "from-red-500 to-red-400"
            : percent > 90
              ? "from-amber-500 to-amber-400"
              : percent > 70
                ? "from-yellow-500 to-yellow-400"
                : "from-green-500 to-green-400";
          return (
            <div key={cat.id} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: cat.colour }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-medium text-gray-800 truncate">{cat.name}</span>
                  <span className={`text-xs tabular-nums ${isOver ? "text-red-600 font-medium" : "text-gray-500"}`}>
                    {fmt(currencySymbol, cat.paid)} / {fmt(currencySymbol, cat.allocated)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${progressGradient} transition-all duration-500`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {categories.length > 4 && (
          <Link href="/budget" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
            View all {categories.length} categories <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
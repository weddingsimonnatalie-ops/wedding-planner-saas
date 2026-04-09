"use client";

import { Users, LayoutGrid, TrendingUp } from "lucide-react";
import { CountdownCard, QuickStat } from "../DashboardClient";

interface DashboardQuickStatsProps {
  weddingDate: string | null;
  timezone: string;
  guestsAccepted: number;
  guestsTotal: number;
  guestsPending: number;
  guestsAssigned: number;
  receptionEligible: number;
  budgetPaid: number;
  budgetContracted: number;
  budgetRemaining: number;
  currencySymbol: string;
  showFinance: boolean;
}

export function DashboardQuickStats({
  weddingDate,
  timezone,
  guestsAccepted,
  guestsTotal,
  guestsPending,
  guestsAssigned,
  receptionEligible,
  budgetPaid,
  budgetContracted,
  budgetRemaining,
  currencySymbol,
  showFinance,
}: DashboardQuickStatsProps) {
  const fmt = (sym: string, n: number) =>
    `${sym}${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className={`grid gap-3 ${showFinance ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
      <CountdownCard weddingDate={weddingDate} timezone={timezone} />
      <QuickStat
        icon={<Users className="w-5 h-5 text-indigo-500" />}
        label="Guests accepted"
        value={`${guestsAccepted} / ${guestsTotal}`}
        sub={guestsTotal > 0 ? `${Math.round(((guestsTotal - guestsPending) / guestsTotal) * 100)}% responded` : "No guests yet"}
        href="/guests"
      />
      <QuickStat
        icon={<LayoutGrid className="w-5 h-5 text-violet-500" />}
        label="Seated"
        value={`${guestsAssigned} / ${receptionEligible}`}
        sub={receptionEligible > 0 ? `${Math.round((guestsAssigned / receptionEligible) * 100)}% assigned` : "No reception guests"}
        href="/seating"
      />
      {showFinance && (
        <QuickStat
          icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
          label="Budget paid"
          value={budgetContracted > 0
            ? `${Math.round((budgetPaid / budgetContracted) * 100)}%`
            : "—"}
          sub={budgetContracted > 0
            ? `${fmt(currencySymbol, budgetRemaining)} remaining`
            : "No suppliers yet"}
          href="/suppliers"
        />
      )}
    </div>
  );
}
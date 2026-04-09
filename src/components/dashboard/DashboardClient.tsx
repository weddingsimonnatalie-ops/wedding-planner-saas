"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fetchApi } from "@/lib/fetch";
import { useWedding } from "@/context/WeddingContext";
import { UserRole } from "@prisma/client";
import { DashboardPresetId, DASHBOARD_PRESETS } from "./DashboardPresets";
import { DashboardQuickStats } from "./sections/DashboardQuickStats";
import { DashboardGuestSummary } from "./sections/DashboardGuestSummary";
import { DashboardBudgetOverview } from "./sections/DashboardBudgetOverview";
import { DashboardBudgetCategories } from "./sections/DashboardBudgetCategories";
import { DashboardMeals } from "./sections/DashboardMeals";
import { DashboardSuppliers } from "./sections/DashboardSuppliers";
import { DashboardPayments } from "./sections/DashboardPayments";
import { DashboardAppointments } from "./sections/DashboardAppointments";
import { DashboardTasks } from "./sections/DashboardTasks";
import { LayoutPicker } from "./LayoutPicker";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashStats {
  wedding: { coupleName: string; weddingDate: string | null; timezone: string };
  guests: { total: number; accepted: number; partial: number; declined: number; pending: number; dietary: number; receptionEligible: number; assigned: number };
  meals: { name: string; count: number }[];
  payments: {
    id: string; label: string; amount: number;
    dueDate: string | null; status: string;
    supplierId: string; supplierName: string;
  }[];
  suppliers: { ENQUIRY: number; QUOTED: number; BOOKED: number; COMPLETE: number; CANCELLED: number };
  budget: { contracted: number; paid: number; remaining: number };
  budgetCategories: { id: string; name: string; colour: string; allocated: number; paid: number }[];
  appointments: {
    id: string; title: string; categoryName: string | null; categoryColour: string | null; date: string;
    location: string | null; supplierId: string | null; supplierName: string | null;
  }[];
  tasks: {
    overdue: number;
    dueSoon: number;
    upcoming: {
      id: string; title: string; priority: string;
      dueDate: string | null; isCompleted: boolean; assignedToName: string | null;
      categoryName: string | null; categoryColour: string | null;
      supplierId: string | null; supplierName: string | null;
    }[];
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardClient({ userName, role, dashboardLayout }: { userName?: string; role?: UserRole; dashboardLayout?: string }) {
  const { currencySymbol } = useWedding();
  const [layout, setLayout] = useState<DashboardPresetId>((dashboardLayout as DashboardPresetId) || "classic");
  const showFinance = role === "ADMIN" || role === "VIEWER" || role === undefined;
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markPaidConfirm, setMarkPaidConfirm] = useState<DashStats["payments"][0] | null>(null);
  const [markDoneConfirm, setMarkDoneConfirm] = useState<DashStats["tasks"]["upcoming"][0] | null>(null);
  const [markApptDoneConfirm, setMarkApptDoneConfirm] = useState<DashStats["appointments"][0] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchApi("/api/dashboard/stats")
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load (${r.status})`);
        return r.json();
      })
      .then(data => { setStats(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleMarkTaskDone(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    if (res.ok) {
      setStats(prev => prev ? {
        ...prev,
        tasks: {
          ...prev.tasks,
          upcoming: prev.tasks.upcoming.filter(t => t.id !== taskId),
          overdue: prev.tasks.upcoming.find(t => t.id === taskId && t.dueDate && new Date(t.dueDate) < new Date())
            ? Math.max(0, prev.tasks.overdue - 1)
            : prev.tasks.overdue,
        },
      } : prev);
    }
  }

  async function handleMarkApptDone(appointmentId: string) {
    const res = await fetch(`/api/appointments/${appointmentId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    if (res.ok) {
      setStats(prev => prev ? {
        ...prev,
        appointments: prev.appointments.filter(a => a.id !== appointmentId),
      } : prev);
    }
  }

  async function handleMarkPaid(paymentId: string, supplierId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/suppliers/${supplierId}/payments/${paymentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID", paidDate: today }),
    });
    if (res.ok) {
      setStats(prev => prev ? {
        ...prev,
        payments: prev.payments.filter(p => p.id !== paymentId),
        budget: {
          ...prev.budget,
          paid: prev.budget.paid + (prev.payments.find(p => p.id === paymentId)?.amount ?? 0),
          remaining: Math.max(0, prev.budget.remaining - (prev.payments.find(p => p.id === paymentId)?.amount ?? 0)),
        },
      } : prev);
    }
  }

  async function handleSendReminder(paymentId: string) {
    await fetch("/api/email/payment-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
  }

  async function handleSendTaskReminder(taskId: string) {
    await fetch("/api/email/task-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
  }

  if (loading) return <DashboardSkeleton />;
  if (error) return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
      Failed to load dashboard: {error}
    </div>
  );
  if (!stats) return null;

  // Helper to format date using user's timezone
  const formatDateWithTimezone = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: stats.wedding.timezone,
      });
    } catch {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  };

  // ── Section registry ───────────────────────────────────────────────────────────
  const sectionRegistry: Record<string, React.ReactNode> = {
    quickStats: (
      <DashboardQuickStats
        weddingDate={stats.wedding.weddingDate}
        timezone={stats.wedding.timezone}
        guestsAccepted={stats.guests.accepted}
        guestsTotal={stats.guests.total}
        guestsPending={stats.guests.pending}
        guestsAssigned={stats.guests.assigned}
        receptionEligible={stats.guests.receptionEligible}
        budgetPaid={stats.budget.paid}
        budgetContracted={stats.budget.contracted}
        budgetRemaining={stats.budget.remaining}
        currencySymbol={currencySymbol}
        showFinance={showFinance}
      />
    ),
    guestSummary: <DashboardGuestSummary total={stats.guests.total} accepted={stats.guests.accepted} partial={stats.guests.partial} declined={stats.guests.declined} pending={stats.guests.pending} dietary={stats.guests.dietary} />,
    budgetOverview: showFinance ? <DashboardBudgetOverview contracted={stats.budget.contracted} paid={stats.budget.paid} remaining={stats.budget.remaining} currencySymbol={currencySymbol} /> : null,
    budgetCategories: showFinance && stats.budgetCategories.length > 0 ? <DashboardBudgetCategories categories={stats.budgetCategories} currencySymbol={currencySymbol} /> : null,
    meals: <DashboardMeals meals={stats.meals} />,
    suppliers: showFinance ? <DashboardSuppliers suppliers={stats.suppliers} /> : null,
    payments: showFinance ? <DashboardPayments payments={stats.payments} currencySymbol={currencySymbol} onMarkPaid={(p) => setMarkPaidConfirm(p)} onSendReminder={handleSendReminder} /> : null,
    appointments: <DashboardAppointments appointments={stats.appointments} onMarkDone={(a) => setMarkApptDoneConfirm({ id: a.id, title: a.title } as DashStats["appointments"][0])} />,
    tasks: <DashboardTasks overdue={stats.tasks.overdue} dueSoon={stats.tasks.dueSoon} upcoming={stats.tasks.upcoming} onMarkDone={(t) => setMarkDoneConfirm({ id: t.id, title: t.title } as DashStats["tasks"]["upcoming"][0])} onSendReminder={handleSendTaskReminder} />,
    countdownHero: <CountdownHeroCard weddingDate={stats.wedding.weddingDate} timezone={stats.wedding.timezone} />,
  };

  return (
    <div className="space-y-6">
      {/* Welcome header + Layout picker */}
      <div className="relative">
        <div className="absolute -left-4 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-primary/40 to-primary/10" />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-0.5">{stats.wedding.coupleName}</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
              Welcome back, {userName ?? "there"}
            </h1>
            {stats.wedding.weddingDate && (
              <p className="text-sm text-primary mt-1 font-medium">
                {formatDateWithTimezone(stats.wedding.weddingDate)}
              </p>
            )}
          </div>
          <LayoutPicker currentLayout={layout} onLayoutChange={setLayout} />
        </div>
      </div>

      {/* Preset-driven rows */}
      {DASHBOARD_PRESETS.find(p => p.id === layout)?.rows.map((row, rowIdx) => {
        const visibleSections = row.sections
          .map(id => ({ id, node: sectionRegistry[id] }))
          .filter(s => s.node !== null && s.node !== undefined);

        if (visibleSections.length === 0) return null;

        const totalCols = row.spans?.reduce((a, b) => a + b, 0) ?? visibleSections.length;
        const gridColsClass = totalCols <= 2 ? "grid-cols-1 lg:grid-cols-2" : `grid-cols-1 lg:grid-cols-${totalCols}`;

        return (
          <div key={rowIdx} className={`animate-fade-in-up stagger-${rowIdx + 1}`}>
            {row.header && (
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 mt-2">
                {row.header}
              </h2>
            )}
            <div className={`grid gap-4 ${gridColsClass}`}>
              {visibleSections.map((s, i) => {
                const span = row.spans?.[row.sections.indexOf(s.id)] ?? 1;
                return (
                  <div key={s.id} className={span > 1 ? `lg:col-span-${span}` : undefined}>
                    {s.node}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Confirm modals */}
      {markDoneConfirm && (
        <ConfirmModal
          message={<span>Mark <strong>{markDoneConfirm.title}</strong> as done?</span>}
          onConfirm={() => { handleMarkTaskDone(markDoneConfirm.id); setMarkDoneConfirm(null); }}
          onCancel={() => setMarkDoneConfirm(null)}
        />
      )}
      {markApptDoneConfirm && (
        <ConfirmModal
          message={<span>Mark <strong>{markApptDoneConfirm.title}</strong> as done?</span>}
          onConfirm={() => { handleMarkApptDone(markApptDoneConfirm.id); setMarkApptDoneConfirm(null); }}
          onCancel={() => setMarkApptDoneConfirm(null)}
        />
      )}
      {markPaidConfirm && (
        <ConfirmModal
          message={
            <span>
              Mark <strong>{markPaidConfirm.supplierName} — {markPaidConfirm.label}</strong>{" "}
              ({fmt(currencySymbol, markPaidConfirm.amount)}) as paid?
            </span>
          }
          onConfirm={() => { handleMarkPaid(markPaidConfirm.id, markPaidConfirm.supplierId); setMarkPaidConfirm(null); }}
          onCancel={() => setMarkPaidConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

export function CountdownCard({ weddingDate, timezone }: { weddingDate: string | null; timezone: string }) {
  // Calculate days until wedding using the user's timezone
  const days = weddingDate
    ? (() => {
        try {
          // Get current date in the user's timezone
          const now = new Date();
          const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone }); // en-CA gives YYYY-MM-DD
          const today = new Date(todayStr + "T00:00:00");

          // Parse wedding date and set to midnight in user's timezone
          const weddingStr = new Date(weddingDate).toLocaleDateString("en-CA", { timeZone: timezone });
          const wedding = new Date(weddingStr + "T00:00:00");

          const diffMs = wedding.getTime() - today.getTime();
          return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        } catch {
          // Fallback to UTC if timezone is invalid
          const wedding = new Date(weddingDate);
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const weddingMidnight = new Date(Date.UTC(
            wedding.getUTCFullYear(),
            wedding.getUTCMonth(),
            wedding.getUTCDate()
          ));
          return Math.ceil((weddingMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
      })()
    : null;

  // Calculate progress (days elapsed / typical 365-day planning period)
  const planningDays = 365;
  const daysElapsed = weddingDate
    ? Math.max(0, planningDays - (days ?? 0))
    : 0;
  const progress = Math.min(100, (daysElapsed / planningDays) * 100);

  // SVG circle calculations
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Format wedding date for display using user's timezone
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: timezone,
      });
    } catch {
      // Fallback to UTC if timezone is invalid
      return new Date(dateStr).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  };

  return (
    <div className="bg-gradient-to-br from-primary/5 to-white rounded-xl border border-primary/10 p-4 md:p-5 flex items-center gap-3 md:gap-4 relative overflow-hidden">
      {/* Subtle decorative element */}
      <div className="absolute -top-6 -right-6 w-20 h-20 bg-primary/5 rounded-full blur-xl" />

      {/* Circular progress ring - smaller on mobile */}
      <div className="relative shrink-0">
        <svg
          className="w-14 h-14 md:w-20 md:h-20 -rotate-90"
          viewBox="0 0 96 96"
        >
          {/* Background circle */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="none"
            className="text-gray-100"
          />
          {/* Progress circle */}
          {days !== null && days > 0 && (
            <circle
              cx="48"
              cy="48"
              r={radius}
              stroke="hsl(var(--primary))"
              strokeWidth="6"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          )}
        </svg>
        {/* Heart icon in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Heart className={`w-5 h-5 md:w-6 md:h-6 text-primary fill-primary/20 ${days !== null && days > 0 ? 'animate-pulse-heart' : ''}`} />
        </div>
      </div>

      {/* Text content */}
      <div className="min-w-0 relative z-10">
        <p className="text-xs text-gray-500">Wedding day</p>
        {days === null ? (
          <Link href="/settings" className="text-sm text-primary hover:underline font-medium">
            Set date in Settings
          </Link>
        ) : days > 0 ? (
          <>
            <p className="text-2xl md:text-3xl font-bold text-primary leading-none mt-0.5">
              {days}
              <span className="text-sm font-normal text-gray-500 ml-1">days</span>
            </p>
            {weddingDate && (
              <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
                {formatDate(weddingDate)}
              </p>
            )}
          </>
        ) : days === 0 ? (
          <p className="text-lg md:text-xl font-bold text-primary">Today! 🎉</p>
        ) : (
          <p className="text-lg font-medium text-gray-500">{Math.abs(days)} days ago</p>
        )}
      </div>
    </div>
  );
}

function CountdownHeroCard({ weddingDate, timezone }: { weddingDate: string | null; timezone: string }) {
  const days = weddingDate
    ? (() => {
        try {
          const now = new Date();
          const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
          const today = new Date(todayStr + "T00:00:00");
          const weddingStr = new Date(weddingDate).toLocaleDateString("en-CA", { timeZone: timezone });
          const wedding = new Date(weddingStr + "T00:00:00");
          const diffMs = wedding.getTime() - today.getTime();
          return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        } catch {
          const wedding = new Date(weddingDate);
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const weddingMidnight = new Date(Date.UTC(wedding.getUTCFullYear(), wedding.getUTCMonth(), wedding.getUTCDate()));
          return Math.ceil((weddingMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
      })()
    : null;

  return (
    <div className="bg-gradient-to-br from-primary/5 to-white rounded-xl border border-primary/10 p-6 flex flex-col items-center justify-center text-center min-h-[180px]">
      <Heart className="w-8 h-8 text-primary fill-primary/20 mb-3" />
      {days === null ? (
        <Link href="/settings" className="text-sm text-primary hover:underline font-medium">
          Set date in Settings
        </Link>
      ) : days > 0 ? (
        <>
          <p className="text-4xl md:text-5xl font-bold text-primary leading-none">
            {days}
          </p>
          <p className="text-sm text-gray-500 mt-1">days to go</p>
        </>
      ) : days === 0 ? (
        <p className="text-2xl font-bold text-primary">Today!</p>
      ) : (
        <p className="text-lg font-medium text-gray-500">{Math.abs(days)} days ago</p>
      )}
    </div>
  );
}

export function QuickStat({ icon, label, value, sub, href }: {
  icon: React.ReactNode; label: string; value: string; sub: string; href: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3
        md:hover:shadow-md md:hover:-translate-y-0.5 md:hover:border-primary/20
        transition-all duration-200 active:bg-gray-50 md:active:bg-white"
    >
      <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center shrink-0
        md:group-hover:scale-110 transition-transform duration-200">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-none mt-0.5 tabular-nums">{value}</p>
        <p className="text-xs text-gray-400 truncate">{sub}</p>
      </div>
    </Link>
  );
}

export function MealBars({ meals }: { meals: { name: string; count: number }[] }) {
  const max = Math.max(...meals.map(m => m.count), 1);
  const colors = [
    "from-indigo-500 to-indigo-400",
    "from-violet-500 to-violet-400",
    "from-pink-500 to-pink-400",
    "from-amber-500 to-amber-400",
    "from-teal-500 to-teal-400",
  ];
  return (
    <div className="space-y-2.5">
      {meals.map((m, i) => (
        <div key={m.name} className="flex items-center gap-3">
          <p className="text-xs text-gray-600 w-32 truncate shrink-0">{m.name}</p>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${colors[i % colors.length]} transition-all duration-500`}
              style={{ width: `${(m.count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 w-5 text-right shrink-0 tabular-nums">{m.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart (pure SVG) ────────────────────────────────────────────────────

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-64 bg-gray-200 rounded mb-1.5" />
        <div className="h-4 w-40 bg-gray-100 rounded" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 h-48" />
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-48" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 h-40" />
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-40" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 h-48" />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmt(symbol: string, n: number) {
  return symbol + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const SUPPLIER_STATUS: Record<string, { label: string; cls: string }> = {
  ENQUIRY:   { label: "Enquiry",   cls: "bg-gray-100 text-gray-700" },
  QUOTED:    { label: "Quoted",    cls: "bg-blue-100 text-blue-700" },
  BOOKED:    { label: "Booked",    cls: "bg-green-100 text-green-700" },
  COMPLETE:  { label: "Complete",  cls: "bg-purple-100 text-purple-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
};

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Heart, Clock, AlertCircle, Check, Mail, TrendingUp,
  Users, LayoutGrid, ArrowRight, CalendarDays, MapPin, CheckSquare,
  Briefcase, Utensils,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fetchApi } from "@/lib/fetch";
import { useWedding } from "@/context/WeddingContext";
import { UserRole } from "@prisma/client";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

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
    }[];
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardClient({ userName, role }: { userName?: string; role?: UserRole }) {
  const { currencySymbol } = useWedding();
  const showFinance = role === "ADMIN" || role === "VIEWER" || role === undefined;
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markPaidConfirm, setMarkPaidConfirm] = useState<DashStats["payments"][0] | null>(null);
  const [markDoneConfirm, setMarkDoneConfirm] = useState<DashStats["tasks"]["upcoming"][0] | null>(null);

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

  async function handleMarkDone(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: true }),
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

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="relative">
        {/* Decorative accent line */}
        <div className="absolute -left-4 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-primary/40 to-primary/10" />
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

      {/* Row 1 — quick-stat cards */}
      <div className={`grid gap-3 animate-fade-in-up stagger-1 ${showFinance ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
        <CountdownCard weddingDate={stats.wedding.weddingDate} timezone={stats.wedding.timezone} />
        <QuickStat
          icon={<Users className="w-5 h-5 text-indigo-500" />}
          label="Guests accepted"
          value={`${stats.guests.accepted} / ${stats.guests.total}`}
          sub={stats.guests.total > 0 ? `${Math.round(((stats.guests.total - stats.guests.pending) / stats.guests.total) * 100)}% responded` : "No guests yet"}
          href="/guests"
        />
        <QuickStat
          icon={<LayoutGrid className="w-5 h-5 text-violet-500" />}
          label="Seated"
          value={`${stats.guests.assigned} / ${stats.guests.receptionEligible}`}
          sub={stats.guests.receptionEligible > 0 ? `${Math.round((stats.guests.assigned / stats.guests.receptionEligible) * 100)}% assigned` : "No reception guests"}
          href="/seating"
        />
        {showFinance && (
          <QuickStat
            icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
            label="Budget paid"
            value={stats.budget.contracted > 0
              ? `${Math.round((stats.budget.paid / stats.budget.contracted) * 100)}%`
              : "—"}
            sub={stats.budget.contracted > 0
              ? `${fmt(currencySymbol, stats.budget.remaining)} remaining`
              : "No suppliers yet"}
            href="/suppliers"
          />
        )}
      </div>

      {/* Row 2 — Guest breakdown + Budget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in-up stagger-2">
        {/* Guest summary */}
        <div className={`${showFinance ? "lg:col-span-2" : "lg:col-span-3"} bg-white rounded-xl border border-gray-200 p-5`}>
          <SectionHeader title="Guest summary" href="/guests" />
          <div className="mt-4">
            <p className="text-2xl font-bold text-gray-900 mb-4">
              {stats.guests.total}{" "}
              <span className="text-sm font-normal text-gray-400">guests</span>
            </p>
            <div className="space-y-1">
              {[
                { label: "Accepted", value: stats.guests.accepted, dotClass: "bg-green-500", barClass: "from-green-500 to-green-400", filter: "status=ACCEPTED" },
                { label: "Partial",  value: stats.guests.partial,  dotClass: "bg-orange-500", barClass: "from-orange-500 to-orange-400", filter: "status=PARTIAL" },
                { label: "Declined", value: stats.guests.declined, dotClass: "bg-red-500", barClass: "from-red-500 to-red-400", filter: "status=DECLINED" },
                { label: "Pending",  value: stats.guests.pending,  dotClass: "bg-amber-500", barClass: "from-amber-500 to-amber-400", filter: "status=PENDING" },
                { label: "Dietary req.", value: stats.guests.dietary, dotClass: "bg-purple-500", barClass: "from-purple-500 to-purple-400", filter: "dietary=has_notes" },
              ].map(({ label, value, dotClass, barClass, filter }) => (
                <Link
                  key={label}
                  href={`/guests?${filter}`}
                  className="flex items-center gap-3 group -mx-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-all duration-200"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass} group-hover:scale-110 transition-transform`} />
                  <span className="text-xs text-gray-500 w-14 shrink-0 group-hover:text-gray-900 font-medium transition-colors">{label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden group-hover:bg-gray-200 transition-colors">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-all duration-300 group-hover:shadow-sm`}
                      style={{ width: stats.guests.total > 0 ? `${(value / stats.guests.total) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 w-5 text-right tabular-nums group-hover:text-primary transition-colors">{value}</span>
                  <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 opacity-0 group-hover:opacity-100" />
                </Link>
              ))}
            </div>
            {stats.guests.total === 0 && (
              <EmptyState
                icon={Users}
                title="No guests yet"
                description="Start building your guest list to track RSVPs"
                actionLabel="Add your first guest"
                href="/guests"
              />
            )}
          </div>
        </div>

        {/* Budget overview */}
        {showFinance && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader title="Budget overview" href="/suppliers" />
            <div className="mt-4 space-y-3">
              {[
                { label: "Contracted", value: stats.budget.contracted, cls: "text-gray-900" },
                { label: "Paid",       value: stats.budget.paid,       cls: "text-green-700" },
                { label: "Remaining",  value: stats.budget.remaining,  cls: "text-amber-700" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className={`text-sm font-semibold tabular-nums ${cls}`}>{fmt(currencySymbol, value)}</span>
                </div>
              ))}
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                  style={{ width: `${stats.budget.contracted > 0 ? Math.min(100, (stats.budget.paid / stats.budget.contracted) * 100) : 0}%` }}
                />
              </div>
              {stats.budget.contracted === 0 && (
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
        )}
      </div>

      {/* Row 3 — Meals + Supplier status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in-up stagger-3">
        {/* Meal choices */}
        <div className={`${showFinance ? "lg:col-span-2" : "lg:col-span-3"} bg-white rounded-xl border border-gray-200 p-5`}>
          <SectionHeader title="Meal choices" href="/guests" />
          <div className="mt-4">
            {stats.meals.length === 0 ? (
              <EmptyState
                icon={Utensils}
                title="No meal choices yet"
                description="Meal selections will appear as guests RSVP"
              />
            ) : (
              <MealBars meals={stats.meals} />
            )}
          </div>
        </div>

        {/* Supplier status */}
        {showFinance && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader title="Suppliers" href="/suppliers" />
            <div className="mt-4 space-y-1">
              {(["BOOKED", "QUOTED", "ENQUIRY", "COMPLETE", "CANCELLED"] as const).map(status => {
                const count = stats.suppliers[status];
                const cfg = SUPPLIER_STATUS[status];
                if (count === 0) return null;
                return (
                  <Link
                    key={status}
                    href={`/suppliers?status=${status}`}
                    className="flex items-center justify-between group -mx-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-all duration-200"
                  >
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls} group-hover:shadow-sm transition-shadow`}>
                      {cfg.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">{count}</span>
                      <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 opacity-0 group-hover:opacity-100" />
                    </div>
                  </Link>
                );
              })}
              {Object.values(stats.suppliers).every(v => v === 0) && (
                <EmptyState
                  icon={Briefcase}
                  title="No suppliers yet"
                  description="Track your vendors and bookings"
                  actionLabel="Add your first supplier"
                  href="/suppliers"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Row 3.5 — Budget categories (admin only) */}
      {showFinance && stats.budgetCategories.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 animate-fade-in-up stagger-4">
          <SectionHeader title="Budget by category" href="/budget" />
          <div className="mt-4 space-y-3">
            {stats.budgetCategories.slice(0, 4).map(cat => {
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
            {stats.budgetCategories.length > 4 && (
              <Link href="/budget" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                View all {stats.budgetCategories.length} categories <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Row 4 — Upcoming payments (full width, admin only) */}
      {showFinance && <div className="bg-white rounded-xl border border-gray-200 animate-fade-in-up stagger-5">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">Upcoming &amp; overdue payments</p>
          </div>
          <Link href="/payments" className="text-xs text-primary hover:underline flex items-center gap-1">
            All payments <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {stats.payments.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No payments due in the next 60 days</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats.payments.map(p => {
              const overdue = p.status === "OVERDUE";
              const due = p.dueDate
                ? new Date(p.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : "No date set";
              return (
                <div key={p.id} className={`px-5 py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap ${overdue ? "bg-red-50/40" : ""}`}>
                  <div className="shrink-0">
                    {overdue
                      ? <AlertCircle className="w-4 h-4 text-red-500" />
                      : <Clock className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {p.supplierName} — {p.label}
                    </p>
                    <p className={`text-xs ${overdue ? "text-red-600" : "text-gray-500"}`}>
                      {overdue ? "Overdue · " : "Due "}
                      {due}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 shrink-0">{fmt(currencySymbol, p.amount)}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setMarkPaidConfirm(p)}
                      className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                    >
                      <Check className="w-3 h-3" /> Mark as Paid
                    </button>
                    <button
                      onClick={() => handleSendReminder(p.id)}
                      title="Send reminder email"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      href={`/suppliers/${p.supplierId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* Row 5 — Upcoming appointments (full width) */}
      <div className="bg-white rounded-xl border border-gray-200 animate-fade-in-up stagger-5">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">Upcoming appointments</p>
          </div>
          <Link href="/appointments" className="text-xs text-primary hover:underline flex items-center gap-1">
            All appointments <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {stats.appointments.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No upcoming appointments in the next 60 days</p>
            <Link href="/appointments" className="text-xs text-primary hover:underline mt-1 inline-block">
              Add an appointment
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats.appointments.map(a => {
              const dateStr = new Date(a.date).toLocaleDateString("en-GB", {
                weekday: "short", day: "numeric", month: "short",
              }) + " at " + new Date(a.date).toLocaleTimeString("en-GB", {
                hour: "numeric", minute: "2-digit", hour12: true,
              });
              return (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <div className="shrink-0">
                    <CalendarDays className="w-4 h-4 text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.title}</p>
                      {a.categoryName && a.categoryColour && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 border"
                          style={{ color: a.categoryColour, borderColor: a.categoryColour, backgroundColor: "transparent" }}
                        >
                          {a.categoryName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{dateStr}</p>
                    {a.location && (
                      <p className="text-xs text-gray-400 flex items-center gap-0.5 mt-0.5">
                        <MapPin className="w-3 h-3" />{a.location}
                      </p>
                    )}
                  </div>
                  {a.supplierName && a.supplierId && (
                    <Link
                      href={`/suppliers/${a.supplierId}`}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      {a.supplierName}
                    </Link>
                  )}
                  <Link
                    href="/appointments"
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    View
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Row 6 — Upcoming tasks (full width, all roles) */}
      <div className="bg-white rounded-xl border border-gray-200 animate-fade-in-up stagger-6">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">Upcoming tasks</p>
            {(stats.tasks.overdue > 0 || stats.tasks.dueSoon > 0) && (
              <span className="text-xs text-gray-400">
                {stats.tasks.overdue > 0 && (
                  <span className="text-red-600 font-medium">{stats.tasks.overdue} overdue</span>
                )}
                {stats.tasks.overdue > 0 && stats.tasks.dueSoon > 0 && " · "}
                {stats.tasks.dueSoon > 0 && `${stats.tasks.dueSoon} due soon`}
              </span>
            )}
          </div>
          <Link href="/tasks" className="text-xs text-primary hover:underline flex items-center gap-1">
            All tasks <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {stats.tasks.upcoming.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-400">No upcoming tasks — you&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats.tasks.upcoming.map(t => {
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              const dueDate = t.dueDate ? new Date(t.dueDate) : null;
              if (dueDate) dueDate.setHours(0, 0, 0, 0);
              const diffDays = dueDate
                ? Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const isOverdue = diffDays !== null && diffDays < 0;

              let dueLabel: string | null = null;
              let dueCls = "text-gray-500";
              if (diffDays !== null) {
                if (diffDays < 0) {
                  const n = Math.abs(diffDays);
                  dueLabel = `${n} day${n !== 1 ? "s" : ""} overdue`;
                  dueCls = "text-red-600 font-medium";
                } else if (diffDays === 0) {
                  dueLabel = "Due today";
                  dueCls = "text-amber-600 font-medium";
                } else if (diffDays === 1) {
                  dueLabel = "Due tomorrow";
                  dueCls = "text-amber-600 font-medium";
                } else {
                  dueLabel = "Due " + dueDate!.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                }
              }

              const dotCls =
                t.priority === "HIGH"   ? "bg-red-500" :
                t.priority === "MEDIUM" ? "bg-amber-400" : "bg-gray-400";
              return (
                <div key={t.id} className={`px-5 py-3 ${isOverdue ? "bg-red-50/40" : ""}`}>
                  {/* Content row */}
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      {isOverdue
                        ? <AlertCircle className="w-4 h-4 text-red-500" />
                        : <span className={`inline-block w-2 h-2 rounded-full mt-1 ${dotCls}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isOverdue ? "text-red-700" : "text-gray-800"}`}>
                        {t.title}
                      </p>
                      {dueLabel && (
                        <p className={`text-xs ${dueCls}`}>{dueLabel}</p>
                      )}
                      {t.assignedToName && (
                        <p className="text-xs text-gray-400">{t.assignedToName}</p>
                      )}
                    </div>
                  </div>
                  {/* Action row — always on its own line, never overlaps */}
                  <div className="flex items-center gap-2 mt-2 justify-end">
                    <button
                      onClick={() => setMarkDoneConfirm(t)}
                      className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                    >
                      <Check className="w-3 h-3" /> Mark as Done
                    </button>
                    <button
                      onClick={() => handleSendTaskReminder(t.id)}
                      title="Send reminder email"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      href="/tasks"
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {markDoneConfirm && (
        <ConfirmModal
          message={
            <span>Mark <strong>{markDoneConfirm.title}</strong> as done?</span>
          }
          onConfirm={() => {
            handleMarkDone(markDoneConfirm.id);
            setMarkDoneConfirm(null);
          }}
          onCancel={() => setMarkDoneConfirm(null)}
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
          onConfirm={() => {
            handleMarkPaid(markPaidConfirm.id, markPaidConfirm.supplierId);
            setMarkPaidConfirm(null);
          }}
          onCancel={() => setMarkPaidConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

function CountdownCard({ weddingDate, timezone }: { weddingDate: string | null; timezone: string }) {
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

function QuickStat({ icon, label, value, sub, href }: {
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

function MealBars({ meals }: { meals: { name: string; count: number }[] }) {
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

function fmt(symbol: string, n: number) {
  return symbol + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SUPPLIER_STATUS: Record<string, { label: string; cls: string }> = {
  ENQUIRY:   { label: "Enquiry",   cls: "bg-gray-100 text-gray-700" },
  QUOTED:    { label: "Quoted",    cls: "bg-blue-100 text-blue-700" },
  BOOKED:    { label: "Booked",    cls: "bg-green-100 text-green-700" },
  COMPLETE:  { label: "Complete",  cls: "bg-purple-100 text-purple-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
};

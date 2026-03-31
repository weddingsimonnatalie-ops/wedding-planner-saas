"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Heart, Clock, AlertCircle, Check, Mail, TrendingUp,
  Users, LayoutGrid, ArrowRight, CalendarDays, MapPin, CheckSquare,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fetchApi } from "@/lib/fetch";
import { UserRole } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashStats {
  wedding: { coupleName: string; weddingDate: string | null };
  guests: { total: number; accepted: number; partial: number; declined: number; pending: number; maybe: number; receptionEligible: number; assigned: number };
  meals: { name: string; count: number }[];
  payments: {
    id: string; label: string; amount: number;
    dueDate: string | null; status: string;
    supplierId: string; supplierName: string;
  }[];
  suppliers: { ENQUIRY: number; QUOTED: number; BOOKED: number; COMPLETE: number; CANCELLED: number };
  budget: { contracted: number; paid: number; remaining: number };
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
  const showFinance = role === "ADMIN" || role === "VIEWER" || role === undefined;
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markPaidConfirm, setMarkPaidConfirm] = useState<DashStats["payments"][0] | null>(null);

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

  if (loading) return <DashboardSkeleton />;
  if (error) return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
      Failed to load dashboard: {error}
    </div>
  );
  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome back, {userName ?? "there"} 👋
        </h1>
        <p className="text-gray-500 mt-0.5 text-sm">{stats.wedding.coupleName} planning dashboard</p>
      </div>

      {/* Row 1 — quick-stat cards */}
      <div className={`grid gap-3 ${showFinance ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
        <CountdownCard weddingDate={stats.wedding.weddingDate} />
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
              ? `${fmt(stats.budget.remaining)} remaining`
              : "No suppliers yet"}
            href="/suppliers"
          />
        )}
      </div>

      {/* Row 2 — Guest breakdown + Budget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Guest donut */}
        <div className={`${showFinance ? "lg:col-span-2" : "lg:col-span-3"} bg-white rounded-xl border border-gray-200 p-5`}>
          <SectionHeader title="Guest summary" href="/guests" />
          <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
            <DonutChart
              segments={[
                { label: "Accepted", value: stats.guests.accepted, color: "#22c55e" },
                { label: "Partial",  value: stats.guests.partial,  color: "#f97316" },
                { label: "Declined", value: stats.guests.declined, color: "#ef4444" },
                { label: "Pending",  value: stats.guests.pending,  color: "#f59e0b" },
                { label: "Maybe",    value: stats.guests.maybe,    color: "#94a3b8" },
              ]}
              total={stats.guests.total}
            />
            <div className="flex flex-col gap-2 text-sm min-w-0">
              {[
                { label: "Accepted", value: stats.guests.accepted, color: "bg-green-500" },
                { label: "Partial",  value: stats.guests.partial,  color: "bg-orange-400" },
                { label: "Declined", value: stats.guests.declined, color: "bg-red-500" },
                { label: "Pending",  value: stats.guests.pending,  color: "bg-amber-400" },
                { label: "Maybe",    value: stats.guests.maybe,    color: "bg-slate-300" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${color}`} />
                  <span className="text-gray-600 w-16">{label}</span>
                  <span className="font-semibold text-gray-900">{value}</span>
                </div>
              ))}
              {stats.guests.total === 0 && (
                <Link href="/guests" className="text-xs text-primary hover:underline mt-1">
                  Add your first guest →
                </Link>
              )}
            </div>
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
                  <span className={`text-sm font-semibold ${cls}`}>{fmt(value)}</span>
                </div>
              ))}
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${stats.budget.contracted > 0 ? Math.min(100, (stats.budget.paid / stats.budget.contracted) * 100) : 0}%` }}
                />
              </div>
              {stats.budget.contracted === 0 && (
                <Link href="/suppliers" className="text-xs text-primary hover:underline block mt-1">
                  Add your first supplier →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Row 3 — Meals + Supplier status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Meal choices */}
        <div className={`${showFinance ? "lg:col-span-2" : "lg:col-span-3"} bg-white rounded-xl border border-gray-200 p-5`}>
          <SectionHeader title="Meal choices" href="/guests" />
          <div className="mt-4">
            {stats.meals.length === 0 ? (
              <p className="text-sm text-gray-400">
                No meal data yet — choices are recorded when guests RSVP.
              </p>
            ) : (
              <MealBars meals={stats.meals} />
            )}
          </div>
        </div>

        {/* Supplier status */}
        {showFinance && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader title="Suppliers" href="/suppliers" />
            <div className="mt-4 space-y-2">
              {(["BOOKED", "QUOTED", "ENQUIRY", "COMPLETE", "CANCELLED"] as const).map(status => {
                const count = stats.suppliers[status];
                const cfg = SUPPLIER_STATUS[status];
                if (count === 0) return null;
                return (
                  <div key={status} className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{count}</span>
                  </div>
                );
              })}
              {Object.values(stats.suppliers).every(v => v === 0) && (
                <Link href="/suppliers" className="text-xs text-primary hover:underline block">
                  Add your first supplier →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Row 4 — Upcoming payments (full width, admin only) */}
      {showFinance && <div className="bg-white rounded-xl border border-gray-200">
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
                  <p className="text-sm font-semibold text-gray-800 shrink-0">{fmt(p.amount)}</p>
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
      <div className="bg-white rounded-xl border border-gray-200">
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Row 6 — Upcoming tasks (full width, all roles) */}
      <div className="bg-white rounded-xl border border-gray-200">
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
                <div key={t.id} className={`px-5 py-3 flex items-center gap-3 ${isOverdue ? "bg-red-50/40" : ""}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isOverdue ? "text-red-700" : "text-gray-800"}`}>
                      {t.title}
                    </p>
                    {t.assignedToName && (
                      <p className="text-xs text-gray-400">{t.assignedToName}</p>
                    )}
                  </div>
                  {dueLabel && (
                    <p className={`text-xs shrink-0 ${dueCls}`}>{dueLabel}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {markPaidConfirm && (
        <ConfirmModal
          message={
            <span>
              Mark <strong>{markPaidConfirm.supplierName} — {markPaidConfirm.label}</strong>{" "}
              ({fmt(markPaidConfirm.amount)}) as paid?
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

function CountdownCard({ weddingDate }: { weddingDate: string | null }) {
  const days = weddingDate
    ? Math.ceil((new Date(weddingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
        <Heart className="w-5 h-5 text-primary fill-primary/20" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">Wedding day</p>
        {days === null ? (
          <Link href="/settings" className="text-xs text-primary hover:underline">Set date in Settings</Link>
        ) : days > 0 ? (
          <p className="text-xl font-bold text-primary leading-none mt-0.5">{days} <span className="text-sm font-normal text-gray-500">days</span></p>
        ) : days === 0 ? (
          <p className="text-sm font-bold text-primary">Today! 🎉</p>
        ) : (
          <p className="text-sm font-medium text-gray-500">{Math.abs(days)} days ago</p>
        )}
      </div>
    </div>
  );
}

function QuickStat({ icon, label, value, sub, href }: {
  icon: React.ReactNode; label: string; value: string; sub: string; href: string;
}) {
  return (
    <Link href={href} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
      <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-none mt-0.5">{value}</p>
        <p className="text-xs text-gray-400 truncate">{sub}</p>
      </div>
    </Link>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <Link href={href} className="text-xs text-gray-400 hover:text-primary flex items-center gap-0.5">
        View all <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function MealBars({ meals }: { meals: { name: string; count: number }[] }) {
  const max = Math.max(...meals.map(m => m.count), 1);
  const colors = ["bg-indigo-500", "bg-violet-500", "bg-pink-500", "bg-amber-500", "bg-teal-500"];
  return (
    <div className="space-y-2.5">
      {meals.map((m, i) => (
        <div key={m.name} className="flex items-center gap-3">
          <p className="text-xs text-gray-600 w-32 truncate shrink-0">{m.name}</p>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${colors[i % colors.length]} transition-all`}
              style={{ width: `${(m.count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 w-5 text-right shrink-0">{m.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart (pure SVG) ────────────────────────────────────────────────────

function DonutChart({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  const r = 52;
  const cx = 68;
  const cy = 68;
  const circum = 2 * Math.PI * r;

  let cumulative = 0;

  return (
    <svg width={136} height={136} className="shrink-0" aria-label="Guest RSVP breakdown">
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={20} />
      {total > 0 && segments.map((seg, i) => {
        if (seg.value === 0) return null;
        const pct = seg.value / total;
        const dashLen = pct * circum;
        const dashOffset = -(cumulative * circum);
        cumulative += pct;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={20}
            strokeDasharray={`${dashLen} ${circum}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      {/* Center */}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#111827" fontSize="24" fontWeight="700">{total}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#9ca3af" fontSize="11">guests</text>
    </svg>
  );
}

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

function fmt(n: number) {
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SUPPLIER_STATUS: Record<string, { label: string; cls: string }> = {
  ENQUIRY:   { label: "Enquiry",   cls: "bg-gray-100 text-gray-700" },
  QUOTED:    { label: "Quoted",    cls: "bg-blue-100 text-blue-700" },
  BOOKED:    { label: "Booked",    cls: "bg-green-100 text-green-700" },
  COMPLETE:  { label: "Complete",  cls: "bg-purple-100 text-purple-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
};

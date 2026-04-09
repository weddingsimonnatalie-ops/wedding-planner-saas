"use client";

import Link from "next/link";
import { Clock, AlertCircle, Check, Mail } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { fmt } from "../DashboardClient";

interface PaymentItem {
  id: string;
  label: string;
  amount: number;
  dueDate: string | null;
  status: string;
  supplierId: string;
  supplierName: string;
}

interface DashboardPaymentsProps {
  payments: PaymentItem[];
  currencySymbol: string;
  onMarkPaid: (payment: PaymentItem) => void;
  onSendReminder: (paymentId: string) => void;
}

export function DashboardPayments({
  payments,
  currencySymbol,
  onMarkPaid,
  onSendReminder,
}: DashboardPaymentsProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 animate-fade-in-up stagger-5">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">Upcoming &amp; overdue payments</p>
        </div>
        <Link href="/payments" className="text-xs text-primary hover:underline flex items-center gap-1">
          All payments <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {payments.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No payments due in the next 60 days</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {payments.map(p => {
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
                    onClick={() => onMarkPaid(p)}
                    className="flex items-center gap-1 px-2.5 py-1 min-h-[44px] bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                  >
                    <Check className="w-3 h-3" /> Mark as Paid
                  </button>
                  <button
                    onClick={() => onSendReminder(p.id)}
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
    </div>
  );
}
"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Users } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

interface DashboardGuestSummaryProps {
  total: number;
  accepted: number;
  partial: number;
  declined: number;
  pending: number;
  dietary: number;
}

export function DashboardGuestSummary({
  total,
  accepted,
  partial,
  declined,
  pending,
  dietary,
}: DashboardGuestSummaryProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionHeader title="Guest summary" href="/guests" />
      <div className="mt-4">
        <p className="text-2xl font-bold text-gray-900 mb-4">
          {total}{" "}
          <span className="text-sm font-normal text-gray-400">guests</span>
        </p>
        <div className="space-y-1">
          {[
            { label: "Accepted", value: accepted, dotClass: "bg-green-500", barClass: "from-green-500 to-green-400", filter: "status=ACCEPTED" },
            { label: "Partial",  value: partial,  dotClass: "bg-orange-500", barClass: "from-orange-500 to-orange-400", filter: "status=PARTIAL" },
            { label: "Declined", value: declined, dotClass: "bg-red-500", barClass: "from-red-500 to-red-400", filter: "status=DECLINED" },
            { label: "Pending",  value: pending,  dotClass: "bg-amber-500", barClass: "from-amber-500 to-amber-400", filter: "status=PENDING" },
            { label: "Dietary req.", value: dietary, dotClass: "bg-purple-500", barClass: "from-purple-500 to-purple-400", filter: "dietary=has_notes" },
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
                  style={{ width: total > 0 ? `${(value / total) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-900 w-5 text-right tabular-nums group-hover:text-primary transition-colors">{value}</span>
              <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 opacity-0 group-hover:opacity-100" />
            </Link>
          ))}
        </div>
        {total === 0 && (
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
  );
}
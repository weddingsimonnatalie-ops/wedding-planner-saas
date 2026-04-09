"use client";

import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SUPPLIER_STATUS } from "../DashboardClient";

interface DashboardSuppliersProps {
  suppliers: { ENQUIRY: number; QUOTED: number; BOOKED: number; COMPLETE: number; CANCELLED: number };
}

export function DashboardSuppliers({ suppliers }: DashboardSuppliersProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionHeader title="Suppliers" href="/suppliers" />
      <div className="mt-4 space-y-1">
        {(["BOOKED", "QUOTED", "ENQUIRY", "COMPLETE", "CANCELLED"] as const).map(status => {
          const count = suppliers[status];
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
        {Object.values(suppliers).every(v => v === 0) && (
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
  );
}
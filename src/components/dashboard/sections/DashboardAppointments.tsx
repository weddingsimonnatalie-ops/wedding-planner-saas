"use client";

import Link from "next/link";
import { CalendarDays, Check, MapPin } from "lucide-react";
import { ArrowRight } from "lucide-react";

interface AppointmentItem {
  id: string;
  title: string;
  categoryName: string | null;
  categoryColour: string | null;
  date: string;
  location: string | null;
  supplierId: string | null;
  supplierName: string | null;
}

interface DashboardAppointmentsProps {
  appointments: AppointmentItem[];
  onMarkDone: (appointment: { id: string; title: string }) => void;
}

export function DashboardAppointments({
  appointments,
  onMarkDone,
}: DashboardAppointmentsProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-semibold text-gray-800">Appointments</p>
          {appointments.length > 0 && (
            <span className="text-xs text-gray-400 ml-1">({appointments.length})</span>
          )}
        </div>
        <Link href="/appointments" className="text-xs text-primary hover:underline flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {appointments.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No upcoming appointments</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {appointments.map(a => (
            <div key={a.id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link
                      href="/appointments"
                      className="text-sm font-medium text-gray-900 hover:text-primary transition-colors truncate"
                    >
                      {a.title}
                    </Link>
                    {a.categoryName && a.categoryColour && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium border shrink-0"
                        style={{ color: a.categoryColour, borderColor: a.categoryColour, backgroundColor: "transparent" }}
                      >
                        {a.categoryName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    {new Date(a.date).toLocaleDateString("en-GB", {
                      weekday: "short", day: "numeric", month: "short",
                    }) + " at " + new Date(a.date).toLocaleTimeString("en-GB", {
                      hour: "numeric", minute: "2-digit", hour12: true,
                    })}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {a.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{a.location}
                      </span>
                    )}
                    {a.supplierName && a.supplierId && (
                      <Link
                        href={`/suppliers/${a.supplierId}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {a.supplierName}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2.5 ml-11 justify-end">
                <button
                  onClick={() => onMarkDone({ id: a.id, title: a.title })}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Done
                </button>
                <Link
                  href="/appointments"
                  className="text-xs text-primary hover:underline font-medium"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, MapPin } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { AppointmentModal, AppointmentData } from "@/components/appointments/AppointmentModal";

function CategoryBadge({ name, colour }: { name: string; colour: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color: colour, borderColor: colour, backgroundColor: "transparent" }}
    >
      {name}
    </span>
  );
}

function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) +
    " at " +
    dt.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}

export function SupplierAppointmentsSection({
  supplierId,
}: {
  supplierId: string;
}) {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentData | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetchApi("/api/appointments")
      .then(r => r.json())
      .then((all: AppointmentData[]) => {
        setAppointments(
          all
            .filter(a => a.supplierId === supplierId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [supplierId]);

  function handleSave(appt: AppointmentData) {
    setAppointments(prev => {
      const idx = prev.findIndex(a => a.id === appt.id);
      const next = idx >= 0
        ? prev.map(a => (a.id === appt.id ? appt : a))
        : [...prev, appt];
      return next.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    setModalOpen(false);
    setEditing(null);
    showToast(editing ? "Appointment updated" : "Appointment added");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this appointment?")) return;
    const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAppointments(prev => prev.filter(a => a.id !== id));
      showToast("Deleted");
    } else {
      showToast("Failed to delete", false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Appointments</p>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          <Plus className="w-3.5 h-3.5" /> Add appointment
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-6 animate-pulse space-y-2">
          {[1, 2].map(i => <div key={i} className="h-8 bg-gray-100 rounded" />)}
        </div>
      ) : appointments.length === 0 ? (
        <p className="px-4 py-6 text-xs text-gray-400 text-center">No appointments linked to this supplier</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {appointments.map(appt => {
            const isPast = new Date(appt.date) < new Date();
            return (
              <div key={appt.id} className={`px-4 py-3 flex items-start gap-3 ${isPast ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-medium text-gray-800">{appt.title}</p>
                    {appt.category && (
                      <CategoryBadge name={appt.category.name} colour={appt.category.colour} />
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{fmtDate(appt.date)}</p>
                  {appt.location && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />{appt.location}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { setEditing(appt); setModalOpen(true); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors text-xs"
                    title="Edit"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(appt.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs"
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-4 py-2 border-t border-gray-100">
        <Link href="/appointments" className="text-xs text-gray-400 hover:text-primary">
          View all appointments →
        </Link>
      </div>

      {modalOpen && (
        <AppointmentModal
          initial={editing}
          prefillSupplierId={supplierId}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}

      {toast && (
        <div className={`fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${toast.ok ? "bg-green-600" : "bg-red-600"}`} style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

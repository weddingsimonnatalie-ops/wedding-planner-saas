"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/fetch";
import { Plus, Edit2, Trash2, MapPin, ChevronDown, CalendarDays } from "lucide-react";
import { AppointmentModal, AppointmentData } from "./AppointmentModal";
import { usePermissions } from "@/hooks/usePermissions";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
    " at " +
    dt.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}

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

// ── Card ──────────────────────────────────────────────────────────────────────

function AppointmentCard({
  appt,
  onEdit,
  onDelete,
  isPast,
}: {
  appt: AppointmentData;
  onEdit?: (a: AppointmentData) => void;
  onDelete?: (id: string) => void;
  isPast: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${isPast ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-semibold text-gray-900">{appt.title}</h3>
            {appt.category && (
              <CategoryBadge name={appt.category.name} colour={appt.category.colour} />
            )}
          </div>

          <p className="text-xs text-gray-500 mb-1.5">
            <span className="font-medium text-gray-700">{fmtDate(appt.date)}</span>
          </p>

          {appt.location && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
              <MapPin className="w-3 h-3 shrink-0" />
              {appt.location}
            </p>
          )}

          {appt.supplier && (
            <p className="text-xs text-gray-500 mb-1">
              Supplier:{" "}
              <Link
                href={`/suppliers/${appt.supplier.id}`}
                className="text-primary hover:underline font-medium"
              >
                {appt.supplier.name}
              </Link>
            </p>
          )}

          {appt.notes && (
            <p className="text-xs text-gray-400 line-clamp-2 mt-1">{appt.notes}</p>
          )}
        </div>

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(appt)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(appt.id)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ApptCategory { id: string; name: string; colour: string }

export function AppointmentsList() {
  const { can: perms } = usePermissions();
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [apptCategories, setApptCategories] = useState<ApptCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentData | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchApi("/api/appointments")
      .then(r => {
        if (!r.ok) {
          setError("Failed to load appointments. Please refresh the page.");
          setLoading(false);
          return;
        }
        return r.json();
      })
      .then(data => {
        if (data) setAppointments(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load appointments. Please refresh the page.");
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchApi("/api/appointment-categories")
      .then(r => r.json())
      .then((data: ApptCategory[]) => setApptCategories(data))
      .catch(() => {});
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave(appt: AppointmentData) {
    setAppointments(prev => {
      const idx = prev.findIndex(a => a.id === appt.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = appt;
        return next.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      return [...prev, appt].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
      showToast("Appointment deleted");
    } else {
      showToast("Failed to delete", false);
    }
  }

  function openAdd() { setEditing(null); setModalOpen(true); }
  function openEdit(appt: AppointmentData) { setEditing(appt); setModalOpen(true); }

  // Partition into upcoming / past
  const now = new Date();
  const filtered = appointments.filter(a => {
    if (filterCategory && a.categoryId !== filterCategory) return false;
    if (filterSupplier && a.supplierId !== filterSupplier) return false;
    return true;
  });
  const upcoming = filtered.filter(a => new Date(a.date) >= now);
  const past = filtered.filter(a => new Date(a.date) < now);

  // Unique suppliers for filter
  const supplierOptions = Array.from(
    new Map(
      appointments
        .filter(a => a.supplier)
        .map(a => [a.supplierId!, a.supplier!.name])
    ).entries()
  );

  const inputCls = "px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white";

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Appointments</h1>
        {perms.editAppointments && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add appointment
          </button>
        )}
      </div>

      {!perms.editAppointments && (
        <ReadOnlyBanner message="You have view-only access to appointments." />
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className={inputCls}
        >
          <option value="">All categories</option>
          {apptCategories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {supplierOptions.length > 0 && (
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className={inputCls}
          >
            <option value="">All suppliers</option>
            {supplierOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Upcoming */}
      {upcoming.length === 0 && past.length === 0 && (
        <div className="py-16 text-center">
          <CalendarDays className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 mb-3">No appointments yet</p>
          {perms.editAppointments && (
            <button
              onClick={openAdd}
              className="text-sm text-primary hover:underline"
            >
              Add your first appointment
            </button>
          )}
        </div>
      )}

      {upcoming.length === 0 && (past.length > 0 || filterCategory || filterSupplier) && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">No upcoming appointments</p>
        </div>
      )}

      {upcoming.map(appt => (
        <AppointmentCard
          key={appt.id}
          appt={appt}
          isPast={false}
          onEdit={perms.editAppointments ? openEdit : undefined}
          onDelete={perms.editAppointments ? handleDelete : undefined}
        />
      ))}

      {/* Past (collapsible) */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setPastOpen(o => !o)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${pastOpen ? "rotate-180" : ""}`} />
            Past appointments ({past.length})
          </button>

          {pastOpen && (
            <div className="space-y-3 mt-2">
              {past.slice().reverse().map(appt => (
                <AppointmentCard
                  key={appt.id}
                  appt={appt}
                  isPast={true}
                  onEdit={perms.editAppointments ? openEdit : undefined}
                  onDelete={perms.editAppointments ? handleDelete : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && perms.editAppointments && (
        <AppointmentModal
          initial={editing}
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

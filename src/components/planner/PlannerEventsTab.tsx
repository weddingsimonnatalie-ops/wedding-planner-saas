"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/fetch";
import { Edit2, Trash2, MapPin, ChevronDown, CalendarDays } from "lucide-react";
import { PlannerItemModal } from "./PlannerItemModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useRefresh } from "@/context/RefreshContext";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { EventData } from "./types";

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

function EventCard({
  event,
  onEdit,
  onDelete,
  isPast,
}: {
  event: EventData;
  onEdit?: (e: EventData) => void;
  onDelete?: (id: string) => void;
  isPast: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${isPast ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-semibold text-gray-900">{event.title}</h3>
            {event.category && (
              <CategoryBadge name={event.category.name} colour={event.category.colour} />
            )}
          </div>

          <p className="text-xs text-gray-500 mb-1.5">
            <span className="font-medium text-gray-700">{fmtDate(event.date)}</span>
          </p>

          {event.location && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
              <MapPin className="w-3 h-3 shrink-0" />
              {event.location}
            </p>
          )}

          {event.supplier && (
            <p className="text-xs text-gray-500 mb-1">
              Supplier:{" "}
              <Link
                href={`/suppliers/${event.supplier.id}`}
                className="text-primary hover:underline font-medium"
              >
                {event.supplier.name}
              </Link>
            </p>
          )}

          {event.notes && (
            <p className="text-xs text-gray-400 line-clamp-2 mt-1">{event.notes}</p>
          )}
        </div>

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(event)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(event.id)}
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

interface Category { id: string; name: string; colour: string }

export function PlannerEventsTab() {
  const { can: perms } = usePermissions();
  const { refreshToken } = useRefresh();
  const [events, setEvents] = useState<EventData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventData | null>(null);
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
          setError("Failed to load events. Please refresh the page.");
          setLoading(false);
          return;
        }
        return r.json();
      })
      .then(data => {
        if (data) setEvents(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load events. Please refresh the page.");
        setLoading(false);
      });
  }, [refreshToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchApi("/api/planning-categories")
      .then(r => r.json())
      .then((data: Category[]) => setCategories(data))
      .catch(() => {});
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave(event: EventData) {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === event.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = event;
        return next.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      return [...prev, event].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    setModalOpen(false);
    setEditing(null);
    showToast(editing ? "Event updated" : "Event added");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this event?")) return;
    const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEvents(prev => prev.filter(e => e.id !== id));
      showToast("Event deleted");
    } else {
      showToast("Failed to delete", false);
    }
  }

  function openAdd() { setEditing(null); setModalOpen(true); }
  function openEdit(event: EventData) { setEditing(event); setModalOpen(true); }

  // Partition into upcoming / past
  const now = new Date();
  const filtered = events.filter(e => {
    if (filterCategory && e.categoryId !== filterCategory) return false;
    if (filterSupplier && e.supplierId !== filterSupplier) return false;
    return true;
  });
  const upcoming = filtered.filter(e => new Date(e.date) >= now);
  const past = filtered.filter(e => new Date(e.date) < now);

  // Unique suppliers for filter
  const supplierOptions = Array.from(
    new Map(
      events
        .filter(e => e.supplier)
        .map(e => [e.supplierId!, e.supplier!.name])
    ).entries()
  );

  const inputCls = "w-full sm:w-auto px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white";

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
      {!perms.editAppointments && (
        <ReadOnlyBanner message="You have view-only access to events." />
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className={inputCls}
        >
          <option value="">All categories</option>
          {categories.map(c => (
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
        <EmptyState
          icon={CalendarDays}
          title="No events yet"
          description="Add appointments to stay organised"
          actionLabel={perms.editAppointments ? "Add your first event" : undefined}
          onClick={perms.editAppointments ? openAdd : undefined}
        />
      )}

      {upcoming.length === 0 && (past.length > 0 || filterCategory || filterSupplier) && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">No upcoming events</p>
        </div>
      )}

      {upcoming.map(event => (
        <EventCard
          key={event.id}
          event={event}
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
            Past events ({past.length})
          </button>

          {pastOpen && (
            <div className="space-y-3 mt-2">
              {past.slice().reverse().map(event => (
                <EventCard
                  key={event.id}
                  event={event}
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
        <PlannerItemModal
          type="event"
          initialEvent={editing}
          onEventSave={handleSave}
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
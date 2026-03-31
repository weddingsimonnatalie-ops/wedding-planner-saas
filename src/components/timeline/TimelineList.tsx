"use client";

import { useState, useEffect } from "react";
import { Plus, Clock, MapPin, Briefcase, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { TimelineEventModal } from "./TimelineEventModal";
import { TimelinePrintView } from "./TimelinePrintView";

interface TimelineEvent {
  id: string;
  startTime: string;
  durationMins: number;
  title: string;
  location: string | null;
  notes: string | null;
  eventType: string;
  supplierId?: string | null;
  supplier: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  PREP: "bg-pink-100 text-pink-800 border-pink-200",
  TRANSPORT: "bg-blue-100 text-blue-800 border-blue-200",
  CEREMONY: "bg-purple-100 text-purple-800 border-purple-200",
  PHOTO: "bg-amber-100 text-amber-800 border-amber-200",
  RECEPTION: "bg-green-100 text-green-800 border-green-200",
  FOOD: "bg-orange-100 text-orange-800 border-orange-200",
  MUSIC: "bg-indigo-100 text-indigo-800 border-indigo-200",
  GENERAL: "bg-gray-100 text-gray-800 border-gray-200",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  PREP: "Prep",
  TRANSPORT: "Transport",
  CEREMONY: "Ceremony",
  PHOTO: "Photo",
  RECEPTION: "Reception",
  FOOD: "Food",
  MUSIC: "Music",
  GENERAL: "Other",
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export function TimelineList() {
  const { can } = usePermissions();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/timeline");
      if (!res.ok) throw new Error("Failed to load timeline");
      const data = await res.json();
      setEvents(data.events || []);
    } catch {
      setError("Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    setEditingEvent(null);
    setShowModal(true);
  }

  function handleEdit(event: TimelineEvent) {
    setEditingEvent(event);
    setShowModal(true);
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingEvent(null);
  }

  function handleModalSave() {
    setShowModal(false);
    setEditingEvent(null);
    loadEvents();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {error}
        <button onClick={loadEvents} className="ml-2 underline hover:no-underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Wedding Day Timeline</h1>
        <div className="flex items-center gap-2">
          <TimelinePrintView />
          {can.editTimeline && (
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Add event
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {events.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No events yet</p>
          {can.editTimeline && (
            <p className="text-sm text-gray-400 mt-1">
              Add your first event to start planning your wedding day
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              onClick={() => can.editTimeline && handleEdit(event)}
              className={`bg-white border rounded-lg p-4 ${can.editTimeline ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
            >
              <div className="flex items-start gap-3">
                {/* Time */}
                <div className="text-right min-w-[60px]">
                  <div className="text-sm font-medium text-gray-900">
                    {formatTime(event.startTime)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDuration(event.durationMins)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900">{event.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${EVENT_TYPE_COLORS[event.eventType] || EVENT_TYPE_COLORS.GENERAL}`}>
                      {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                    </span>
                  </div>

                  {event.location && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {event.location}
                    </div>
                  )}

                  {event.supplier && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <Briefcase className="w-3.5 h-3.5" />
                      {event.supplier.name}
                    </div>
                  )}

                  {event.notes && (
                    <p className="text-sm text-gray-600 mt-2">{event.notes}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TimelineEventModal
          event={editingEvent}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
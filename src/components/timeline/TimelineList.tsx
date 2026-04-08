"use client";

import { useState, useEffect } from "react";
import { Plus, Clock, MapPin, Briefcase, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { TimelineEventModal } from "./TimelineEventModal";
import { TimelinePrintView } from "./TimelinePrintView";
import { EmptyState } from "@/components/ui/EmptyState";

interface TimelineEvent {
  id: string;
  startTime: string;
  durationMins: number;
  title: string;
  location: string | null;
  notes: string | null;
  categoryId: string | null;
  category: { id: string; name: string; colour: string } | null;
  supplierId?: string | null;
  supplier: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  colour: string;
}

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

function getEventColour(category: { colour: string } | null): string {
  if (!category) {
    return "bg-gray-100 text-gray-800 border-gray-200";
  }
  // Parse the hex colour and create appropriate text/border colours
  const hex = category.colour.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Use the category colour as background with contrasting text
  return `bg-[${category.colour}]`;
}

export function TimelineList() {
  const { can } = usePermissions();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [eventsRes, categoriesRes] = await Promise.all([
        fetch("/api/timeline"),
        fetch("/api/timeline-categories"),
      ]);

      if (!eventsRes.ok) throw new Error("Failed to load timeline");
      const eventsData = await eventsRes.json();
      setEvents(eventsData.events || []);

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setCategories(categoriesData || []);
      }
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
    loadData();
  }

  // Build a lookup map for category colours
  const categoryMap = new Map(categories.map(c => [c.id, c]));

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
        <button onClick={loadData} className="ml-2 underline hover:no-underline">
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
        <EmptyState
          variant="timeline"
          title="No timeline events"
          description="Add events to your wedding day schedule"
          actionLabel={can.editTimeline ? "Add your first event" : undefined}
          onClick={can.editTimeline ? () => setShowModal(true) : undefined}
        />
      ) : (
        <div className="space-y-3 animate-fade-in-up">
          {events.map((event, index) => {
            const category = event.categoryId ? categoryMap.get(event.categoryId) || event.category : null;
            const bgColor = category?.colour || "#f3f4f6";

            return (
              <div
                key={event.id}
                onClick={() => can.editTimeline && handleEdit(event)}
                className={`bg-white border rounded-lg p-4 transition-all duration-200 ${can.editTimeline ? "cursor-pointer hover:shadow-md hover:border-gray-300" : ""}`}
                style={{ animationDelay: `${index * 0.05}s` }}
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
                      {category && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: bgColor,
                            borderColor: bgColor,
                            color: "inherit",
                          }}
                        >
                          {category.name}
                        </span>
                      )}
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
            );
          })}
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
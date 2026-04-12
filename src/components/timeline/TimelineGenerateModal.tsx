"use client";

import { useState, useEffect } from "react";
import { Loader2, MapPin, Briefcase, Trash2, Sparkles } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import type { DraftTimelineEvent } from "@/app/api/timeline/generate/route";

interface Props {
  onClose: () => void;
  onSave: () => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function TimelineGenerateModal({ onClose, onSave }: Props) {
  const [step, setStep] = useState<"generating" | "streaming" | "preview" | "saving">("generating");
  const [events, setEvents] = useState<DraftTimelineEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setStep("generating");
    setError("");
    setEvents([]);

    let res: Response;
    try {
      res = await fetch("/api/timeline/generate", { method: "POST" });
    } catch {
      setError("Failed to connect. Please check your connection and try again.");
      setStep("preview");
      return;
    }

    // Non-streaming error (auth, 4xx, etc.)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Failed to generate timeline. Please try again.");
      setStep("preview");
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setError("No response from server. Please try again.");
      setStep("preview");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE lines are separated by \n\n; each starts with "data: "
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();

          if (data === "[DONE]") {
            setStep("preview");
            return;
          }

          try {
            const parsed = JSON.parse(data) as DraftTimelineEvent & { error?: string };
            if (parsed.error) {
              setError(parsed.error);
              setStep("preview");
              return;
            }
            // Valid event — append and switch to streaming view
            setStep("streaming");
            setEvents((prev) => [...prev, parsed]);
          } catch {
            // ignore malformed SSE data
          }
        }
      }
    } catch {
      setError("Connection lost during generation. Please try again.");
    } finally {
      reader.releaseLock();
    }

    setStep("preview");
  }

  function removeEvent(index: number) {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (events.length === 0) return;
    setStep("saving");
    setError("");

    let savedCount = 0;
    for (const event of events) {
      try {
        const res = await fetch("/api/timeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: event.title,
            startTime: event.startTime,
            durationMins: event.durationMins,
            location: event.location,
            notes: event.notes,
            supplierId: event.supplierId,
          }),
        });
        if (res.ok) savedCount++;
      } catch {
        // continue saving remaining events
      }
    }

    if (savedCount === 0) {
      setError("Failed to save events. Please try again.");
      setStep("preview");
      return;
    }

    onSave();
  }

  const isGenerating = step === "generating";
  const isStreaming = step === "streaming";
  const isSaving = step === "saving";

  const submitLabel = isSaving
    ? "Adding events…"
    : `Add ${events.length} event${events.length !== 1 ? "s" : ""} to timeline`;

  const eventList = (
    <div className="space-y-2">
      {events.map((event, index) => (
        <div
          key={index}
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-3 animate-fade-in-up"
          style={{ animationDelay: `${index * 0.03}s` }}
        >
          <div className="text-right min-w-[52px] shrink-0">
            <div className="text-xs font-medium text-gray-900">
              {formatTime(event.startTime)}
            </div>
            <div className="text-xs text-gray-400">
              {formatDuration(event.durationMins)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{event.title}</p>
            {event.location && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                {event.location}
              </div>
            )}
            {event.supplierName && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <Briefcase className="w-3 h-3 shrink-0" />
                {event.supplierName}
                {!event.supplierId && (
                  <span className="text-amber-600 ml-0.5">(unmatched)</span>
                )}
              </div>
            )}
            {event.notes && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                {event.notes}
              </p>
            )}
          </div>
          {!isStreaming && !isSaving && (
            <button
              type="button"
              onClick={() => removeEvent(index)}
              className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors shrink-0"
              aria-label={`Remove ${event.title}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
          <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary" />
          Generating more events…
        </div>
      )}
    </div>
  );

  return (
    <ModalShell
      title="Generate timeline"
      onClose={onClose}
      formId="timeline-generate-form"
      submitLabel={submitLabel}
      submitDisabled={isGenerating || isStreaming || isSaving || events.length === 0}
    >
      <form
        id="timeline-generate-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-12 px-5 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-gray-500">Generating your wedding day timeline…</p>
            <p className="text-xs text-gray-400">Events will start appearing shortly</p>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <span className="flex-1">{error}</span>
                {events.length === 0 && (
                  <button
                    type="button"
                    onClick={generate}
                    className="text-red-700 underline hover:no-underline whitespace-nowrap shrink-0"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}

            {events.length > 0 && (
              <>
                {!isStreaming && (
                  <p className="text-sm text-gray-500">
                    Review the generated events. Remove any you don&apos;t want before adding them to your timeline.
                  </p>
                )}
                {eventList}
              </>
            )}
          </div>
        )}
      </form>
    </ModalShell>
  );
}

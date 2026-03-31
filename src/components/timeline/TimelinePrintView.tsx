"use client";

import { useEffect, useState } from "react";
import { Printer, Loader2 } from "lucide-react";

interface TimelineEvent {
  id: string;
  startTime: string;
  durationMins: number;
  title: string;
  location: string | null;
  notes: string | null;
  eventType: string;
  supplier: { id: string; name: string } | null;
}

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

function formatEndTime(startTime: string, durationMins: number): string {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMins * 60000);
  return end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function TimelinePrintView() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/timeline");
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  function handlePrint() {
    // Create a new window with printable content
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print the timeline");
      return;
    }

    const weddingDate = events[0] ? new Date(events[0].startTime).toLocaleDateString("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }) : "Wedding Day";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Wedding Day Timeline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12pt;
      line-height: 1.4;
      padding: 20mm;
    }
    h1 {
      font-size: 18pt;
      margin-bottom: 4pt;
    }
    .date {
      font-size: 14pt;
      color: #666;
      margin-bottom: 20pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      padding: 8pt;
      border-bottom: 2pt solid #333;
      font-weight: 600;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
    td {
      padding: 8pt;
      border-bottom: 1pt solid #ccc;
      vertical-align: top;
    }
    .time-col { width: 15%; }
    .duration-col { width: 12%; }
    .title-col { width: 30%; }
    .location-col { width: 20%; }
    .notes-col { width: 23%; }
    .time { font-variant-numeric: tabular-nums; }
    .duration { color: #666; font-size: 10pt; }
    .type {
      display: inline-block;
      font-size: 9pt;
      padding: 2pt 6pt;
      border-radius: 3pt;
      margin-left: 6pt;
      font-weight: 500;
    }
    .type-PREP { background: #fce7f3; color: #9d174d; }
    .type-TRANSPORT { background: #dbeafe; color: #1e40af; }
    .type-CEREMONY { background: #f3e8ff; color: #7c3aed; }
    .type-PHOTO { background: #fef3c7; color: #b45309; }
    .type-RECEPTION { background: #dcfce7; color: #166534; }
    .type-FOOD { background: #ffedd5; color: #c2410c; }
    .type-MUSIC { background: #e0e7ff; color: #4338ca; }
    .type-GENERAL { background: #f3f4f6; color: #374151; }
    .vendor { font-size: 10pt; color: #666; margin-top: 2pt; }
    .notes { font-size: 10pt; color: #555; }
    @media print {
      body { padding: 0; }
      @page { margin: 15mm; size: A4 portrait; }
    }
  </style>
</head>
<body>
  <h1>Wedding Day Timeline</h1>
  <p class="date">${weddingDate}</p>
  <table>
    <thead>
      <tr>
        <th class="time-col">Time</th>
        <th class="duration-col">Duration</th>
        <th class="title-col">Event</th>
        <th class="location-col">Location</th>
        <th class="notes-col">Notes</th>
      </tr>
    </thead>
    <tbody>
      ${events.map(event => `
        <tr>
          <td class="time-col">
            <div class="time">${formatTime(event.startTime)}</div>
            <div class="duration">– ${formatEndTime(event.startTime, event.durationMins)}</div>
          </td>
          <td class="duration-col">${formatDuration(event.durationMins)}</td>
          <td class="title-col">
            ${event.title}
            <span class="type type-${event.eventType}">${EVENT_TYPE_LABELS[event.eventType] || event.eventType}</span>
            ${event.supplier ? `<div class="vendor">${event.supplier.name}</div>` : ''}
          </td>
          <td class="location-col">${event.location || '–'}</td>
          <td class="notes-col">${event.notes || '–'}</td>
        </tr>
      `).join('')}
      ${events.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: 20pt; color: #999;">No events scheduled</td></tr>' : ''}
    </tbody>
  </table>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  }

  if (loading) {
    return (
      <button disabled className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading...
      </button>
    );
  }

  return (
    <button
      onClick={handlePrint}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
    >
      <Printer className="w-4 h-4" />
      Print
    </button>
  );
}
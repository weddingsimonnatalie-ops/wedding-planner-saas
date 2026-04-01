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
  categoryId: string | null;
  category: { id: string; name: string; colour: string } | null;
  supplier: { id: string; name: string } | null;
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

function formatEndTime(startTime: string, durationMins: number): string {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMins * 60000);
  return end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 243, g: 244, b: 246 }; // fallback to gray
}

function getContrastColour(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1f2937" : "#f9fafb";
}

export function TimelinePrintView() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [eventsRes, categoriesRes] = await Promise.all([
          fetch("/api/timeline"),
          fetch("/api/timeline-categories"),
        ]);

        if (eventsRes.ok) {
          const data = await eventsRes.json();
          setEvents(data.events || []);
        }

        if (categoriesRes.ok) {
          const data = await categoriesRes.json();
          setCategories(data || []);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Build a lookup map for categories
  const categoryMap = new Map(categories.map(c => [c.id, c]));

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

    // Generate category style classes
    const categoryStyles = categories.map(c => {
      const textColor = getContrastColour(c.colour);
      return `.cat-${c.id} { background: ${c.colour}; color: ${textColor}; }`;
    }).join("\n    ");

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
    .type-none { background: #f3f4f6; color: #374151; }
    ${categoryStyles}
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
      ${events.map(event => {
        const category = event.categoryId ? categoryMap.get(event.categoryId) || event.category : null;
        const categoryName = category?.name || "Other";
        const categoryClass = category ? `cat-${category.id}` : "type-none";

        return `
          <tr>
            <td class="time-col">
              <div class="time">${formatTime(event.startTime)}</div>
              <div class="duration">– ${formatEndTime(event.startTime, event.durationMins)}</div>
            </td>
            <td class="duration-col">${formatDuration(event.durationMins)}</td>
            <td class="title-col">
              ${event.title}
              <span class="type ${categoryClass}">${categoryName}</span>
              ${event.supplier ? `<div class="vendor">${event.supplier.name}</div>` : ''}
            </td>
            <td class="location-col">${event.location || '–'}</td>
            <td class="notes-col">${event.notes || '–'}</td>
          </tr>
        `;
      }).join('')}
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
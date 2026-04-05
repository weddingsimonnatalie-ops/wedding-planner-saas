"use client";

import { useState } from "react";
import { PrintTableBlock, TableBlockData } from "./PrintTableBlock";

interface PrintDesignerProps {
  weddingConfig: {
    coupleName: string | null;
    weddingDate: Date | null;
  } | null;
  tables: TableBlockData[];
}

type Orientation = "horizontal" | "vertical";
type PaperSize = "a4" | "letter";
type FontSize = "small" | "medium" | "large";

export function PrintDesigner({ weddingConfig, tables }: PrintDesignerProps) {
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [columns, setColumns] = useState(3);
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [showSeatNumbers, setShowSeatNumbers] = useState(true);
  const [showMealChoices, setShowMealChoices] = useState(false);
  const [showLastName, setShowLastName] = useState(true);

  const handlePrint = () => {
    const paperDimensions = {
      a4: { width: "210mm", height: "297mm" },
      letter: { width: "8.5in", height: "11in" },
    };

    const pageOrientation = orientation === "horizontal" ? "landscape" : "portrait";
    const dims = paperDimensions[paperSize];

    // Calculate columns based on orientation
    const gridColumns = orientation === "horizontal" ? columns : 2;

    // Sort guests by seat number within each table
    const tablesWithSortedGuests = tables.map((t) => ({
      ...t,
      guests: [...t.guests].sort((a, b) => {
        if (a.seatNumber === null && b.seatNumber === null) {
          return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
        }
        if (a.seatNumber === null) return 1;
        if (b.seatNumber === null) return -1;
        return a.seatNumber - b.seatNumber;
      }),
    }));

    // Format date
    const formattedDate = weddingConfig?.weddingDate
      ? new Date(weddingConfig.weddingDate).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;

    const fontSizeStyles = {
      small: { name: "14px", guest: "11px" },
      medium: { name: "16px", guest: "13px" },
      large: { name: "18px", guest: "15px" },
    };
    const sizes = fontSizeStyles[fontSize];

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Seating Chart - ${weddingConfig?.coupleName || "Wedding"}</title>
  <style>
    @page {
      size: ${dims.width} ${dims.height} ${pageOrientation};
      margin: 1cm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .header {
      text-align: center;
      margin-bottom: 1cm;
      padding-bottom: 0.5cm;
      border-bottom: 2px solid #333;
    }

    .couple-name {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 0.25cm;
    }

    .event-info {
      font-size: 14px;
      color: #666;
    }

    .tables-grid {
      display: grid;
      grid-template-columns: repeat(${gridColumns}, 1fr);
      gap: 0.5cm;
    }

    .table-block {
      border: 2px solid #333;
      border-radius: 8px;
      padding: 0.4cm;
      break-inside: avoid;
      background: white;
    }

    .table-block.horizontal {
      display: block;
    }

    .table-block.vertical {
      display: flex;
    }

    .table-name {
      font-size: ${sizes.name};
      font-weight: bold;
    }

    .table-count {
      font-weight: normal;
      color: #666;
      margin-left: 0.3cm;
    }

    .guests-container {
      margin-top: 0.3cm;
    }

    .horizontal .guests-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 0.2cm;
    }

    .vertical .guests-container {
      flex: 1;
      padding-left: 0.4cm;
    }

    .guest-row {
      font-size: ${sizes.guest};
      display: flex;
      align-items: baseline;
      gap: 0.1cm;
    }

    .seat-number {
      color: #666;
      min-width: 1.5em;
    }

    .guest-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meal-choice {
      color: #888;
      font-size: 0.85em;
      margin-left: 0.1cm;
    }

    .no-guests {
      font-size: ${sizes.guest};
      color: #999;
      font-style: italic;
      text-align: center;
      padding: 0.5cm;
    }

    .vertical .table-header {
      border-right: 1px solid #ddd;
      padding-right: 0.4cm;
      min-width: 80px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    @media print {
      .page-break {
        break-before: page;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="couple-name">${weddingConfig?.coupleName || "Wedding Seating"}</div>
    ${formattedDate ? `<div class="event-info">${formattedDate}</div>` : ""}
  </div>

  <div class="tables-grid">
    ${tablesWithSortedGuests
      .map((table) => {
        const guestsHtml = table.guests.length
          ? table.guests
              .map(
                (g) => `
              <div class="guest-row">
                ${showSeatNumbers && g.seatNumber !== null ? `<span class="seat-number">${g.seatNumber}.</span>` : ""}
                <span class="guest-name">${g.firstName}${showLastName ? ` ${g.lastName}` : ""}</span>
                ${showMealChoices && g.mealChoice ? `<span class="meal-choice">(${g.mealChoice})</span>` : ""}
              </div>
            `
              )
              .join("")
          : `<div class="no-guests">No guests assigned</div>`;

        if (orientation === "horizontal") {
          return `
            <div class="table-block horizontal">
              <div class="table-name">
                ${table.name}
                <span class="table-count">(${table.guests.length}/${table.capacity})</span>
              </div>
              <div class="guests-container">
                ${guestsHtml}
              </div>
            </div>
          `;
        } else {
          return `
            <div class="table-block vertical">
              <div class="table-header">
                <div class="table-name">${table.name}</div>
                <div class="table-count">${table.guests.length}/${table.capacity}</div>
              </div>
              <div class="guests-container">
                ${guestsHtml}
              </div>
            </div>
          `;
        }
      })
      .join("")}
  </div>
</body>
</html>
    `);

    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Settings Panel */}
      <div className="w-64 shrink-0 space-y-6">
        <div>
          <h3 className="font-medium mb-2">Orientation</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setOrientation("horizontal")}
              className={`flex-1 px-3 py-2 rounded text-sm ${
                orientation === "horizontal"
                  ? "bg-primary text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Horizontal
            </button>
            <button
              onClick={() => setOrientation("vertical")}
              className={`flex-1 px-3 py-2 rounded text-sm ${
                orientation === "vertical"
                  ? "bg-primary text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Vertical
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-medium mb-2">Paper Size</h3>
          <select
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value as PaperSize)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </div>

        {orientation === "horizontal" && (
          <div>
            <h3 className="font-medium mb-2">Columns per Page</h3>
            <select
              value={columns}
              onChange={(e) => setColumns(parseInt(e.target.value))}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="2">2 columns</option>
              <option value="3">3 columns</option>
              <option value="4">4 columns</option>
            </select>
          </div>
        )}

        <div>
          <h3 className="font-medium mb-2">Font Size</h3>
          <select
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value as FontSize)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium mb-2">Display Options</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showSeatNumbers}
              onChange={(e) => setShowSeatNumbers(e.target.checked)}
              className="rounded"
            />
            Show seat numbers
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showLastName}
              onChange={(e) => setShowLastName(e.target.checked)}
              className="rounded"
            />
            Show last names
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showMealChoices}
              onChange={(e) => setShowMealChoices(e.target.checked)}
              className="rounded"
            />
            Show meal choices
          </label>
        </div>

        <button
          onClick={handlePrint}
          className="w-full bg-primary text-white py-2 px-4 rounded hover:bg-primary/90 font-medium"
        >
          Print
        </button>

        <div className="text-xs text-gray-500">
          <p>
            {tables.length} table{tables.length !== 1 ? "s" : ""} with{" "}
            {tables.reduce((sum, t) => sum + t.guests.length, 0)} guests
          </p>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4">
        <div className="bg-white shadow-lg mx-auto" style={{ maxWidth: "100%" }}>
          {/* Header */}
          <div className="text-center py-4 border-b-2 border-gray-300">
            <div className="text-xl font-semibold">
              {weddingConfig?.coupleName || "Wedding Seating"}
            </div>
            {weddingConfig?.weddingDate && (
              <div className="text-sm text-gray-500 mt-1">
                {new Date(weddingConfig.weddingDate).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            )}
          </div>

          {/* Tables Grid */}
          <div className="p-4">
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns:
                  orientation === "horizontal"
                    ? `repeat(${columns}, minmax(0, 1fr))`
                    : "repeat(2, minmax(0, 1fr))",
              }}
            >
              {tables.map((table) => (
                <PrintTableBlock
                  key={table.id}
                  table={table}
                  orientation={orientation}
                  showSeatNumbers={showSeatNumbers}
                  showLastName={showLastName}
                  showMealChoices={showMealChoices}
                  fontSize={fontSize}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
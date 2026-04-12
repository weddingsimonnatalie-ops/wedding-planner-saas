export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requirePremiumFeature } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { handleDbError } from "@/lib/db-error";
import { streamFromOllama, OllamaError } from "@/lib/ollama";

export interface DraftTimelineEvent {
  title: string;
  startTime: string;
  durationMins: number;
  location: string | null;
  notes: string | null;
  supplierId: string | null;
  /** Display name for supplier — set even when supplierId is null (unmatched) */
  supplierName: string | null;
}

type WeddingContext = {
  coupleName: string;
  weddingDate: Date | null;
  timezone: string;
  ceremonyEnabled: boolean;
  ceremonyName: string;
  ceremonyLocation: string | null;
  mealEnabled: boolean;
  mealName: string;
  mealLocation: string | null;
  eveningPartyEnabled: boolean;
  eveningPartyName: string;
  eveningPartyLocation: string | null;
  rehearsalDinnerEnabled: boolean;
  rehearsalDinnerName: string;
  rehearsalDinnerLocation: string | null;
};

type SupplierContext = {
  id: string;
  name: string;
  category: { name: string } | null;
};

function buildPrompt(
  wedding: WeddingContext,
  suppliers: SupplierContext[]
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a professional wedding day coordinator. Generate a detailed, realistic wedding day timeline.

Output each event as a separate JSON object on its own line (JSONL format).
Do NOT wrap events in an array. Do NOT add any other text, markdown, or explanation.
Each line must be a complete, valid JSON object with exactly these fields:
{"title":"...","startTime":"YYYY-MM-DDTHH:mm:ss","durationMins":60,"location":"...or null","notes":"...or null","supplierName":"...or null"}

Rules:
- startTime must use the wedding date provided, in ISO 8601 format (e.g. 2026-06-14T14:00:00)
- durationMins must be a positive integer
- supplierName must exactly match one of the supplier names provided, or null
- Include realistic buffer time and travel time between locations
- Cover the full day from early morning preparations through to the end of the evening
- Include getting ready, photography, ceremony, drinks reception, meal service, speeches, first dance, and farewells`;

  const dateStr = wedding.weddingDate
    ? wedding.weddingDate.toISOString().split("T")[0]
    : "TBC";

  const events: string[] = [];
  if (wedding.ceremonyEnabled) {
    const loc = wedding.ceremonyLocation ? ` at ${wedding.ceremonyLocation}` : "";
    events.push(`- ${wedding.ceremonyName}${loc}`);
  }
  if (wedding.mealEnabled) {
    const loc = wedding.mealLocation ? ` at ${wedding.mealLocation}` : "";
    events.push(`- ${wedding.mealName}${loc}`);
  }
  if (wedding.eveningPartyEnabled) {
    const loc = wedding.eveningPartyLocation ? ` at ${wedding.eveningPartyLocation}` : "";
    events.push(`- ${wedding.eveningPartyName}${loc}`);
  }
  if (wedding.rehearsalDinnerEnabled) {
    const loc = wedding.rehearsalDinnerLocation ? ` at ${wedding.rehearsalDinnerLocation}` : "";
    events.push(`- ${wedding.rehearsalDinnerName}${loc}`);
  }

  const supplierLines =
    suppliers.length > 0
      ? suppliers
          .map((s) => `- ${s.name}${s.category ? ` (${s.category.name})` : ""}`)
          .join("\n")
      : "No suppliers added yet";

  const userPrompt = `Wedding details:
Couple: ${wedding.coupleName}
Date: ${dateStr}
Timezone: ${wedding.timezone}

Events planned:
${events.length > 0 ? events.join("\n") : "No specific events configured yet — generate a typical full-day schedule"}

Suppliers:
${supplierLines}

Generate a complete wedding day timeline in JSONL format (one JSON object per line). Where a supplier is relevant to an event, set supplierName to their exact name from the list above.`;

  return { systemPrompt, userPrompt };
}

function normaliseEvent(
  raw: Record<string, unknown>,
  supplierLookup: Map<string, string>
): DraftTimelineEvent | null {
  if (typeof raw.title !== "string" || typeof raw.startTime !== "string") return null;

  const rawSupplierName =
    typeof raw.supplierName === "string" && raw.supplierName.trim()
      ? raw.supplierName.trim()
      : null;
  const supplierId = rawSupplierName
    ? (supplierLookup.get(rawSupplierName.toLowerCase()) ?? null)
    : null;

  return {
    title: raw.title.trim(),
    startTime: raw.startTime,
    durationMins:
      typeof raw.durationMins === "number"
        ? Math.max(5, Math.round(raw.durationMins))
        : 30,
    location:
      typeof raw.location === "string" && raw.location.trim()
        ? raw.location.trim()
        : null,
    notes:
      typeof raw.notes === "string" && raw.notes.trim()
        ? raw.notes.trim()
        : null,
    supplierId,
    supplierName: rawSupplierName,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId, wedding } = auth;

    // AI generation is a premium feature — blocked on FREE tier
    const premiumBlock = requirePremiumFeature(wedding.subscriptionStatus);
    if (premiumBlock) return premiumBlock;

    // Fetch full wedding context and suppliers in parallel
    const [weddingData, suppliers] = await Promise.all([
      withTenantContext(weddingId, (tx) =>
        tx.wedding.findUnique({
          where: { id: weddingId },
          select: {
            coupleName: true,
            weddingDate: true,
            timezone: true,
            ceremonyEnabled: true,
            ceremonyName: true,
            ceremonyLocation: true,
            mealEnabled: true,
            mealName: true,
            mealLocation: true,
            eveningPartyEnabled: true,
            eveningPartyName: true,
            eveningPartyLocation: true,
            rehearsalDinnerEnabled: true,
            rehearsalDinnerName: true,
            rehearsalDinnerLocation: true,
          },
        })
      ),
      withTenantContext(weddingId, (tx) =>
        tx.supplier.findMany({
          where: { weddingId },
          select: {
            id: true,
            name: true,
            category: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        })
      ),
    ]);

    if (!weddingData) {
      return NextResponse.json({ error: "Wedding not found" }, { status: 404 });
    }

    const { systemPrompt, userPrompt } = buildPrompt(weddingData, suppliers);
    const supplierLookup = new Map(
      suppliers.map((s) => [s.name.toLowerCase(), s.id])
    );

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) =>
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        let lineBuffer = "";
        let eventCount = 0;

        try {
          for await (const chunk of streamFromOllama([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ])) {
            lineBuffer += chunk;

            // Extract complete lines from the buffer
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const raw = JSON.parse(trimmed) as Record<string, unknown>;
                const event = normaliseEvent(raw, supplierLookup);
                if (event) {
                  eventCount++;
                  send(JSON.stringify(event));
                }
              } catch {
                // skip unparseable partial lines
              }
            }
          }

          // Flush any remaining content in the buffer
          if (lineBuffer.trim()) {
            try {
              const raw = JSON.parse(lineBuffer.trim()) as Record<string, unknown>;
              const event = normaliseEvent(raw, supplierLookup);
              if (event) {
                eventCount++;
                send(JSON.stringify(event));
              }
            } catch {
              // ignore
            }
          }

          if (eventCount === 0) {
            send(JSON.stringify({ error: "AI did not generate any events. Please try again." }));
          } else {
            send("[DONE]");
          }
        } catch (error) {
          const msg =
            error instanceof OllamaError
              ? error.message
              : "AI generation failed. Please try again.";
          console.error("[timeline/generate] stream error:", msg);
          send(JSON.stringify({ error: msg }));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleDbError(error);
  }
}

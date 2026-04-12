export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requirePremiumFeature } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";
import { generateFromOllama, OllamaError } from "@/lib/ollama";

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

Return ONLY a valid JSON object in this exact format — no markdown, no explanation, no extra text:
{
  "events": [
    {
      "title": "Event name",
      "startTime": "YYYY-MM-DDTHH:mm:ss",
      "durationMins": 60,
      "location": "Location name or null",
      "notes": "Brief helpful note or null",
      "supplierName": "Exact supplier name from the list or null"
    }
  ]
}

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

Generate a complete wedding day timeline. Where a supplier is relevant to an event, set supplierName to their exact name from the list above.`;

  return { systemPrompt, userPrompt };
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

    // Call Ollama Cloud
    let rawContent: string;
    try {
      rawContent = await generateFromOllama([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
    } catch (error) {
      if (error instanceof OllamaError) {
        console.error("[timeline/generate] Ollama error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      throw error;
    }

    // Parse AI response
    let parsed: { events?: unknown[] };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("[timeline/generate] Invalid JSON from Ollama:", rawContent.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again." },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed?.events)) {
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 502 }
      );
    }

    // Build case-insensitive supplier name → id lookup
    const supplierLookup = new Map(
      suppliers.map((s) => [s.name.toLowerCase(), s.id])
    );

    // Normalise events and attach matched supplier IDs
    const events: DraftTimelineEvent[] = parsed.events
      .filter(
        (e): e is Record<string, unknown> =>
          typeof e === "object" && e !== null
      )
      .filter(
        (e) => typeof e.title === "string" && typeof e.startTime === "string"
      )
      .map((e) => {
        const rawSupplierName =
          typeof e.supplierName === "string" && e.supplierName.trim()
            ? e.supplierName.trim()
            : null;
        const supplierId = rawSupplierName
          ? (supplierLookup.get(rawSupplierName.toLowerCase()) ?? null)
          : null;

        return {
          title: String(e.title).trim(),
          startTime: String(e.startTime),
          durationMins:
            typeof e.durationMins === "number"
              ? Math.max(5, Math.round(e.durationMins))
              : 30,
          location:
            typeof e.location === "string" && e.location.trim()
              ? e.location.trim()
              : null,
          notes:
            typeof e.notes === "string" && e.notes.trim()
              ? e.notes.trim()
              : null,
          supplierId,
          supplierName: rawSupplierName,
        };
      });

    if (events.length === 0) {
      return NextResponse.json(
        { error: "AI did not generate any events. Please try again." },
        { status: 502 }
      );
    }

    return apiJson({ events });
  } catch (error) {
    return handleDbError(error);
  }
}

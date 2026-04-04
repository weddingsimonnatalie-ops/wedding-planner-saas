export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

/**
 * GET /api/internal/health
 *
 * Used by the admin console to verify SAAS_INTERNAL_URL and
 * ADMIN_INTERNAL_SECRET are correctly configured.
 *
 * Returns 200 { ok: true } if the Bearer token matches.
 * Returns 401 for missing/wrong token (deliberately no detail on misconfiguration).
 * Returns 429 if the IP is hammering the endpoint.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Rate limit by IP — 10 requests per minute
  const ip = extractIp(req);
  const { limited } = await checkRateLimit(`internal-health:${ip}`, 10, 60_000);
  if (limited) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  const secret = process.env.ADMIN_INTERNAL_SECRET;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Always check auth first — never leak whether the secret is configured
  if (!secret || !token || token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

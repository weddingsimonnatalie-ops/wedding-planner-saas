export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/internal/health
 *
 * Used by the admin console to verify SAAS_INTERNAL_URL and
 * ADMIN_INTERNAL_SECRET are correctly configured.
 *
 * Returns 200 { ok: true } if the Bearer token matches.
 * Returns 401 if the token is missing or wrong.
 * Returns 503 if ADMIN_INTERNAL_SECRET is not set on this app.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.ADMIN_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_INTERNAL_SECRET is not configured on the SaaS app" },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== secret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized — ADMIN_INTERNAL_SECRET does not match" },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}

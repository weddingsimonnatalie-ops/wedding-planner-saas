export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/internal/cancel-subscription
 *
 * Internal-only endpoint called by the admin console to cancel a Stripe
 * subscription. Kept in the SaaS app to honour the architecture constraint
 * (no Stripe SDK in the admin console).
 *
 * Auth: Bearer token matching ADMIN_INTERNAL_SECRET env var.
 * Body: { stripeSubscriptionId: string }
 *
 * Returns: { ok: true }
 *
 * DB changes are intentionally NOT made here — the admin console updates
 * the database directly after this call returns, and the Stripe webhook
 * (customer.subscription.deleted) will also fire as a redundant safety net.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  const secret = process.env.ADMIN_INTERNAL_SECRET;
  if (!secret) {
    console.error("[internal/cancel-subscription] ADMIN_INTERNAL_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let stripeSubscriptionId: string | undefined;
  try {
    const body = await req.json() as { stripeSubscriptionId?: string };
    stripeSubscriptionId = body.stripeSubscriptionId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!stripeSubscriptionId || typeof stripeSubscriptionId !== "string") {
    return NextResponse.json({ error: "stripeSubscriptionId is required" }, { status: 400 });
  }

  // Cancel in Stripe
  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error(`[internal/cancel-subscription] Stripe cancel failed for ${stripeSubscriptionId}:`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  console.log(`[internal/cancel-subscription] Cancelled Stripe subscription ${stripeSubscriptionId}`);
  return NextResponse.json({ ok: true });
}

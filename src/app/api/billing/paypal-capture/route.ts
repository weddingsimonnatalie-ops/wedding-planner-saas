export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubscription } from "@/lib/paypal";
import { requireRole } from "@/lib/api-auth";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/paypal-capture
 *
 * Captures the PayPal subscription ID after the user is redirected back from
 * PayPal approval. This is a belt-and-suspenders step — the webhook will also
 * set the subscription ID, but this ensures the user doesn't see a stale state
 * if the webhook hasn't fired yet.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { subscriptionId } = body as { subscriptionId?: string };

    if (!subscriptionId || typeof subscriptionId !== "string") {
      return NextResponse.json({ error: "subscriptionId is required" }, { status: 400 });
    }

    // Fetch wedding
    const wedding = await prisma.wedding.findUnique({
      where: { id: auth.weddingId },
      select: {
        billingProvider: true,
        paypalSubscriptionId: true,
      },
    });

    if (!wedding) {
      return NextResponse.json({ error: "Wedding not found" }, { status: 404 });
    }

    if (wedding.billingProvider !== "PAYPAL") {
      return NextResponse.json(
        { error: "This endpoint is for PayPal subscriptions only" },
        { status: 400 }
      );
    }

    if (wedding.paypalSubscriptionId) {
      // Already captured — idempotent success
      return NextResponse.json({ ok: true, alreadyCaptured: true });
    }

    // Verify the subscription exists in PayPal
    let subscription;
    try {
      subscription = await getSubscription(subscriptionId);
    } catch (err) {
      console.error("[paypal-capture] Failed to fetch subscription:", err);
      return NextResponse.json(
        { error: "Failed to verify PayPal subscription" },
        { status: 500 }
      );
    }

    // Verify the subscription belongs to this wedding (prevents cross-account claiming)
    if (subscription.custom_id !== auth.weddingId) {
      console.error(
        `[paypal-capture] custom_id mismatch: expected ${auth.weddingId}, got ${subscription.custom_id}`
      );
      return NextResponse.json(
        { error: "Subscription does not belong to this account" },
        { status: 403 }
      );
    }

    // Validate status (should be APPROVED or ACTIVE after user approval)
    const validStatuses = ["APPROVED", "ACTIVE"];
    if (!validStatuses.includes(subscription.status)) {
      return NextResponse.json(
        { error: `Unexpected subscription status: ${subscription.status}` },
        { status: 400 }
      );
    }

    // Store the subscription ID
    await prisma.wedding.update({
      where: { id: auth.weddingId },
      data: { paypalSubscriptionId: subscriptionId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleDbError(error);
  }
}
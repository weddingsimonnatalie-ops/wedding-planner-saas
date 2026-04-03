export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateSubscription } from "@/lib/paypal";
import { requireRole } from "@/lib/api-auth";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/paypal-reactivate
 *
 * Reactivates a suspended/cancelled PayPal subscription.
 * PayPal subscriptions can be reactivated if they were suspended
 * (e.g., due to payment failure) but not if they were explicitly cancelled.
 *
 * For explicitly cancelled subscriptions, the user needs to create a new
 * subscription via paypal-checkout.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req, { allowLapsed: true });
    if (!auth.authorized) return auth.response;

    const wedding = await prisma.wedding.findUnique({
      where: { id: auth.weddingId },
      select: {
        billingProvider: true,
        paypalSubscriptionId: true,
        subscriptionStatus: true,
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

    if (!wedding.paypalSubscriptionId) {
      return NextResponse.json(
        { error: "No PayPal subscription found. Please set up a new subscription." },
        { status: 400 }
      );
    }

    // Reactivate the subscription in PayPal
    try {
      await activateSubscription(wedding.paypalSubscriptionId, "Reactivated by user");
    } catch (err) {
      // PayPal may return an error if the subscription was explicitly cancelled
      // (cancelled subscriptions cannot be reactivated, only suspended ones can)
      console.error("[paypal-reactivate] PayPal error:", err);
      return NextResponse.json(
        { error: "This subscription cannot be reactivated. Please create a new subscription.", needsNewSubscription: true },
        { status: 400 }
      );
    }

    // Update DB status immediately (webhook will also fire)
    await prisma.wedding.update({
      where: { id: auth.weddingId },
      data: {
        subscriptionStatus: "ACTIVE",
        cancelledAt: null,
        gracePeriodEndsAt: null,
        // Note: We DON'T clear deleteScheduledAt here - that's a business decision
        // If they cancel again, the original deletion schedule resumes
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleDbError(error);
  }
}
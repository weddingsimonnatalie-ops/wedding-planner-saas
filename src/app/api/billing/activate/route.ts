export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAdmin } from "@/lib/api-auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/activate
 *
 * Ends the Stripe trial immediately by setting trial_end = "now".
 * Stripe will invoice the customer right away and attempt to charge
 * their saved payment method.
 *
 * For PayPal subscriptions, this endpoint returns an error because
 * PayPal trial activation is automatic (no API call needed).
 *
 * The DB subscription status update (TRIALING → ACTIVE or PAST_DUE)
 * happens asynchronously via the existing invoice.payment_succeeded /
 * invoice.payment_failed webhook handlers — no extra webhook handling needed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const wedding = await prisma.wedding.findUnique({
      where: { id: auth.weddingId },
      select: { subscriptionStatus: true, stripeSubscriptionId: true, billingProvider: true },
    });

    if (!wedding) {
      return NextResponse.json({ error: "Wedding not found" }, { status: 404 });
    }

    // PayPal trials activate automatically
    if (wedding.billingProvider === "PAYPAL") {
      return NextResponse.json(
        { error: "PayPal subscriptions activate automatically at the end of the trial period" },
        { status: 400 }
      );
    }

    if (wedding.subscriptionStatus !== "TRIALING") {
      return NextResponse.json(
        { error: "Subscription is not currently in trial" },
        { status: 409 }
      );
    }

    if (!wedding.stripeSubscriptionId) {
      return NextResponse.json(
        {
          error:
            "No Stripe subscription found. Please complete your initial checkout to set up billing.",
          noSubscription: true,
        },
        { status: 422 }
      );
    }

    await stripe.subscriptions.update(wedding.stripeSubscriptionId, {
      trial_end: "now",
    });

    console.log(
      `billing/activate: trial ended immediately for wedding ${auth.weddingId} (sub ${wedding.stripeSubscriptionId})`
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Surface Stripe errors directly — they contain actionable messages
    // (e.g. "This customer has no attached payment source")
    if (error instanceof Stripe.errors.StripeError) {
      console.error("billing/activate Stripe error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    return handleDbError(error);
  }
}

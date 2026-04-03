export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session for an existing customer who hasn't
 * completed their initial checkout. Used when stripeSubscriptionId is null.
 *
 * Returns: { checkoutUrl: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;

    const wedding = await prisma.wedding.findUnique({
      where: { id: auth.weddingId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    });

    if (!wedding) {
      return NextResponse.json({ error: "Wedding not found" }, { status: 404 });
    }

    // If they already have a subscription, they should use the portal instead
    if (wedding.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "Subscription already exists. Use the portal to manage billing." },
        { status: 409 }
      );
    }

    // If no Stripe customer, something is wrong — they need to re-register
    if (!wedding.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found. Please contact support." },
        { status: 422 }
      );
    }

    const priceId = process.env.STRIPE_PRICE_ID_STANDARD;
    if (!priceId) {
      return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
    }

    const trialDays = parseInt(process.env.TRIAL_DAYS ?? "14", 10);
    const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: wedding.stripeCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { weddingId: auth.weddingId },
      },
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancelled`,
      metadata: { weddingId: auth.weddingId },
    });

    console.log(
      `billing/checkout: created session for wedding ${auth.weddingId} (customer ${wedding.stripeCustomerId})`
    );

    return NextResponse.json({ checkoutUrl: checkoutSession.url });
  } catch (error) {
    return handleDbError(error);
  }
}
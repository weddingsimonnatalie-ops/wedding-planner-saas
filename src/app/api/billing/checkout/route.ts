export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session for a Free Tier user to upgrade to paid.
 * If the user doesn't have a Stripe customer yet, one is created.
 * No trial period — immediate payment.
 *
 * Returns: { checkoutUrl: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;

    const wedding = await prisma.wedding.findUnique({
      where: { id: auth.weddingId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true },
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

    const priceId = process.env.STRIPE_PRICE_ID_STANDARD;
    if (!priceId) {
      return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
    }

    const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");

    // Create Stripe customer if they don't have one
    let customerId = wedding.stripeCustomerId;
    if (!customerId) {
      // Get user email for Stripe customer
      const user = await prisma.user.findFirst({
        where: { weddings: { some: { weddingId: auth.weddingId, role: "ADMIN" } } },
        select: { email: true, name: true },
      });

      const customer = await stripe.customers.create({
        email: user?.email,
        name: user?.name ?? undefined,
        metadata: { weddingId: auth.weddingId },
      });

      customerId = customer.id;

      await prisma.wedding.update({
        where: { id: auth.weddingId },
        data: { stripeCustomerId: customerId },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancelled`,
      metadata: { weddingId: auth.weddingId },
    });

    console.log(
      `billing/checkout: created session for wedding ${auth.weddingId} (customer ${customerId})`
    );

    return NextResponse.json({ checkoutUrl: checkoutSession.url });
  } catch (error) {
    return handleDbError(error);
  }
}
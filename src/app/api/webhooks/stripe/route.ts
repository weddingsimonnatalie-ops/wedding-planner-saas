import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";

// Stripe webhooks must read the raw body for signature verification —
// do not use NextResponse.json() body parsing before this route runs.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Idempotency: skip if we've already processed this event
  const existing = await prisma.stripeEvent.findUnique({
    where: { eventId: event.id },
  });
  if (existing) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const weddingId = session.metadata?.weddingId;
        if (!weddingId) {
          console.error("checkout.session.completed: missing weddingId in metadata", session.id);
          break;
        }
        await prisma.wedding.update({
          where: { id: weddingId },
          data: {
            stripeSubscriptionId: session.subscription as string,
            subscriptionStatus: "TRIALING",
          },
        });
        await inngest.send({ name: "wedding/created", data: { weddingId } });
        console.log(`checkout.session.completed: wedding ${weddingId} trialing`);
        break;
      }

      case "invoice.payment_succeeded": {
        // In Stripe SDK v20, Invoice.subscription may be typed as an expanded object.
        // Webhook payloads always send the raw string ID, so we extract it safely.
        const invoiceObj = event.data.object as unknown as {
          subscription?: string | { id: string } | null;
          lines?: { data: Array<{ period?: { end?: number } }> };
        };
        const rawSub = invoiceObj.subscription;
        const subscriptionId = typeof rawSub === "string" ? rawSub : rawSub?.id;
        if (!subscriptionId) break;

        // currentPeriodEnd from the subscription line item
        const periodEnd = invoiceObj.lines?.data[0]?.period?.end;
        await prisma.wedding.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            subscriptionStatus: "ACTIVE",
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            gracePeriodEndsAt: null,
          },
        });
        console.log(`invoice.payment_succeeded: subscription ${subscriptionId} active`);
        break;
      }

      case "invoice.payment_failed": {
        const failedInvoice = event.data.object as unknown as {
          subscription?: string | { id: string } | null;
        };
        const rawFailedSub = failedInvoice.subscription;
        const subscriptionId = typeof rawFailedSub === "string" ? rawFailedSub : rawFailedSub?.id;
        if (!subscriptionId) break;

        const graceDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? "7", 10);
        await prisma.wedding.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            subscriptionStatus: "PAST_DUE",
            gracePeriodEndsAt: new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000),
          },
        });
        await inngest.send({ name: "stripe/payment.failed", data: { subscriptionId } });
        console.log(`invoice.payment_failed: subscription ${subscriptionId} past_due, grace period set`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);
        await prisma.wedding.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            subscriptionStatus: "CANCELLED",
            cancelledAt: new Date(),
            deleteScheduledAt: new Date(
              Date.now() + retentionDays * 24 * 60 * 60 * 1000
            ),
          },
        });
        const cancelledWedding = await prisma.wedding.findFirst({
          where: { stripeSubscriptionId: subscription.id },
          select: { id: true },
        });
        if (cancelledWedding) {
          await inngest.send({ name: "wedding/cancelled", data: { weddingId: cancelledWedding.id } });
        }
        console.log(`customer.subscription.deleted: subscription ${subscription.id} cancelled`);
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        await inngest.send({ name: "stripe/trial.will_end", data: { subscriptionId: subscription.id } });
        console.log(`customer.subscription.trial_will_end: subscription ${subscription.id}`);
        break;
      }

      default:
        // Unhandled event — log and ignore
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing Stripe event ${event.id} (${event.type}):`, err);
    // Don't record the event so Stripe retries it
    return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
  }

  // Record event for idempotency (outside the switch so it always runs on success)
  await prisma.stripeEvent.create({
    data: { eventId: event.id, eventType: event.type },
  });

  return NextResponse.json({ received: true });
}

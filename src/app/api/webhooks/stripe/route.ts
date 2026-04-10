import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";

// Stripe webhooks must read the raw body for signature verification —
// do not use NextResponse.json() body parsing before this route runs.
export const dynamic = "force-dynamic";

/**
 * Calculate when a wedding's data should be purged.
 * - If weddingDate is in the future: 60 days after weddingDate
 * - If weddingDate is in the past: 60 days from now
 * - If no weddingDate: retentionDays from now (default 365)
 */
function calculateDeleteScheduledAt(weddingDate: Date | null, retentionDays: number): Date {
  if (weddingDate) {
    const purgeDate = new Date(weddingDate);
    purgeDate.setDate(purgeDate.getDate() + 60);
    // If wedding date is in the past, use 60 days from now instead
    if (purgeDate < new Date()) {
      return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    }
    return purgeDate;
  }
  return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — cannot verify signature");
    return NextResponse.json({ error: "Webhook misconfigured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
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

  const useInngest = !!process.env.INNGEST_EVENT_KEY;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const weddingId = session.metadata?.weddingId;
        if (!weddingId) {
          console.error("checkout.session.completed: missing weddingId in metadata", session.id);
          // Return 400 so Stripe retries — do NOT fall through to record the event
          return NextResponse.json({ error: "Missing weddingId in session metadata" }, { status: 400 });
        }

        // session.subscription can be null if Stripe hasn't created the subscription
        // object yet (race condition). If null, schedule a delayed sync to pick it up.
        const subscriptionId = session.subscription as string | null;
        if (!subscriptionId) {
          console.log(`checkout.session.completed: subscription not yet created for wedding ${weddingId}, scheduling delayed sync`);
          if (useInngest) {
            await inngest.send({
              name: "stripe/sync.delayed",
              data: { weddingId },
              ts: Date.now() + 30000, // Run 30 seconds from now
            });
          }
          break;
        }

        // When a Free user upgrades via checkout, they become ACTIVE immediately
        // (no trial period in the new model)
        await prisma.wedding.update({
          where: { id: weddingId },
          data: {
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: "ACTIVE",
          },
        });
        if (useInngest) await inngest.send({ name: "wedding/created", data: { weddingId } });
        console.log(`checkout.session.completed: wedding ${weddingId} active`);
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
        const matchedWedding = await prisma.wedding.findUnique({
          where: { stripeSubscriptionId: subscriptionId },
          select: { id: true },
        });
        if (!matchedWedding) {
          console.warn(`invoice.payment_succeeded: no wedding found for subscription ${subscriptionId} — skipping`);
          break;
        }
        await prisma.wedding.update({
          where: { id: matchedWedding.id },
          data: {
            subscriptionStatus: "ACTIVE",
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
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

        const failedWedding = await prisma.wedding.findUnique({
          where: { stripeSubscriptionId: subscriptionId },
          select: { id: true },
        });
        if (!failedWedding) {
          console.warn(`invoice.payment_failed: no wedding found for subscription ${subscriptionId} — skipping`);
          break;
        }
        await prisma.wedding.update({
          where: { id: failedWedding.id },
          data: {
            subscriptionStatus: "PAST_DUE",
          },
        });
        if (useInngest) await inngest.send({ name: "stripe/payment.failed", data: { subscriptionId } });
        console.log(`invoice.payment_failed: subscription ${subscriptionId} past_due`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "365", 10);
        const cancelledWedding = await prisma.wedding.findUnique({
          where: { stripeSubscriptionId: subscription.id },
          select: { id: true, weddingDate: true },
        });
        if (!cancelledWedding) {
          console.warn(`customer.subscription.deleted: no wedding found for subscription ${subscription.id} — skipping`);
          break;
        }
        const deleteScheduledAt = calculateDeleteScheduledAt(cancelledWedding.weddingDate, retentionDays);
        await prisma.wedding.update({
          where: { id: cancelledWedding.id },
          data: {
            subscriptionStatus: "FREE",
            cancelledAt: new Date(),
            deleteScheduledAt,
          },
        });
        if (useInngest) await inngest.send({ name: "wedding/cancelled", data: { weddingId: cancelledWedding.id } });
        console.log(`customer.subscription.deleted: subscription ${subscription.id} downgraded to FREE`);
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
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/paypal";
import { inngest } from "@/lib/inngest/client";

// PayPal webhooks must read the raw body for signature verification
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  // Extract PayPal webhook headers
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const certUrl = req.headers.get("paypal-cert-url");
  const authAlgo = req.headers.get("paypal-auth-algo");
  const transmissionSig = req.headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return NextResponse.json({ error: "Missing PayPal webhook headers" }, { status: 400 });
  }

  // Verify webhook signature with PayPal
  const isValid = await verifyWebhookSignature(
    {
      "paypal-transmission-id": transmissionId,
      "paypal-transmission-time": transmissionTime,
      "paypal-cert-url": certUrl,
      "paypal-auth-algo": authAlgo,
      "paypal-transmission-sig": transmissionSig,
    },
    rawBody
  );

  if (!isValid) {
    console.error("PayPal webhook signature verification failed");
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Parse the event
  let event: { id: string; event_type: string; resource: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Idempotency: skip if we've already processed this event
  const existing = await prisma.payPalEvent.findUnique({
    where: { eventId: event.id },
  });
  if (existing) {
    return NextResponse.json({ received: true });
  }

  const useInngest = !!process.env.INNGEST_EVENT_KEY;

  try {
    switch (event.event_type) {
      case "BILLING.SUBSCRIPTION.CREATED": {
        // This fires when a subscription is created — use custom_id to find the wedding
        const resource = event.resource as { id?: string; custom_id?: string };
        const subscriptionId = resource.id;
        const weddingId = resource.custom_id;

        if (!subscriptionId) {
          console.error("BILLING.SUBSCRIPTION.CREATED: missing subscription ID");
          break;
        }

        // If we have a weddingId from custom_id, update the wedding
        if (weddingId) {
          const wedding = await prisma.wedding.findUnique({
            where: { id: weddingId },
            select: { paypalSubscriptionId: true },
          });

          if (wedding && !wedding.paypalSubscriptionId) {
            await prisma.wedding.update({
              where: { id: weddingId },
              data: {
                paypalSubscriptionId: subscriptionId,
                subscriptionStatus: "TRIALING",
              },
            });
            console.log(`BILLING.SUBSCRIPTION.CREATED: wedding ${weddingId} linked to subscription ${subscriptionId}`);
          }
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        // Subscription is now active (after trial or reactivation)
        const resource = event.resource as { id?: string };
        const subscriptionId = resource.id;
        if (!subscriptionId) break;

        await prisma.wedding.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: {
            subscriptionStatus: "ACTIVE",
            gracePeriodEndsAt: null,
          },
        });
        console.log(`BILLING.SUBSCRIPTION.ACTIVATED: subscription ${subscriptionId} active`);
        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        // A payment was successfully processed
        const resource = event.resource as {
          billing_agreement_id?: string;
          next_billing_time?: string;
        };
        const subscriptionId = resource.billing_agreement_id;
        if (!subscriptionId) break;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
          subscriptionStatus: "ACTIVE",
          gracePeriodEndsAt: null,
        };

        if (resource.next_billing_time) {
          updateData.currentPeriodEnd = new Date(resource.next_billing_time);
        }

        await prisma.wedding.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: updateData,
        });
        console.log(`PAYMENT.SALE.COMPLETED: subscription ${subscriptionId} payment successful`);
        break;
      }

      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        // Payment failed — enter grace period
        const resource = event.resource as { id?: string };
        const subscriptionId = resource.id;
        if (!subscriptionId) break;

        const graceDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? "7", 10);
        await prisma.wedding.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: {
            subscriptionStatus: "PAST_DUE",
            gracePeriodEndsAt: new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000),
          },
        });
        if (useInngest) await inngest.send({ name: "paypal/payment.failed", data: { subscriptionId } });
        console.log(`BILLING.SUBSCRIPTION.PAYMENT.FAILED: subscription ${subscriptionId} past_due, grace period set`);
        break;
      }

      case "BILLING.SUBSCRIPTION.SUSPENDED": {
        // Subscription suspended (payment failure threshold exceeded)
        const resource = event.resource as { id?: string };
        const subscriptionId = resource.id;
        if (!subscriptionId) break;

        const graceDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? "7", 10);
        await prisma.wedding.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: {
            subscriptionStatus: "PAST_DUE",
            gracePeriodEndsAt: new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000),
          },
        });
        console.log(`BILLING.SUBSCRIPTION.SUSPENDED: subscription ${subscriptionId} suspended`);
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED": {
        // Subscription cancelled
        const resource = event.resource as { id?: string };
        const subscriptionId = resource.id;
        if (!subscriptionId) break;

        const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);
        await prisma.wedding.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: {
            subscriptionStatus: "CANCELLED",
            cancelledAt: new Date(),
            deleteScheduledAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
          },
        });

        const cancelledWedding = await prisma.wedding.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
          select: { id: true },
        });
        if (cancelledWedding) {
          if (useInngest) await inngest.send({ name: "wedding/cancelled", data: { weddingId: cancelledWedding.id } });
        }
        console.log(`BILLING.SUBSCRIPTION.CANCELLED: subscription ${subscriptionId} cancelled`);
        break;
      }

      case "BILLING.SUBSCRIPTION.EXPIRED": {
        // Subscription expired (same as cancelled)
        const resource = event.resource as { id?: string };
        const subscriptionId = resource.id;
        if (!subscriptionId) break;

        const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);
        await prisma.wedding.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: {
            subscriptionStatus: "CANCELLED",
            cancelledAt: new Date(),
            deleteScheduledAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
          },
        });
        console.log(`BILLING.SUBSCRIPTION.EXPIRED: subscription ${subscriptionId} expired`);
        break;
      }

      default:
        // Unhandled event — log and ignore
        console.log(`Unhandled PayPal event type: ${event.event_type}`);
    }
  } catch (err) {
    console.error(`Error processing PayPal event ${event.id} (${event.event_type}):`, err);
    // Don't record the event so PayPal retries it
    return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
  }

  // Record event for idempotency
  await prisma.payPalEvent.create({
    data: { eventId: event.id, eventType: event.event_type },
  });

  return NextResponse.json({ received: true });
}
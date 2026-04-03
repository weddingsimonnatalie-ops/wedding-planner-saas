export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelSubscription } from "@/lib/paypal";
import { requireRole } from "@/lib/api-auth";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/paypal-cancel
 *
 * Cancels a PayPal subscription. The webhook will handle the DB update,
 * but we also update immediately for better UX.
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
        { error: "No PayPal subscription found" },
        { status: 400 }
      );
    }

    // Cancel subscription in PayPal
    await cancelSubscription(wedding.paypalSubscriptionId, "Cancelled by user");

    // Update DB immediately (webhook will also fire)
    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);
    await prisma.wedding.update({
      where: { id: auth.weddingId },
      data: {
        subscriptionStatus: "CANCELLED",
        cancelledAt: new Date(),
        deleteScheduledAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleDbError(error);
  }
}
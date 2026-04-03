export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSubscription } from "@/lib/paypal";
import { requireRole } from "@/lib/api-auth";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/paypal-checkout
 *
 * Creates a PayPal subscription for a PayPal user who doesn't have one yet.
 * Returns the approval URL for the user to approve the subscription.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;

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
        { error: "Use Stripe checkout for this wedding" },
        { status: 400 }
      );
    }

    if (wedding.paypalSubscriptionId) {
      return NextResponse.json(
        { error: "Subscription already exists" },
        { status: 409 }
      );
    }

    const paypalPlanId = process.env.PAYPAL_PLAN_ID_STANDARD;
    if (!paypalPlanId) {
      return NextResponse.json(
        { error: "PayPal billing is not configured" },
        { status: 500 }
      );
    }

    // Get user email for PayPal subscriber
    const user = await prisma.user.findFirst({
      where: {
        weddings: {
          some: {
            weddingId: auth.weddingId,
            role: "ADMIN",
          },
        },
      },
      select: { email: true },
    });

    if (!user?.email) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const returnUrl = `${appUrl}/billing?paypal=success`;
    const cancelUrl = `${appUrl}/billing`;

    const { approvalUrl } = await createSubscription(
      paypalPlanId,
      user.email,
      returnUrl,
      cancelUrl,
      auth.weddingId
    );

    return NextResponse.json({ checkoutUrl: approvalUrl });
  } catch (error) {
    return handleDbError(error);
  }
}
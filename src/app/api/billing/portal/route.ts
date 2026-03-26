export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { handleDbError } from "@/lib/db-error";

async function createPortalSession(req: NextRequest): Promise<NextResponse> {
  try {
    // allowLapsed: true — cancelled/past-due users must be able to reach the portal to reactivate
    const auth = await requireRole(["ADMIN"], req, { allowLapsed: true });
    if (!auth.authorized) return auth.response;

    const wedding = await prisma.wedding.findUnique({
      where: { id: auth.weddingId },
      select: { stripeCustomerId: true },
    });

    if (!wedding?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer linked to this wedding" },
        { status: 404 }
      );
    }

    const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: wedding.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    // 303 See Other — correct redirect for both GET and POST → GET flows
    return NextResponse.redirect(portalSession.url, { status: 303 });
  } catch (error) {
    return handleDbError(error);
  }
}

// Billing page uses <form method="POST">
export const POST = createPortalSession;

// Billing/suspended page uses <a href="..."> (GET)
export const GET = createPortalSession;

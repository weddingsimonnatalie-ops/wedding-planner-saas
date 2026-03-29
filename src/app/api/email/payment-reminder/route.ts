import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireEmailFeature } from "@/lib/api-auth";
import { sendPaymentReminderEmail } from "@/lib/email";
import { checkRateLimit, getEmailRateLimit } from "@/lib/rate-limit";
import { withTenantContext } from "@/lib/tenant";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const emailGate = requireEmailFeature(auth.wedding.subscriptionStatus);
    if (emailGate) return emailGate;

    // Rate limit per user to prevent email abuse
    const rateKey = `email:payment:${auth.user.id}`;
    const { max, windowMs } = getEmailRateLimit();
    const rateCheck = await checkRateLimit(rateKey, max, windowMs);
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const { paymentId } = await req.json();
    if (!paymentId) return NextResponse.json({ error: "paymentId required" }, { status: 400 });

    const { payment, wedding } = await withTenantContext(weddingId, async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId, weddingId },
        include: { supplier: true },
      });
      const wedding = await tx.wedding.findUnique({ where: { id: weddingId } });
      return { payment, wedding };
    });

    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const to = wedding?.reminderEmail || process.env.SMTP_FROM || "";
    if (!to) return NextResponse.json({ error: "No recipient email configured" }, { status: 400 });

    const result = await sendPaymentReminderEmail(
      to,
      payment.supplier.name,
      payment.label,
      payment.amount,
      payment.dueDate ? new Date(payment.dueDate) : new Date()
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });

  } catch (error) {
    return handleDbError(error);
  }

}

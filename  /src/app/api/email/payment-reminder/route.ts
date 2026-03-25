import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sendPaymentReminderEmail } from "@/lib/email";
import { checkRateLimit, getEmailRateLimit } from "@/lib/rate-limit";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

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

    const [payment, config] = await Promise.all([
      prisma.payment.findUnique({ where: { id: paymentId }, include: { supplier: true } }),
      prisma.weddingConfig.findFirst(),
    ]);
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const to = config?.reminderEmail || process.env.SMTP_FROM || "";
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
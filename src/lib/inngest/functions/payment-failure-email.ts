import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import * as nodemailer from "nodemailer";

export const paymentFailureEmail = inngest.createFunction(
  { id: "payment-failure-email", name: "Payment Failure Email", triggers: [{ event: "stripe/payment.failed" }] },
  async ({ event }) => {
    const { subscriptionId } = event.data as { subscriptionId: string };

    const wedding = await prisma.wedding.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true, coupleName: true, currentPeriodEnd: true, reminderEmail: true },
    });

    if (!wedding) {
      console.log(`[payment-failure-email] No wedding found for subscription ${subscriptionId}`);
      return;
    }

    const toEmail = wedding.reminderEmail || process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!toEmail) {
      console.log(`[payment-failure-email] No recipient email for wedding ${wedding.id}`);
      return;
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      console.log(`[payment-failure-email] SMTP not configured — skipping email for wedding ${wedding.id}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: false,
      auth: { user, pass },
    });

    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const graceEnd = wedding.currentPeriodEnd
      ? wedding.currentPeriodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "soon";

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to: toEmail,
      subject: `Action required: Payment failed for Wedding Planner`,
      text: [
        `Hi,`,
        ``,
        `Your payment for Wedding Planner (${wedding.coupleName}) failed.`,
        ``,
        `You have until ${graceEnd} to update your payment method before access is suspended.`,
        ``,
        `Update your payment method here:`,
        `${appUrl}/billing`,
      ].join("\n"),
    });

    console.log(`[payment-failure-email] Sent payment failure email for wedding ${wedding.id}`);
  }
);

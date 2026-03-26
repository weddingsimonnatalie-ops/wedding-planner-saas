import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import * as nodemailer from "nodemailer";

export const trialEndingReminder = inngest.createFunction(
  { id: "trial-ending-reminder", name: "Trial Ending Reminder", triggers: [{ event: "stripe/trial.will_end" }] },
  async ({ event }) => {
    const { subscriptionId } = event.data as { subscriptionId: string };

    const wedding = await prisma.wedding.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true, coupleName: true, trialEndsAt: true, reminderEmail: true },
    });

    if (!wedding) {
      console.log(`[trial-ending-reminder] No wedding found for subscription ${subscriptionId}`);
      return;
    }

    const toEmail = wedding.reminderEmail || process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!toEmail) {
      console.log(`[trial-ending-reminder] No recipient email for wedding ${wedding.id}`);
      return;
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      console.log(`[trial-ending-reminder] SMTP not configured — skipping email for wedding ${wedding.id}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: false,
      auth: { user, pass },
    });

    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const trialEnd = wedding.trialEndsAt
      ? wedding.trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "soon";

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to: toEmail,
      subject: `Your Wedding Planner trial ends ${trialEnd}`,
      text: [
        `Hi,`,
        ``,
        `Your free trial for Wedding Planner (${wedding.coupleName}) ends on ${trialEnd}.`,
        ``,
        `To keep your wedding data and continue using the app, add a payment method:`,
        `${appUrl}/billing`,
        ``,
        `After your trial ends, you'll be charged £12/month.`,
      ].join("\n"),
    });

    console.log(`[trial-ending-reminder] Sent trial ending email for wedding ${wedding.id}`);
  }
);

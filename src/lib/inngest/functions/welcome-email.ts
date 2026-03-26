import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import * as nodemailer from "nodemailer";

export const welcomeEmail = inngest.createFunction(
  { id: "welcome-email", name: "Welcome Email", triggers: [{ event: "wedding/created" }] },
  async ({ event }) => {
    const { weddingId } = event.data as { weddingId: string };

    const wedding = await prisma.wedding.findUnique({
      where: { id: weddingId },
      select: {
        coupleName: true,
        reminderEmail: true,
        members: { select: { user: { select: { email: true } } }, take: 1 },
      },
    });

    if (!wedding) {
      console.log(`[welcome-email] Wedding ${weddingId} not found`);
      return;
    }

    const toEmail =
      wedding.reminderEmail ||
      wedding.members[0]?.user?.email ||
      process.env.SMTP_FROM ||
      process.env.SMTP_USER;

    if (!toEmail) {
      console.log(`[welcome-email] No recipient email for wedding ${weddingId}`);
      return;
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      console.log(`[welcome-email] SMTP not configured — skipping email for wedding ${weddingId}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: false,
      auth: { user, pass },
    });

    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to: toEmail,
      subject: `Welcome to Wedding Planner!`,
      text: [
        `Hi,`,
        ``,
        `Welcome to Wedding Planner! Your account for "${wedding.coupleName}" is ready.`,
        ``,
        `Get started by setting up your wedding details:`,
        `${appUrl}/onboarding/wedding`,
        ``,
        `Your 14-day free trial is now active. No charge until your trial ends.`,
      ].join("\n"),
    });

    console.log(`[welcome-email] Sent welcome email for wedding ${weddingId}`);
  }
);

import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import * as nodemailer from "nodemailer";

export const cancellationDataExport = inngest.createFunction(
  { id: "cancellation-data-export", name: "Cancellation Data Export", triggers: [{ event: "wedding/cancelled" }] },
  async ({ event }) => {
    const { weddingId } = event.data as { weddingId: string };

    const wedding = await prisma.wedding.findUnique({
      where: { id: weddingId },
      select: {
        coupleName: true,
        deleteScheduledAt: true,
        reminderEmail: true,
        members: { select: { user: { select: { email: true } } }, take: 1 },
      },
    });

    if (!wedding) {
      console.log(`[cancellation-data-export] Wedding ${weddingId} not found`);
      return;
    }

    const toEmail =
      wedding.reminderEmail ||
      wedding.members[0]?.user?.email ||
      process.env.SMTP_FROM ||
      process.env.SMTP_USER;

    if (!toEmail) {
      console.log(`[cancellation-data-export] No recipient email for wedding ${weddingId}`);
      return;
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      console.log(`[cancellation-data-export] SMTP not configured — skipping email for wedding ${weddingId}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: false,
      auth: { user, pass },
    });

    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const deleteDate = wedding.deleteScheduledAt
      ? wedding.deleteScheduledAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "90 days from now";

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to: toEmail,
      subject: `Your Wedding Planner subscription has been cancelled`,
      text: [
        `Hi,`,
        ``,
        `Your Wedding Planner subscription for "${wedding.coupleName}" has been cancelled.`,
        ``,
        `Your data will be permanently deleted on ${deleteDate}.`,
        ``,
        `If you'd like to export your data before deletion, log in and use the export feature:`,
        `${appUrl}/billing`,
        ``,
        `To reactivate your subscription before deletion, visit:`,
        `${appUrl}/billing`,
      ].join("\n"),
    });

    console.log(`[cancellation-data-export] Sent cancellation email for wedding ${weddingId}`);
  }
);

import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import * as nodemailer from "nodemailer";

export const preDeletionWarning = inngest.createFunction(
  { id: "pre-deletion-warning", name: "Pre-Deletion Warning", triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    const now = new Date();

    // Find weddings scheduled for deletion in exactly 7 days (within a 24-hour window)
    const warningStart = new Date(now);
    warningStart.setDate(warningStart.getDate() + 7);
    warningStart.setHours(0, 0, 0, 0);

    const warningEnd = new Date(warningStart);
    warningEnd.setHours(23, 59, 59, 999);

    const weddingsToWarn = await prisma.wedding.findMany({
      where: {
        subscriptionStatus: "FREE",
        deleteScheduledAt: { gte: warningStart, lte: warningEnd },
      },
      select: {
        id: true,
        coupleName: true,
        deleteScheduledAt: true,
        reminderEmail: true,
        members: {
          select: { user: { select: { email: true } } },
          take: 1,
        },
      },
    });

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    let warned = 0;

    for (const wedding of weddingsToWarn) {
      await step.run(`warn-wedding-${wedding.id}`, async () => {
        const toEmail =
          wedding.reminderEmail ||
          wedding.members[0]?.user?.email ||
          process.env.SMTP_FROM ||
          process.env.SMTP_USER;

        if (!toEmail) {
          console.log(`[pre-deletion-warning] No recipient email for wedding ${wedding.id}`);
          return;
        }

        if (!host || !user || !pass) {
          console.log(`[pre-deletion-warning] SMTP not configured — skipping email for wedding ${wedding.id}`);
          return;
        }

        const transporter = nodemailer.createTransport({
          host,
          port: parseInt(process.env.SMTP_PORT ?? "587"),
          secure: false,
          auth: { user, pass },
        });

        const deleteDate = wedding.deleteScheduledAt!.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM ?? user,
          to: toEmail,
          subject: `Your Wedding Planner data will be deleted on ${deleteDate}`,
          text: [
            `Hi,`,
            ``,
            `This is a reminder that your Wedding Planner data for "${wedding.coupleName}" will be permanently deleted on ${deleteDate}.`,
            ``,
            `Your account is currently on the Free Tier, which has a limited number of guests. If you'd like to keep all your data beyond the guest limit, you can upgrade to a paid plan:`,
            `${appUrl}/billing`,
            ``,
            `If you'd like to keep your data, download an export before then:`,
            `${appUrl}/billing`,
            ``,
            `After ${deleteDate}, all your data — including guests, suppliers, and attachments — will be permanently removed and cannot be recovered.`,
          ].join("\n"),
        });

        console.log(`[pre-deletion-warning] Sent deletion warning for wedding ${wedding.id}`);
      });

      warned++;
    }

    console.log(`[pre-deletion-warning] Warned ${warned} weddings`);
    return { warned };
  }
);

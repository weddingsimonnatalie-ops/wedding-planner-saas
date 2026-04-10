import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

export const gracePeriodExpiry = inngest.createFunction(
  { id: "grace-period-expiry", name: "Grace Period Expiry", triggers: [{ cron: "0 5 * * *" }] },
  async ({ step }) => {
    const now = new Date();

    const expiredWeddings = await prisma.wedding.findMany({
      where: {
        subscriptionStatus: "PAST_DUE",
        currentPeriodEnd: { lt: now },
      },
      select: { id: true, weddingDate: true },
    });

    for (const wedding of expiredWeddings) {
      await step.run(`cancel-wedding-${wedding.id}`, async () => {
        // Calculate deleteScheduledAt based on wedding date
        let deleteScheduledAt: Date;
        if (wedding.weddingDate && new Date(wedding.weddingDate) > now) {
          // Wedding is in the future — keep data for 60 days after the wedding
          const weddingDate = new Date(wedding.weddingDate);
          deleteScheduledAt = new Date(weddingDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        } else if (wedding.weddingDate) {
          // Wedding is in the past — keep data for 60 days from now
          deleteScheduledAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        } else {
          // No wedding date set — keep data for 365 days from now
          deleteScheduledAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        }

        await prisma.wedding.update({
          where: { id: wedding.id },
          data: {
            subscriptionStatus: "FREE",
            cancelledAt: now,
            deleteScheduledAt,
          },
        });

        await inngest.send({
          name: "wedding/cancelled",
          data: { weddingId: wedding.id },
        });
      });
    }

    console.log(`[grace-period-expiry] Downgraded ${expiredWeddings.length} expired weddings to Free Tier`);
    return { downgraded: expiredWeddings.length };
  }
);

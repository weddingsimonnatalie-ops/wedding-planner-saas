import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

export const gracePeriodExpiry = inngest.createFunction(
  { id: "grace-period-expiry", name: "Grace Period Expiry", triggers: [{ cron: "0 5 * * *" }] },
  async ({ step }) => {
    const now = new Date();

    const expiredWeddings = await prisma.wedding.findMany({
      where: {
        subscriptionStatus: "PAST_DUE",
        gracePeriodEndsAt: { lt: now },
      },
      select: { id: true },
    });

    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);

    for (const wedding of expiredWeddings) {
      await step.run(`cancel-wedding-${wedding.id}`, async () => {
        await prisma.wedding.update({
          where: { id: wedding.id },
          data: {
            subscriptionStatus: "CANCELLED",
            cancelledAt: now,
            deleteScheduledAt: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000),
          },
        });

        await inngest.send({
          name: "wedding/cancelled",
          data: { weddingId: wedding.id },
        });
      });
    }

    console.log(`[grace-period-expiry] Cancelled ${expiredWeddings.length} expired weddings`);
    return { cancelled: expiredWeddings.length };
  }
);

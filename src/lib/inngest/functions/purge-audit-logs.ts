import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

export const purgeAuditLogs = inngest.createFunction(
  { id: "purge-audit-logs", name: "Purge Audit Logs", triggers: [{ cron: "0 4 * * *" }] },
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const [loginAttempts, stripeEvents] = await Promise.all([
      prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.stripeEvent.deleteMany({ where: { processedAt: { lt: cutoff } } }),
    ]);

    console.log(
      `[purge-audit-logs] Deleted ${loginAttempts.count} login attempts and ${stripeEvents.count} Stripe events older than 90 days`
    );
    return { loginAttempts: loginAttempts.count, stripeEvents: stripeEvents.count };
  }
);

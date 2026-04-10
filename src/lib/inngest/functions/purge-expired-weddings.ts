import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { deletePrefix } from "@/lib/s3";

export const purgeExpiredWeddings = inngest.createFunction(
  { id: "purge-expired-weddings", name: "Purge Expired Weddings", triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => {
    const now = new Date();

    const expiredWeddings = await prisma.wedding.findMany({
      where: {
        subscriptionStatus: "FREE",
        deleteScheduledAt: { lte: now },
      },
      select: { id: true, coupleName: true },
    });

    let purged = 0;

    for (const wedding of expiredWeddings) {
      await step.run(`purge-wedding-${wedding.id}`, async () => {
        // Delete all S3 files under /{weddingId}/
        const filesDeleted = await deletePrefix(`${wedding.id}/`);
        console.log(`[purge-expired-weddings] Deleted ${filesDeleted} S3 files for wedding ${wedding.id}`);

        // Delete Wedding record — cascades to all related rows via FK
        await prisma.wedding.delete({ where: { id: wedding.id } });

        console.log(`[purge-expired-weddings] Purged wedding ${wedding.id} (${wedding.coupleName})`);
      });

      purged++;
    }

    console.log(`[purge-expired-weddings] Purged ${purged} expired weddings`);
    return { purged };
  }
);

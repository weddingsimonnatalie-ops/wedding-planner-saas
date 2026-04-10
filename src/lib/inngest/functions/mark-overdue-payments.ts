import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";

export const markOverduePayments = inngest.createFunction(
  { id: "mark-overdue-payments", name: "Mark Overdue Payments", triggers: [{ cron: "0 6 * * *" }] },
  async () => {
    const now = new Date();

    const activeWeddings = await prisma.wedding.findMany({
      where: { subscriptionStatus: { in: ["FREE", "ACTIVE", "PAST_DUE"] } },
      select: { id: true },
    });

    let totalMarked = 0;

    for (const wedding of activeWeddings) {
      const result = await withTenantContext(wedding.id, (tx) =>
        tx.payment.updateMany({
          where: { weddingId: wedding.id, status: "PENDING", dueDate: { lt: now } },
          data: { status: "OVERDUE" },
        })
      );
      totalMarked += result.count;
    }

    console.log(`[mark-overdue-payments] Marked ${totalMarked} payments overdue across ${activeWeddings.length} weddings`);
    return { marked: totalMarked };
  }
);

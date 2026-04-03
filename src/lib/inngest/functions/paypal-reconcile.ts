import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { syncWeddingFromPayPal } from "@/lib/paypal-sync";

/**
 * Nightly reconciliation cron that syncs all active PayPal subscriptions
 * with the database. Handles missed webhooks (delivery failures, local dev
 * without PayPal tunnel, etc.).
 *
 * Runs at 2:30 AM UTC daily (staggered from Stripe reconcile). Only processes
 * weddings with a PayPal subscription ID that are not already cancelled.
 */
export const paypalReconcile = inngest.createFunction(
  { id: "paypal-reconcile", name: "PayPal Reconciliation", triggers: [{ cron: "30 2 * * *" }] },
  async ({ step }) => {
    // Find all weddings that could have active PayPal subscriptions
    const weddings = await prisma.wedding.findMany({
      where: {
        billingProvider: "PAYPAL",
        paypalSubscriptionId: { not: null },
        subscriptionStatus: { notIn: ["CANCELLED"] },
      },
      select: { id: true },
    });

    let updated = 0;
    let checked = 0;

    // Process each wedding with step.run for reliability and parallel execution
    const results = await Promise.all(
      weddings.map((wedding) =>
        step.run(`sync-paypal-wedding-${wedding.id}`, async () => {
          const result = await syncWeddingFromPayPal(wedding.id);
          return { weddingId: wedding.id, ...result };
        })
      )
    );

    for (const result of results) {
      checked++;
      if (result.changed) {
        updated++;
      }
    }

    console.log(`[paypal-reconcile] Checked ${checked} weddings, updated ${updated}`);
    return { checked, updated };
  }
);
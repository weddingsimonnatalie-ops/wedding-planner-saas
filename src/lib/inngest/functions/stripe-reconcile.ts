import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { syncWeddingFromStripe } from "@/lib/stripe-sync";

/**
 * Nightly reconciliation cron that syncs all active Stripe subscriptions
 * with the database. Handles missed webhooks (delivery failures, local dev
 * without Stripe CLI, etc.).
 *
 * Runs at 2 AM UTC daily. Only processes weddings with a Stripe customer ID
 * that are not already cancelled (CANCELLED is terminal).
 */
export const stripeReconcile = inngest.createFunction(
  { id: "stripe-reconcile", name: "Stripe Reconciliation", triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }) => {
    // Find all weddings that could have active Stripe subscriptions
    const weddings = await prisma.wedding.findMany({
      where: {
        stripeCustomerId: { not: null },
        subscriptionStatus: { notIn: ["CANCELLED"] },
      },
      select: { id: true },
    });

    let updated = 0;
    let checked = 0;

    // Process each wedding with step.run for reliability and parallel execution
    const results = await Promise.all(
      weddings.map((wedding) =>
        step.run(`sync-wedding-${wedding.id}`, async () => {
          const result = await syncWeddingFromStripe(wedding.id);
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

    console.log(`[stripe-reconcile] Checked ${checked} weddings, updated ${updated}`);
    return { checked, updated };
  }
);
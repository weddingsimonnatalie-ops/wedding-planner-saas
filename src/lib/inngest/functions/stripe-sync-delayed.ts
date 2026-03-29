import { inngest } from "@/lib/inngest/client";
import { syncWeddingFromStripe } from "@/lib/stripe-sync";

/**
 * Delayed sync triggered when checkout.session.completed fires but
 * session.subscription is null (subscription object not yet created by Stripe).
 *
 * This event is scheduled 30 seconds after the webhook to give Stripe time
 * to create the subscription object.
 */
export const stripeSyncDelayed = inngest.createFunction(
  { id: "stripe-sync-delayed", name: "Stripe Sync Delayed", triggers: [{ event: "stripe/sync.delayed" }] },
  async ({ event }) => {
    const { weddingId } = event.data as { weddingId: string };

    console.log(`[stripe-sync-delayed] Running delayed sync for wedding ${weddingId}`);
    const result = await syncWeddingFromStripe(weddingId);

    if (result.changed) {
      console.log(`[stripe-sync-delayed] Wedding ${weddingId} updated:`, result.after);
    } else if (result.skipped) {
      console.log(`[stripe-sync-delayed] Wedding ${weddingId} skipped:`, result.skipped);
    } else {
      console.log(`[stripe-sync-delayed] Wedding ${weddingId} already in sync`);
    }

    return result;
  }
);
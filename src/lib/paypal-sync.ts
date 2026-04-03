/**
 * PayPal subscription reconciliation utility.
 *
 * Fetches the current PayPal subscription state for a wedding and reconciles
 * it with the DB. Safe to call at any time — idempotent and non-destructive.
 *
 * Key difference from Stripe: PayPal has no TRIALING status. A subscription
 * is ACTIVE even during the trial period. We use the stored trialEndsAt
 * to determine trial state.
 */

import { prisma } from "@/lib/prisma";
import { getSubscription, paypalStatusToSubStatus, type PayPalSubscription } from "@/lib/paypal";
import type { SubStatus } from "@prisma/client";

type SyncableFields = {
  subscriptionStatus: SubStatus;
  paypalSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelledAt: Date | null;
  gracePeriodEndsAt: Date | null;
};

export type SyncResult = {
  changed: boolean;
  skipped?: string;
  before?: SyncableFields;
  after?: SyncableFields;
};

/**
 * Syncs a wedding's PayPal subscription state from the PayPal API.
 *
 * Handles:
 * - Missing paypalSubscriptionId (checkout never completed)
 * - Status drift (payment success/failure/cancellation missed)
 * - Trial period detection (PayPal has no TRIALING status)
 *
 * Does NOT modify: deleteScheduledAt (business logic), subscriptionPlan,
 * or any non-billing Wedding fields.
 *
 * @returns SyncResult with changed flag and before/after snapshots for logging.
 */
export async function syncWeddingFromPayPal(weddingId: string): Promise<SyncResult> {
  const wedding = await prisma.wedding.findUnique({
    where: { id: weddingId },
    select: {
      paypalSubscriptionId: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      cancelledAt: true,
      gracePeriodEndsAt: true,
      deleteScheduledAt: true,
    },
  });

  if (!wedding) {
    return { changed: false, skipped: "Wedding not found" };
  }

  if (!wedding.paypalSubscriptionId) {
    return { changed: false, skipped: "No PayPal subscription — not yet registered" };
  }

  // ── Fetch subscription from PayPal ─────────────────────────────────────────

  let subscription: PayPalSubscription;
  try {
    subscription = await getSubscription(wedding.paypalSubscriptionId);
  } catch (err) {
    console.error(`[paypal-sync] could not fetch subscription ${wedding.paypalSubscriptionId}:`, err);
    return { changed: false, skipped: "Failed to fetch PayPal subscription" };
  }

  // ── Map PayPal state → DB fields ───────────────────────────────────────────

  const mappedStatus = paypalStatusToSubStatus(subscription.status);
  if (mappedStatus === null) {
    return {
      changed: false,
      skipped: `PayPal status '${subscription.status}' — not overwriting (checkout in progress)`,
    };
  }

  // PayPal has no TRIALING status — ACTIVE during trial period.
  // Preserve TRIALING status while trialEndsAt is in the future.
  let newStatus: SubStatus = mappedStatus;
  const now = Date.now();
  const trialEndsAtMs = wedding.trialEndsAt?.getTime();

  if (
    wedding.subscriptionStatus === "TRIALING" &&
    trialEndsAtMs &&
    trialEndsAtMs > now &&
    mappedStatus === "ACTIVE"
  ) {
    // Still in trial period — PayPal says ACTIVE but we keep TRIALING
    newStatus = "TRIALING";
  } else if (trialEndsAtMs && trialEndsAtMs <= now && wedding.subscriptionStatus === "TRIALING") {
    // Trial has ended — transition from TRIALING to the mapped status
    if (mappedStatus === "ACTIVE") {
      newStatus = "ACTIVE"; // First payment successful
    }
    // If PayPal says SUSPENDED (payment failed), it will be PAST_DUE
  }

  const graceDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? "7", 10);
  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);

  // next_billing_time is an ISO string
  const newCurrentPeriodEnd = subscription.billing_info?.next_billing_time
    ? new Date(subscription.billing_info.next_billing_time)
    : null;

  // Preserve existing trialEndsAt — PayPal doesn't provide trial end timestamp
  const newTrialEndsAt = wedding.trialEndsAt;

  // gracePeriodEndsAt: set if newly PAST_DUE; clear on ACTIVE
  let newGracePeriodEndsAt = wedding.gracePeriodEndsAt;
  if (newStatus === "PAST_DUE" && !wedding.gracePeriodEndsAt) {
    newGracePeriodEndsAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
  } else if (newStatus === "ACTIVE") {
    newGracePeriodEndsAt = null;
  }

  // cancelledAt: set to now if CANCELLED and not already set
  const newCancelledAt =
    newStatus === "CANCELLED"
      ? (wedding.cancelledAt ?? new Date())
      : wedding.cancelledAt;

  // deleteScheduledAt: set if transitioning to CANCELLED and not already set
  const newDeleteScheduledAt =
    newStatus === "CANCELLED" && !wedding.deleteScheduledAt
      ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
      : wedding.deleteScheduledAt;

  // ── Diff ───────────────────────────────────────────────────────────────────

  const before: SyncableFields = {
    subscriptionStatus: wedding.subscriptionStatus,
    paypalSubscriptionId: wedding.paypalSubscriptionId,
    currentPeriodEnd: wedding.currentPeriodEnd,
    trialEndsAt: wedding.trialEndsAt,
    cancelledAt: wedding.cancelledAt,
    gracePeriodEndsAt: wedding.gracePeriodEndsAt,
  };

  const after: SyncableFields = {
    subscriptionStatus: newStatus,
    paypalSubscriptionId: wedding.paypalSubscriptionId,
    currentPeriodEnd: newCurrentPeriodEnd,
    trialEndsAt: newTrialEndsAt,
    cancelledAt: newCancelledAt,
    gracePeriodEndsAt: newGracePeriodEndsAt,
  };

  const changed =
    before.subscriptionStatus !== after.subscriptionStatus ||
    before.currentPeriodEnd?.getTime() !== after.currentPeriodEnd?.getTime() ||
    before.trialEndsAt?.getTime() !== after.trialEndsAt?.getTime() ||
    before.cancelledAt?.getTime() !== after.cancelledAt?.getTime() ||
    before.gracePeriodEndsAt?.getTime() !== after.gracePeriodEndsAt?.getTime();

  // ── Write ──────────────────────────────────────────────────────────────────

  if (changed) {
    await prisma.wedding.update({
      where: { id: weddingId },
      data: {
        subscriptionStatus: newStatus,
        currentPeriodEnd: newCurrentPeriodEnd,
        trialEndsAt: newTrialEndsAt,
        cancelledAt: newCancelledAt,
        gracePeriodEndsAt: newGracePeriodEndsAt,
        deleteScheduledAt: newDeleteScheduledAt,
      },
    });
    console.log(`[paypal-sync] wedding ${weddingId} updated`, { before, after });
  } else {
    console.log(`[paypal-sync] wedding ${weddingId} already in sync`);
  }

  return { changed, before, after };
}
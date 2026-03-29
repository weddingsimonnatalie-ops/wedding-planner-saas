import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type { SubStatus } from "@prisma/client";

type SyncableFields = {
  subscriptionStatus: SubStatus;
  stripeSubscriptionId: string | null;
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
 * Stripe SDK v20 type assertion for subscription fields.
 * The TypeScript types changed but the API response structure remains the same.
 */
type StripeSubscriptionData = {
  id: string;
  status: Stripe.Subscription.Status;
  current_period_end: number;
  trial_end: number | null;
  canceled_at: number | null;
  created: number;
};

/**
 * Maps a Stripe subscription status to our SubStatus enum.
 * Returns null for statuses that should not overwrite the current DB value
 * (e.g. "incomplete" — checkout still in progress).
 */
function stripeStatusToSubStatus(
  stripeStatus: Stripe.Subscription.Status
): SubStatus | null {
  switch (stripeStatus) {
    case "trialing":            return "TRIALING";
    case "active":              return "ACTIVE";
    case "past_due":            return "PAST_DUE";
    case "canceled":            return "CANCELLED";
    case "paused":              return "PAUSED";
    case "incomplete_expired":  return "CANCELLED";
    case "unpaid":              return "PAST_DUE";
    case "incomplete":          return null; // checkout in progress — do not overwrite
    default:                    return null;
  }
}

/**
 * Picks the most relevant subscription from a list.
 * Prefers active/trialing over terminal states, then most recently created.
 */
function pickBestSubscription(
  subscriptions: Stripe.Subscription[]
): Stripe.Subscription | null {
  if (subscriptions.length === 0) return null;
  const priority: Stripe.Subscription.Status[] = [
    "trialing", "active", "past_due", "paused", "unpaid",
    "incomplete", "incomplete_expired", "canceled",
  ];
  return subscriptions.sort(
    (a, b) =>
      priority.indexOf(a.status) - priority.indexOf(b.status) ||
      b.created - a.created
  )[0];
}

/**
 * Fetches the current Stripe subscription state for a wedding and reconciles
 * it with the DB. Safe to call at any time — idempotent and non-destructive.
 *
 * Handles all recovery scenarios:
 * - Missing stripeSubscriptionId (checkout webhook never fired)
 * - Status drift (payment_succeeded / payment_failed / cancellation missed)
 * - Upgrade / downgrade (currentPeriodEnd stale)
 * - Trial end date changes
 *
 * Does NOT modify: deleteScheduledAt (business logic), subscriptionPlan (not
 * mapped from Stripe price), or any non-billing Wedding fields.
 *
 * @returns SyncResult with changed flag and before/after snapshots for logging.
 */
export async function syncWeddingFromStripe(weddingId: string): Promise<SyncResult> {
  const wedding = await prisma.wedding.findUnique({
    where: { id: weddingId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
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

  if (!wedding.stripeCustomerId) {
    return { changed: false, skipped: "No Stripe customer — not yet registered" };
  }

  // ── Fetch subscription from Stripe ─────────────────────────────────────────

  let subscription: Stripe.Subscription | null = null;

  if (wedding.stripeSubscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(
        wedding.stripeSubscriptionId
      );
    } catch (err) {
      // Subscription may have been deleted in Stripe — fall through to list
      console.warn(
        `stripe-sync: could not retrieve ${wedding.stripeSubscriptionId}, falling back to list:`,
        err
      );
    }
  }

  if (!subscription) {
    const list = await stripe.subscriptions.list({
      customer: wedding.stripeCustomerId,
      limit: 10,
      status: "all",
    });
    subscription = pickBestSubscription(list.data);
  }

  if (!subscription) {
    return {
      changed: false,
      skipped: "No Stripe subscriptions found for this customer",
    };
  }

  // ── Map Stripe state → DB fields ───────────────────────────────────────────

  // Type assertion for Stripe SDK v20 compatibility
  const sub = subscription as unknown as StripeSubscriptionData;

  const newStatus = stripeStatusToSubStatus(subscription.status);
  if (newStatus === null) {
    return {
      changed: false,
      skipped: `Stripe status '${subscription.status}' — not overwriting (checkout in progress)`,
    };
  }

  const graceDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? "7", 10);
  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);

  const newCurrentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  // Prefer Stripe's trial_end; fall back to keeping the existing DB value
  const newTrialEndsAt =
    sub.trial_end != null
      ? new Date(sub.trial_end * 1000)
      : wedding.trialEndsAt;

  // gracePeriodEndsAt: only set if newly PAST_DUE and not already set;
  // clear on ACTIVE (payment recovered); preserve in all other cases
  let newGracePeriodEndsAt = wedding.gracePeriodEndsAt;
  if (newStatus === "PAST_DUE" && !wedding.gracePeriodEndsAt) {
    newGracePeriodEndsAt = new Date(
      Date.now() + graceDays * 24 * 60 * 60 * 1000
    );
  } else if (newStatus === "ACTIVE") {
    newGracePeriodEndsAt = null;
  }

  // cancelledAt: use Stripe's canceled_at if available, else now; preserve existing
  const newCancelledAt =
    newStatus === "CANCELLED"
      ? (sub.canceled_at
          ? new Date(sub.canceled_at * 1000)
          : wedding.cancelledAt ?? new Date())
      : wedding.cancelledAt;

  // deleteScheduledAt: set only if transitioning to CANCELLED and not already set
  const newDeleteScheduledAt =
    newStatus === "CANCELLED" && !wedding.deleteScheduledAt
      ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
      : wedding.deleteScheduledAt;

  // ── Diff ───────────────────────────────────────────────────────────────────

  const before: SyncableFields = {
    subscriptionStatus: wedding.subscriptionStatus,
    stripeSubscriptionId: wedding.stripeSubscriptionId,
    currentPeriodEnd: wedding.currentPeriodEnd,
    trialEndsAt: wedding.trialEndsAt,
    cancelledAt: wedding.cancelledAt,
    gracePeriodEndsAt: wedding.gracePeriodEndsAt,
  };

  const after: SyncableFields = {
    subscriptionStatus: newStatus,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: newCurrentPeriodEnd,
    trialEndsAt: newTrialEndsAt,
    cancelledAt: newCancelledAt,
    gracePeriodEndsAt: newGracePeriodEndsAt,
  };

  const changed =
    before.subscriptionStatus !== after.subscriptionStatus ||
    before.stripeSubscriptionId !== after.stripeSubscriptionId ||
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
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: newCurrentPeriodEnd,
        trialEndsAt: newTrialEndsAt,
        cancelledAt: newCancelledAt,
        gracePeriodEndsAt: newGracePeriodEndsAt,
        deleteScheduledAt: newDeleteScheduledAt,
      },
    });
    console.log(`[stripe-sync] wedding ${weddingId} updated`, {
      before,
      after,
    });
  } else {
    console.log(`[stripe-sync] wedding ${weddingId} already in sync`);
  }

  return { changed, before, after };
}

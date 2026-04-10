import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type { SubStatus } from "@prisma/client";

type SyncableFields = {
  subscriptionStatus: SubStatus;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelledAt: Date | null;
  deleteScheduledAt: Date | null;
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
  canceled_at: number | null;
  created: number;
};

/**
 * Maps a Stripe subscription status to our SubStatus enum.
 * Returns null for statuses that should not overwrite the current DB value
 * (e.g. "incomplete" — checkout still in progress).
 *
 * Mapping:
 * - trialing            → FREE
 * - active              → ACTIVE
 * - past_due / unpaid   → PAST_DUE
 * - canceled / paused / incomplete_expired → FREE
 * - incomplete          → null (checkout in progress — do not overwrite)
 */
function stripeStatusToSubStatus(
  stripeStatus: Stripe.Subscription.Status
): SubStatus | null {
  switch (stripeStatus) {
    case "active":              return "ACTIVE";
    case "past_due":            return "PAST_DUE";
    case "unpaid":              return "PAST_DUE";
    case "trialing":            return "FREE";
    case "canceled":            return "FREE";
    case "paused":              return "FREE";
    case "incomplete_expired":  return "FREE";
    case "incomplete":          return null; // checkout in progress — do not overwrite
    default:                    return null;
  }
}

/**
 * Picks the most relevant subscription from a list.
 * Active takes priority over trialing (since trialing now maps to FREE).
 * Then prefers most recently created.
 */
function pickBestSubscription(
  subscriptions: Stripe.Subscription[]
): Stripe.Subscription | null {
  if (subscriptions.length === 0) return null;
  const priority: Stripe.Subscription.Status[] = [
    "active", "trialing", "past_due", "paused", "unpaid",
    "incomplete", "incomplete_expired", "canceled",
  ];
  return subscriptions.sort(
    (a, b) =>
      priority.indexOf(a.status) - priority.indexOf(b.status) ||
      b.created - a.created
  )[0];
}

/**
 * Calculates the deleteScheduledAt date based on the wedding date.
 * - If weddingDate is in the future: weddingDate + 60 days
 * - If weddingDate is in the past: now + 60 days
 * - If no weddingDate: now + 365 days
 */
function calculateDeleteScheduledAt(
  weddingDate: Date | null,
  retentionDays: number
): Date {
  if (weddingDate) {
    const now = new Date();
    if (weddingDate > now) {
      // Wedding in the future — retain until 60 days after
      return new Date(weddingDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    } else {
      // Wedding in the past — retain for 60 more days from now
      return new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    }
  }
  // No wedding date — retain for a long fallback period
  return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Fetches the current Stripe subscription state for a wedding and reconciles
 * it with the DB. Safe to call at any time — idempotent and non-destructive.
 *
 * Handles all recovery scenarios:
 * - Missing stripeSubscriptionId (checkout webhook never fired)
 * - Status drift (payment_succeeded / payment_failed / cancellation missed)
 * - Upgrade / downgrade (currentPeriodEnd stale)
 *
 * Does NOT modify any non-billing Wedding fields.
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
      cancelledAt: true,
      deleteScheduledAt: true,
      weddingDate: true,
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

  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? "90", 10);

  const newCurrentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  const oldStatus = wedding.subscriptionStatus;

  // cancelledAt: set to now when transitioning to FREE from a paid status
  // (ACTIVE or PAST_DUE). Use Stripe's canceled_at timestamp when available.
  let newCancelledAt = wedding.cancelledAt;
  if (newStatus === "FREE" && (oldStatus === "ACTIVE" || oldStatus === "PAST_DUE")) {
    newCancelledAt = sub.canceled_at
      ? new Date(sub.canceled_at * 1000)
      : new Date();
  }

  // deleteScheduledAt: set when transitioning to FREE from a paid status
  // and not already set.
  let newDeleteScheduledAt = wedding.deleteScheduledAt;
  if (newStatus === "FREE" && (oldStatus === "ACTIVE" || oldStatus === "PAST_DUE") && !wedding.deleteScheduledAt) {
    newDeleteScheduledAt = calculateDeleteScheduledAt(wedding.weddingDate, retentionDays);
  }

  // ── Diff ───────────────────────────────────────────────────────────────────

  const before: SyncableFields = {
    subscriptionStatus: wedding.subscriptionStatus,
    stripeSubscriptionId: wedding.stripeSubscriptionId,
    currentPeriodEnd: wedding.currentPeriodEnd,
    cancelledAt: wedding.cancelledAt,
    deleteScheduledAt: wedding.deleteScheduledAt,
  };

  const after: SyncableFields = {
    subscriptionStatus: newStatus,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: newCurrentPeriodEnd,
    cancelledAt: newCancelledAt,
    deleteScheduledAt: newDeleteScheduledAt,
  };

  const changed =
    before.subscriptionStatus !== after.subscriptionStatus ||
    before.stripeSubscriptionId !== after.stripeSubscriptionId ||
    before.currentPeriodEnd?.getTime() !== after.currentPeriodEnd?.getTime() ||
    before.cancelledAt?.getTime() !== after.cancelledAt?.getTime() ||
    before.deleteScheduledAt?.getTime() !== after.deleteScheduledAt?.getTime();

  // ── Write ──────────────────────────────────────────────────────────────────

  if (changed) {
    await prisma.wedding.update({
      where: { id: weddingId },
      data: {
        subscriptionStatus: newStatus,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: newCurrentPeriodEnd,
        cancelledAt: newCancelledAt,
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
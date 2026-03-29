export const dynamic = "force-dynamic";

import { requireServerContext } from "@/lib/server-context";
import { prisma } from "@/lib/prisma";
import { Heart, CreditCard, Calendar, Download, Zap } from "lucide-react";
import { ActivateTrialButton } from "@/components/billing/ActivateTrialButton";

export default async function BillingPage() {
  const ctx = await requireServerContext(["ADMIN"]);

  const wedding = await prisma.wedding.findUnique({
    where: { id: ctx.weddingId },
    select: {
      coupleName: true,
      subscriptionStatus: true,
      stripeSubscriptionId: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      gracePeriodEndsAt: true,
      cancelledAt: true,
      deleteScheduledAt: true,
    },
  });

  const statusLabel: Record<string, string> = {
    TRIALING: "Trial",
    ACTIVE: "Active",
    PAST_DUE: "Payment overdue",
    CANCELLED: "Cancelled",
    PAUSED: "Paused",
  };

  const statusColour: Record<string, string> = {
    TRIALING: "text-blue-600 bg-blue-50",
    ACTIVE: "text-green-600 bg-green-50",
    PAST_DUE: "text-amber-600 bg-amber-50",
    CANCELLED: "text-red-600 bg-red-50",
    PAUSED: "text-gray-600 bg-gray-50",
  };

  const status = wedding?.subscriptionStatus ?? "TRIALING";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
          <Heart className="w-5 h-5 text-white fill-white" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Wedding Planner</h2>
            <p className="text-sm text-gray-500">Standard plan · £12/month</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${statusColour[status]}`}
          >
            {statusLabel[status]}
          </span>
        </div>

        {wedding?.currentPeriodEnd && status === "ACTIVE" && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>
              Next billing:{" "}
              {new Date(wedding.currentPeriodEnd).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        )}

        {wedding?.trialEndsAt && status === "TRIALING" && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Calendar className="w-4 h-4" />
            <span>
              Trial ends:{" "}
              {new Date(wedding.trialEndsAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        )}

        {wedding?.gracePeriodEndsAt && status === "PAST_DUE" && (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <Calendar className="w-4 h-4" />
            <span>
              Grace period ends:{" "}
              {new Date(wedding.gracePeriodEndsAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        )}
      </div>

      {status === "TRIALING" && (
        <div className="bg-white rounded-xl border border-primary/20 p-6 mb-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">
                Start your subscription now
              </h2>
              <p className="text-sm text-gray-500">
                Unlock email sending and all features immediately — don&apos;t
                wait for your trial to end.
              </p>
            </div>
          </div>
          <ActivateTrialButton hasSubscription={!!wedding?.stripeSubscriptionId} />
        </div>
      )}

      <form action="/api/billing/portal" method="POST">
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <CreditCard className="w-4 h-4" />
          Manage subscription in Stripe
        </button>
      </form>

      <p className="text-xs text-gray-400 text-center mt-4">
        You&apos;ll be redirected to Stripe to manage your subscription, payment
        method, and invoices.
      </p>

      <div className="mt-8 border-t border-gray-200 pt-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Your data</h2>
        <p className="text-sm text-gray-500 mb-4">
          Download a full export of your wedding data including guests, suppliers, payments, appointments, and tasks.
        </p>
        <a
          href="/api/export"
          download
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download my data
        </a>
      </div>
    </div>
  );
}

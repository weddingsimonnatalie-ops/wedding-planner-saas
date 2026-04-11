export const dynamic = "force-dynamic";

import { requireServerContext } from "@/lib/server-context";
import { prisma } from "@/lib/prisma";
import { Heart, CreditCard, Calendar, Download, Zap, Crown, Users, Mail, Upload, Music, Clock } from "lucide-react";
import { SyncFromProviderButton } from "@/components/billing/SyncFromProviderButton";
import { syncWeddingFromStripe } from "@/lib/stripe-sync";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { getCurrencyFromCountry, getLookupKey } from "@/lib/billing-currency";

export default async function BillingPage() {
  const ctx = await requireServerContext(["ADMIN"]);

  // Fetch wedding billing info
  let wedding = await prisma.wedding.findUnique({
    where: { id: ctx.weddingId },
    select: {
      coupleName: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      currentPeriodEnd: true,
      cancelledAt: true,
      deleteScheduledAt: true,
    },
  });

  // Auto-sync from Stripe on page load if user has a Stripe subscription
  if (wedding?.stripeCustomerId) {
    await syncWeddingFromStripe(ctx.weddingId);
    wedding = await prisma.wedding.findUnique({
      where: { id: ctx.weddingId },
      select: {
        coupleName: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        currentPeriodEnd: true,
        cancelledAt: true,
        deleteScheduledAt: true,
      },
    });
  }

  // Detect currency from Cloudflare country header and fetch price for display
  const headersList = await headers();
  const country = headersList.get("cf-ipcountry");
  const currency = getCurrencyFromCountry(country);
  const lookupKey = getLookupKey(currency);

  let priceDisplay = "";
  try {
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    const price = prices.data[0];
    if (price && price.unit_amount) {
      const amount = price.unit_amount / 100;
      const formatted = new Intl.NumberFormat("en", {
        style: "currency",
        currency: price.currency.toUpperCase(),
        minimumFractionDigits: 0,
      }).format(amount);
      priceDisplay = `${formatted}/month`;
    }
  } catch {
    // Non-fatal — fall back to empty string; UI handles it gracefully
  }

  const statusLabel: Record<string, string> = {
    FREE: "Free Tier",
    ACTIVE: "Active",
    PAST_DUE: "Payment overdue",
  };

  const statusColour: Record<string, string> = {
    FREE: "text-gray-600 bg-gray-50",
    ACTIVE: "text-green-600 bg-green-50",
    PAST_DUE: "text-amber-600 bg-amber-50",
  };

  const status = wedding?.subscriptionStatus ?? "FREE";
  const isFree = status === "FREE";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
          <Heart className="w-5 h-5 text-white fill-white" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
      </div>

      {wedding?.stripeCustomerId && (
        <SyncFromProviderButton provider="stripe" />
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Wedding Planner</h2>
            <p className="text-sm text-gray-500">
              {isFree ? "Free Tier" : `Standard plan${priceDisplay ? ` · ${priceDisplay}` : ""} · Card`}
            </p>
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

        {wedding?.currentPeriodEnd && status === "PAST_DUE" && (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <Calendar className="w-4 h-4" />
            <span>
              Access continues until:{" "}
              {new Date(wedding.currentPeriodEnd).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        )}

        {wedding?.deleteScheduledAt && isFree && wedding.cancelledAt && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <Calendar className="w-4 h-4" />
            <span>
              Data will be deleted on:{" "}
              {new Date(wedding.deleteScheduledAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        )}
      </div>

      {isFree && (
        <div className="bg-white rounded-xl border border-primary/20 p-6 mb-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <Crown className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">
                Upgrade to unlock everything
              </h2>
              <p className="text-sm text-gray-500">
                {priceDisplay ? `${priceDisplay} — ` : ""}cancel anytime. Unlock all features with no limits.
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4 text-primary" />
              <span>Unlimited guests</span>
              <span className="text-gray-400">· Free tier: 30 max</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="w-4 h-4 text-primary" />
              <span>Email sending &amp; RSVPs</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Upload className="w-4 h-4 text-primary" />
              <span>File uploads</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-primary" />
              <span>Wedding day timeline</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Music className="w-4 h-4 text-primary" />
              <span>Music playlists</span>
            </div>
          </div>

          <form action="/api/billing/checkout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Upgrade now
            </button>
          </form>
        </div>
      )}

      {!isFree && wedding?.stripeCustomerId && (
        <>
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
        </>
      )}

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
"use client";

import { CreditCard, ArrowRight } from "lucide-react";

export default function BillingSuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Payment Overdue
          </h1>
          <p className="text-gray-600 mb-6">
            Your subscription payment has failed and the grace period has ended.
            Reactivate your subscription to regain full access, or continue with
            the Free Tier.
          </p>
          <div className="space-y-3">
            <a
              href="/api/billing/portal"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Reactivate subscription
            </a>
            <a
              href="/billing"
              className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Continue with Free Tier
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
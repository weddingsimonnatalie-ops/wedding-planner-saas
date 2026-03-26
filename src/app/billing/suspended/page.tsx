"use client";

import { Heart, CreditCard } from "lucide-react";

export default function BillingSuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Subscription Inactive
          </h1>
          <p className="text-gray-600 mb-6">
            Your subscription has lapsed or been cancelled. To continue using
            Wedding Planner, please reactivate your subscription.
          </p>
          <a
            href="/api/billing/portal"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Heart className="w-4 h-4" />
            Manage Subscription
          </a>
          <p className="text-xs text-gray-400 mt-4">
            Your data is safe and will be retained for 90 days after cancellation.
          </p>
        </div>
      </div>
    </div>
  );
}

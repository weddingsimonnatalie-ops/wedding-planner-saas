"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Heart } from "lucide-react";

export default function OnboardingDonePage() {
  const router = useRouter();

  // Auto-redirect after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-primary/40 text-white text-xs font-medium flex items-center justify-center">1</div>
          <div className="w-12 h-0.5 bg-primary/40" />
          <div className="w-8 h-8 rounded-full bg-primary/40 text-white text-xs font-medium flex items-center justify-center">2</div>
          <div className="w-12 h-0.5 bg-primary/40" />
          <div className="w-8 h-8 rounded-full bg-primary text-white text-xs font-medium flex items-center justify-center">3</div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">You&apos;re all set!</h1>
          <p className="text-gray-500 mb-8">
            Your wedding planner is ready. Redirecting you to the dashboard…
          </p>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Heart className="w-4 h-4 fill-white" />
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Heart, Mail, ArrowRight } from "lucide-react";

export default function OnboardingInvitePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100 px-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-primary/40 text-white text-xs font-medium flex items-center justify-center">1</div>
          <div className="w-12 h-0.5 bg-primary/40" />
          <div className="w-8 h-8 rounded-full bg-primary text-white text-xs font-medium flex items-center justify-center">2</div>
          <div className="w-12 h-0.5 bg-gray-200" />
          <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 text-xs font-medium flex items-center justify-center">3</div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Invite your partner or planner</h1>
            <p className="text-sm text-gray-500 mt-1 text-center">
              You can invite people to help manage your wedding
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <Heart className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">Coming soon</p>
                <p className="text-sm text-blue-700 mt-0.5">
                  The invitation system is being built. For now, you can add team members via{" "}
                  <strong>Settings → Users</strong> once you&apos;re in the app.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/onboarding/done")}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

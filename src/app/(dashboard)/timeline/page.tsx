export const dynamic = "force-dynamic";

import { requireServerContext } from "@/lib/server-context";
import { prisma } from "@/lib/prisma";
import { TimelineList } from "@/components/timeline/TimelineList";
import { Clock, Crown } from "lucide-react";
import { getTimelineBlockReason } from "@/lib/permissions";

export default async function TimelinePage() {
  const ctx = await requireServerContext(["ADMIN", "VIEWER", "RSVP_MANAGER"]);

  const wedding = await prisma.wedding.findUnique({
    where: { id: ctx.weddingId },
    select: { subscriptionStatus: true },
  });

  const status = wedding?.subscriptionStatus ?? "FREE";
  const reason = getTimelineBlockReason(status);

  if (reason) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Timeline</h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Crown className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to access Timeline</h2>
          <p className="text-gray-500 mb-4">
            Plan your wedding day timeline with time-stamped events and categories. Available on the paid plan.
          </p>
          <a
            href="/billing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Crown className="w-4 h-4" />
            Upgrade now
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <TimelineList />
    </div>
  );
}
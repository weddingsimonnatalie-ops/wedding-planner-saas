export const dynamic = "force-dynamic";

import { TimelineList } from "@/components/timeline/TimelineList";
import { requireServerContext } from "@/lib/server-context";

export default async function TimelinePage() {
  await requireServerContext(["ADMIN", "VIEWER", "RSVP_MANAGER"]);
  return (
    <div className="max-w-3xl">
      <TimelineList />
    </div>
  );
}
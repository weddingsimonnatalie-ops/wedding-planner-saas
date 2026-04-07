export const dynamic = "force-dynamic";

import { PlannerClient } from "@/components/planner/PlannerClient";
import { requireServerContext } from "@/lib/server-context";

export default async function PlannerPage() {
  await requireServerContext();
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Planner</h1>
      </div>
      <PlannerClient />
    </div>
  );
}

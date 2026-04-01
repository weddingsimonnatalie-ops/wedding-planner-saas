export const dynamic = "force-dynamic";

import { BudgetList } from "@/components/budget/BudgetList";
import { requireServerContext } from "@/lib/server-context";

export default async function BudgetPage() {
  await requireServerContext(["ADMIN", "VIEWER"]);
  return (
    <div className="max-w-4xl">
      <BudgetList />
    </div>
  );
}
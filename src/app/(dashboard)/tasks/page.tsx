export const dynamic = "force-dynamic";

import { TasksPageClient } from "@/components/tasks/TasksPageClient";
import { requireServerContext } from "@/lib/server-context";

export default async function TasksPage() {
  await requireServerContext();
  return <TasksPageClient />;
}

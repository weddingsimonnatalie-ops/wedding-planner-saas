export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth-better";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TasksPageClient } from "@/components/tasks/TasksPageClient";

export default async function TasksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return <TasksPageClient />;
}

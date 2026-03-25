export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

// Redirect to Settings page with Users tab
// This page is now integrated into the main Settings page
export default function UsersPage() {
  redirect("/settings?tab=users");
}
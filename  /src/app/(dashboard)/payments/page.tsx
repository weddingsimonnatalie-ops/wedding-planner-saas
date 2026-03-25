export const dynamic = "force-dynamic";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { PaymentsList } from "@/components/payments/PaymentsList";

export default async function PaymentsPage() {
  const session = await getSession();
  if (!can.accessPayments(session?.user?.role ?? "VIEWER")) redirect("/");
  return (
    <div className="max-w-4xl">
      <PaymentsList />
    </div>
  );
}

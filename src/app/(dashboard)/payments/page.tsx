export const dynamic = "force-dynamic";

import { PaymentsList } from "@/components/payments/PaymentsList";
import { requireServerContext } from "@/lib/server-context";

export default async function PaymentsPage() {
  await requireServerContext(["ADMIN", "VIEWER"]);
  return (
    <div className="max-w-4xl">
      <PaymentsList />
    </div>
  );
}

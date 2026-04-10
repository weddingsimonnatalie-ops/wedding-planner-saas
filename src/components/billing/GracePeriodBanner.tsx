import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface Props {
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
}

export function GracePeriodBanner({ subscriptionStatus, currentPeriodEnd }: Props) {
  if (subscriptionStatus !== "PAST_DUE") return null;

  const endsAt = currentPeriodEnd
    ? currentPeriodEnd.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
      <span>
        Payment overdue.
        {endsAt && ` Full access continues until ${endsAt}.`}
        {" "}
        <Link href="/billing" className="font-medium underline underline-offset-2 hover:text-amber-900">
          Update payment method →
        </Link>
      </span>
    </div>
  );
}
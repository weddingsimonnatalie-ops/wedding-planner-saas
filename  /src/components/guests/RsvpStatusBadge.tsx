const STATUS_STYLES: Record<string, string> = {
  ACCEPTED: "bg-green-100 text-green-700",
  PARTIAL:  "bg-orange-100 text-orange-700",
  DECLINED: "bg-red-100 text-red-700",
  PENDING:  "bg-amber-100 text-amber-700",
  MAYBE:    "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: "Accepted",
  PARTIAL:  "Partial",
  DECLINED: "Declined",
  PENDING:  "Pending",
  MAYBE:    "Maybe",
};

const STATUS_TITLES: Record<string, string> = {
  PARTIAL: "Attending some events",
};

export function RsvpStatusBadge({ status }: { status: string }) {
  return (
    <span
      title={STATUS_TITLES[status]}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

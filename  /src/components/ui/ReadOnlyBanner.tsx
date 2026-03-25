import { Info } from "lucide-react";

interface ReadOnlyBannerProps {
  message?: string;
}

export function ReadOnlyBanner({
  message = "You have view-only access to this section.",
}: ReadOnlyBannerProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 mb-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
      <Info className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

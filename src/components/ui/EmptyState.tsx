import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  href?: string;
  onClick?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  href,
  onClick,
}: EmptyStateProps) {
  return (
    <div className="px-5 py-8 text-center">
      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6 text-gray-300" />
      </div>
      <p className="text-sm font-medium text-gray-700 mb-1">{title}</p>
      <p className="text-xs text-gray-400 mb-3">{description}</p>
      {actionLabel && (href || onClick) && (
        onClick ? (
          <button
            onClick={onClick}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            {actionLabel}
            <ArrowRight className="w-3 h-3" />
          </button>
        ) : href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            {actionLabel}
            <ArrowRight className="w-3 h-3" />
          </Link>
        ) : null
      )}
    </div>
  );
}
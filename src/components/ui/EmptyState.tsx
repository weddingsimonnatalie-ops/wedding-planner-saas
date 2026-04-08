import Link from "next/link";
import { ArrowRight } from "lucide-react";

type EmptyStateVariant = "guests" | "suppliers" | "timeline" | "music" | "payments" | "tasks" | "default";

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  href?: string;
  onClick?: () => void;
  /** Predefined illustration variant - shows decorative SVG instead of icon */
  variant?: EmptyStateVariant;
}

// Decorative SVG illustrations for different contexts
const illustrations: Record<EmptyStateVariant, React.ReactNode> = {
  guests: (
    <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
      <circle cx="40" cy="30" r="15" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <circle cx="80" cy="30" r="15" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <circle cx="60" cy="50" r="18" className="fill-primary/15 stroke-primary/30" strokeWidth="1.5" />
      <path d="M52 50a8 8 0 0016 0" className="stroke-primary/40" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  suppliers: (
    <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
      <rect x="15" y="25" width="25" height="35" rx="3" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <rect x="47" y="20" width="25" height="40" rx="3" className="fill-primary/15 stroke-primary/30" strokeWidth="1.5" />
      <rect x="80" y="30" width="25" height="30" rx="3" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <path d="M20 35h15M52 30h15M85 40h15" className="stroke-primary/40" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  timeline: (
    <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
      <circle cx="30" cy="20" r="8" className="fill-primary/20 stroke-primary/30" strokeWidth="1.5" />
      <circle cx="60" cy="40" r="8" className="fill-primary/15 stroke-primary/30" strokeWidth="1.5" />
      <circle cx="90" cy="60" r="8" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <path d="M38 24L52 36M68 44L82 56" className="stroke-primary/30" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 4" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
      <ellipse cx="35" cy="55" rx="12" ry="8" className="fill-primary/15 stroke-primary/30" strokeWidth="1.5" />
      <ellipse cx="85" cy="50" rx="12" ry="8" className="fill-primary/15 stroke-primary/30" strokeWidth="1.5" />
      <path d="M47 55V20l38-5v40" className="stroke-primary/30" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M47 20c20 5 38-5 38-5" className="stroke-primary/20" strokeWidth="1.5" />
    </svg>
  ),
  payments: (
    <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
      <rect x="20" y="20" width="80" height="45" rx="4" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <rect x="20" y="32" width="80" height="8" className="fill-primary/20" />
      <circle cx="85" cy="52" r="8" className="fill-primary/15 stroke-primary/30" strokeWidth="1.5" />
      <path d="M82 52l2 2 4-4" className="stroke-primary/50" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
      <rect x="25" y="18" width="70" height="48" rx="3" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <path d="M35 30h50M35 42h35M35 54h25" className="stroke-primary/20" strokeWidth="2" strokeLinecap="round" />
      <path d="M35 30l3 3 5-6M35 42l3 3 5-6" className="stroke-primary/40" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  default: (
    <svg viewBox="0 0 120 80" className="w-full h-full" fill="none">
      <circle cx="60" cy="40" r="20" className="fill-primary/10 stroke-primary/30" strokeWidth="1.5" />
      <path d="M52 40h16M60 32v16" className="stroke-primary/40" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  href,
  onClick,
  variant = "default",
}: EmptyStateProps) {
  const showIllustration = variant !== "default";

  return (
    <div className="py-12 px-5 text-center">
      {/* Illustration or Icon */}
      <div className="w-24 h-16 mx-auto mb-4">
        {showIllustration ? (
          illustrations[variant]
        ) : Icon ? (
          <div className="w-12 h-12 bg-warm-100 rounded-full flex items-center justify-center mx-auto">
            <Icon className="w-6 h-6 text-gray-400" />
          </div>
        ) : null}
      </div>

      {/* Title with display font */}
      <h4 className="text-base font-medium text-gray-900 mb-1.5 font-display">{title}</h4>

      {/* Description */}
      <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">{description}</p>

      {/* Action */}
      {actionLabel && (href || onClick) && (
        onClick ? (
          <button
            onClick={onClick}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
          >
            {actionLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
          >
            {actionLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : null
      )}
    </div>
  );
}
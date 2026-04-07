import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  href?: string;
  showArrow?: boolean;
}

export function SectionHeader({ title, href, showArrow = true }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="relative">
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <div className="absolute -bottom-1 left-0 w-8 h-0.5 bg-primary/40 rounded-full" />
      </div>
      {href && showArrow && (
        <Link
          href={href}
          className="text-xs text-gray-400 hover:text-primary flex items-center gap-0.5 group transition-colors"
        >
          View all
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
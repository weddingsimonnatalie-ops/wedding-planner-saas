"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  LayoutGrid,
  Briefcase,
  Settings,
  Heart,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/guests", label: "Guests", icon: Users },
  { href: "/seating", label: "Seating", icon: LayoutGrid },
  { href: "/suppliers", label: "Suppliers", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-200">
        <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center">
          <Heart className="w-3.5 h-3.5 text-white fill-white" />
        </div>
        <span className="font-semibold text-gray-900 text-sm">Wedding Planner</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

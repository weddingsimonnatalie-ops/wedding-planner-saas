"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CheckSquare, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserRole } from "@prisma/client";

interface BottomNavProps {
  role: UserRole;
  taskBadge: number;
  onOpenSidebar: () => void;
}

const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard, roles: null },
  { href: "/guests", label: "Guests", icon: Users, roles: null },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, roles: ["ADMIN", "VIEWER", "RSVP_MANAGER"] as UserRole[] },
] as const;

export function BottomNav({ role, taskBadge, onOpenSidebar }: BottomNavProps) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter(tab => tab.roles === null || tab.roles.includes(role));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 flex items-stretch justify-around z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {visibleTabs.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname.startsWith(href);
        const showBadge = href === "/tasks" && taskBadge > 0;

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 relative",
              active ? "text-primary" : "text-gray-400"
            )}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {showBadge && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 font-medium">{label}</span>
          </Link>
        );
      })}

      {/* More button — opens sidebar */}
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 text-gray-400"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] mt-0.5 font-medium">More</span>
      </button>
    </nav>
  );
}
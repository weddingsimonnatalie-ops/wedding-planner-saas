"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  LayoutDashboard, Users, LayoutGrid, Briefcase, Settings,
  Heart, LogOut, User, CalendarDays, CreditCard, CheckSquare, Clock, PiggyBank,
} from "lucide-react";
import { UserRole } from "@prisma/client";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  user?: { name?: string | null; email?: string | null; role?: UserRole };
  taskBadge: number;
  appointmentBadge: number;
  paymentBadge: number;
}

const allNavItems = [
  { href: "/",                  label: "Dashboard",    icon: LayoutDashboard, roles: null },
  { href: "/guests",            label: "Guests",       icon: Users,           roles: null },
  { href: "/seating",           label: "Seating",      icon: LayoutGrid,      roles: null },
  { href: "/timeline",          label: "Timeline",     icon: Clock,           roles: null },
  { href: "/appointments",      label: "Appointments", icon: CalendarDays,    roles: ["ADMIN", "VIEWER"] as UserRole[] },
  { href: "/tasks",             label: "Tasks",        icon: CheckSquare,     roles: ["ADMIN", "VIEWER", "RSVP_MANAGER"] as UserRole[] },
  { href: "/suppliers",         label: "Suppliers",    icon: Briefcase,       roles: ["ADMIN", "VIEWER"] as UserRole[] },
  { href: "/payments",          label: "Payments",     icon: CreditCard,      roles: ["ADMIN", "VIEWER"] as UserRole[] },
  { href: "/budget",            label: "Budget",       icon: PiggyBank,       roles: ["ADMIN", "VIEWER"] as UserRole[] },
  { href: "/settings",          label: "Settings",     icon: Settings,        roles: ["ADMIN"] as UserRole[] },
] as const;

export function MobileMenu({ open, onClose, user, taskBadge, appointmentBadge, paymentBadge }: MobileMenuProps) {
  const pathname = usePathname();
  const role = user?.role ?? "ADMIN";

  const navItems = allNavItems.filter(item => item.roles === null || item.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Menu">
      <div className="px-2 py-2">
        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-gray-50 rounded-xl">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">{user?.name || "User"}</div>
            <div className="text-sm text-gray-500 truncate">{user?.email}</div>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : href === "/settings"
                ? pathname === "/settings" || (pathname.startsWith("/settings") && !pathname.startsWith("/settings/profile"))
                : pathname.startsWith(href);
            const showBadge =
              (href === "/tasks" && taskBadge > 0) ||
              (href === "/appointments" && appointmentBadge > 0) ||
              (href === "/payments" && paymentBadge > 0);
            const badgeCount =
              href === "/tasks" ? taskBadge :
              href === "/appointments" ? appointmentBadge :
              paymentBadge;

            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl text-base transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-gray-700 hover:bg-gray-100 active:bg-gray-200"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="flex-1">{label}</span>
                {showBadge && (
                  <span className="ml-auto text-xs bg-primary text-white rounded-full px-2 py-0.5 font-medium min-w-[24px] text-center">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="my-3 border-t border-gray-100" />

        {/* Profile and Sign out */}
        <div className="space-y-0.5">
          <Link
            href="/settings/profile"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-base text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <User className="w-5 h-5 shrink-0" />
            <span>Profile</span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-base text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, LayoutGrid, Briefcase, Settings,
  Heart, LogOut, User, Menu, X, CalendarDays, CreditCard, CheckSquare,
} from "lucide-react";
import { UserRole } from "@prisma/client";
import { fetchApi } from "@/lib/fetch";
import { useRefresh } from "@/context/RefreshContext";

const allNavItems = [
  { href: "/",                  label: "Dashboard",    icon: LayoutDashboard, roles: null },
  { href: "/guests",            label: "Guests",       icon: Users,           roles: null },
  { href: "/seating",           label: "Seating",      icon: LayoutGrid,      roles: null },
  { href: "/appointments",      label: "Appointments", icon: CalendarDays,    roles: null },
  { href: "/tasks",             label: "Tasks",        icon: CheckSquare,     roles: ["ADMIN", "VIEWER"] as UserRole[] },
  { href: "/suppliers",         label: "Suppliers",    icon: Briefcase,       roles: ["ADMIN", "VIEWER"] as UserRole[] },
  { href: "/payments",          label: "Payments",     icon: CreditCard,      roles: ["ADMIN", "VIEWER"] as UserRole[] },
  { href: "/settings",          label: "Settings",     icon: Settings,        roles: ["ADMIN"] as UserRole[] },
  { href: "/settings/profile",  label: "My Profile",   icon: User,            roles: null },
];

interface LayoutShellProps {
  user?: { name?: string | null; email?: string | null; role?: UserRole };
  failedLoginCount?: number;
  children: React.ReactNode;
}

export function LayoutShell({ user, failedLoginCount = 0, children }: LayoutShellProps) {
  const role = user?.role ?? "ADMIN";
  const navItems = allNavItems.filter(item => item.roles === null || item.roles.includes(role));
  const [open, setOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true); // start hidden; corrected by effect
  const [taskBadge, setTaskBadge] = useState(0);
  const pathname = usePathname();
  const { refreshToken } = useRefresh();

  // Read dismissal state from sessionStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    if (failedLoginCount > 0) {
      const dismissed = sessionStorage.getItem("security_banner_dismissed") === "true";
      setBannerDismissed(dismissed);
    }
  }, [failedLoginCount]);

  function dismissBanner() {
    sessionStorage.setItem("security_banner_dismissed", "true");
    setBannerDismissed(true);
  }

  // Close sidebar when route changes
  useEffect(() => { setOpen(false); }, [pathname]);

  // Task badge: count overdue + due this week (refresh on each navigation)
  useEffect(() => {
    fetchApi("/api/tasks/count")
      .then(r => r.ok ? r.json() : { count: 0 })
      .then((data: { count: number }) => setTaskBadge(data.count))
      .catch(() => {});
  }, [pathname, refreshToken]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 transition-transform duration-200 md:relative md:translate-x-0 md:w-56",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center shrink-0">
              <Heart className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">Wedding Planner</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden p-1 rounded text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : href === "/settings"
                ? pathname === "/settings" || (pathname.startsWith("/settings") && !pathname.startsWith("/settings/profile"))
                : pathname.startsWith(href);
            const showBadge = href === "/tasks" && taskBadge > 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {showBadge && (
                  <span className="ml-auto text-xs bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 font-medium min-w-[20px] text-center leading-tight">
                    {taskBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden md:block" />

          <div className="flex items-center gap-3">
            <Link
              href="/settings/profile"
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors rounded-lg px-1 py-0.5 hover:bg-gray-100"
            >
              <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <span className="hidden sm:block">{user?.name ?? user?.email ?? "User"}</span>
            </Link>
            <button
              onClick={async () => { await signOut(); window.location.href = "/login"; }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </header>

        {failedLoginCount > 0 && !bannerDismissed && (
          <div className="shrink-0 flex items-start gap-3 bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-3 text-sm text-amber-800">
            <span className="shrink-0 mt-0.5">&#9888;</span>
            <span className="flex-1">
              <strong>Security alert:</strong>{" "}
              {failedLoginCount} failed login attempt{failedLoginCount !== 1 ? "s" : ""} detected
              on your account in the last 24 hours. If this wasn&apos;t you, consider{" "}
              <a href="/settings/profile" className="underline font-medium hover:text-amber-900">
                changing your password
              </a>
              .{" "}
              <a href="/settings/profile" className="underline font-medium hover:text-amber-900">
                View login activity &rarr;
              </a>
            </span>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Dismiss security alert"
              className="shrink-0 p-0.5 rounded hover:bg-amber-100 text-amber-600 hover:text-amber-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

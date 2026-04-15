"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { MobileMenu } from "@/components/MobileMenu";
import {
  LayoutDashboard, Users, LayoutGrid, Briefcase, Settings,
  Heart, LogOut, User, X, CalendarCheck, CreditCard,
  Clock, PiggyBank, Music, Lock, ArrowLeftRight,
} from "lucide-react";
import { UserRole, SubStatus } from "@prisma/client";
import { fetchApi } from "@/lib/fetch";
import { useRefresh } from "@/context/RefreshContext";
import { useWedding } from "@/context/WeddingContext";

const allNavItems = [
  { href: "/",                  label: "Dashboard",    icon: LayoutDashboard, roles: null, premium: false },
  { href: "/guests",            label: "Guests",       icon: Users,           roles: null, premium: false },
  { href: "/seating",           label: "Seating",      icon: LayoutGrid,      roles: null, premium: false },
  { href: "/planner",           label: "Planner",      icon: CalendarCheck,   roles: null, premium: false },
  { href: "/suppliers",         label: "Suppliers",    icon: Briefcase,       roles: ["ADMIN", "VIEWER"] as UserRole[], premium: false },
  { href: "/payments",          label: "Payments",     icon: CreditCard,      roles: ["ADMIN", "VIEWER"] as UserRole[], premium: false },
  { href: "/budget",            label: "Budget",       icon: PiggyBank,       roles: ["ADMIN", "VIEWER"] as UserRole[], premium: false },
  { href: "/timeline",          label: "Timeline",     icon: Clock,           roles: null, premium: true },
  { href: "/music",             label: "Music",        icon: Music,           roles: null, premium: true },
  { href: "/settings",          label: "Settings",     icon: Settings,        roles: ["ADMIN"] as UserRole[], premium: false },
];

interface LayoutShellProps {
  user?: { name?: string | null; email?: string | null; role?: UserRole };
  failedLoginCount?: number;
  weddingCount?: number;
  children: React.ReactNode;
}

export function LayoutShell({ user, failedLoginCount = 0, weddingCount = 1, children }: LayoutShellProps) {
  const role = user?.role ?? "ADMIN";
  const { subscriptionStatus } = useWedding();
  const isFree = subscriptionStatus === "FREE";
  const navItems = allNavItems.filter(item => item.roles === null || item.roles.includes(role));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true); // start hidden; corrected by effect
  const [plannerBadge, setPlannerBadge] = useState(0);
  const [paymentBadge, setPaymentBadge] = useState(0);
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

  // Close sidebar and mobile menu when route changes
  useEffect(() => {
    setSidebarOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  // Badge counts: planner (tasks + appointments), payments (refresh on each navigation)
  useEffect(() => {
    fetchApi("/api/dashboard/counts")
      .then(r => r.ok ? r.json() : { tasks: 0, appointments: 0, payments: 0 })
      .then((data: { tasks: number; appointments: number; payments: number }) => {
        setPlannerBadge((data.tasks ?? 0) + (data.appointments ?? 0));
        setPaymentBadge(data.payments);
      })
      .catch(() => {});
  }, [pathname, refreshToken]);

  return (
    <div className="flex h-dvh bg-gray-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Sidebar - Desktop only */}
      <aside
        className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex-col shrink-0",
          "md:w-56"
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center shrink-0">
              <Heart className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">Wedding Planner</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, premium }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : href === "/settings"
                ? pathname === "/settings" || (pathname.startsWith("/settings") && !pathname.startsWith("/settings/profile"))
                : pathname.startsWith(href);
            const showBadge =
              (href === "/planner" && plannerBadge > 0) ||
              (href === "/payments" && paymentBadge > 0);
            const badgeCount =
              href === "/planner" ? plannerBadge :
              paymentBadge;
            const locked = premium && isFree;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  locked && !active && "opacity-60"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {locked && (
                  <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                )}
                {showBadge && (
                  <span className="ml-auto text-xs bg-primary/15 text-primary rounded-full px-1.5 py-0.5 font-medium min-w-[20px] text-center leading-tight">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 md:ml-56">
        {/* Header - Desktop only */}
        <header className="hidden md:flex h-14 bg-white border-b border-gray-200 items-center justify-between px-6 shrink-0">
          <div />

          <div className="flex items-center gap-3">
            <Link
              href="/settings/profile"
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors rounded-lg px-2 py-1 min-h-[44px] hover:bg-gray-100"
            >
              <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <span className="hidden sm:block">{user?.name ?? user?.email ?? "User"}</span>
            </Link>
            {weddingCount > 1 && (
              <Link
                href="/select-wedding"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 min-h-[44px] rounded-lg hover:bg-gray-100"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Switch Wedding</span>
              </Link>
            )}
            <button
              onClick={async () => { await signOut(); window.location.href = "/login"; }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 min-h-[44px] rounded-lg hover:bg-gray-100"
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

        <main className="flex-1 overflow-auto p-4 md:p-6 main-content">{children}</main>

        {/* Bottom navigation bar (mobile only) */}
        <BottomNav
          role={role}
          plannerBadge={plannerBadge}
          onOpenSidebar={() => setMobileMenuOpen(true)}
        />
      </div>

      {/* Mobile Menu (bottom sheet) */}
      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        user={user}
        plannerBadge={plannerBadge}
        paymentBadge={paymentBadge}
        weddingCount={weddingCount}
      />
    </div>
  );
}

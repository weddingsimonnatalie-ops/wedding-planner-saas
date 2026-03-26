"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserRole, MealOption } from "@prisma/client";

// Matches the fields from the Wedding model used in this component
interface WeddingConfig {
  coupleName: string;
  weddingDate: Date | null;
  venueName: string | null;
  venueAddress: string | null;
  reminderEmail: string | null;
  sessionTimeout: number;
  sessionWarningTime: number;
}
import { UsersManager } from "./UsersManager";
import { MealOptionsList } from "./MealOptionsList";
import { CategoriesManager } from "./CategoriesManager";
import { NotificationsForm } from "./NotificationsForm";
import { SessionTimeoutSettings } from "./SessionTimeoutSettings";
import { WeddingConfigForm } from "@/components/wedding-config-form";
import Link from "next/link";
import { CreditCard, Calendar, Download } from "lucide-react";

interface BillingInfo {
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
}

interface SettingsClientProps {
  config: WeddingConfig | null;
  mealOptions: MealOption[];
  mealCounts: Record<string, number>;
  users: Array<{
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
    twoFactorEnabled: boolean;
    lockedUntil: Date | string | null;
    emailVerified: Date | string | null;
    createdAt: Date | string;
  }>;
  invites: Array<{
    id: string;
    email: string | null;
    role: UserRole;
    expiresAt: Date | string;
    createdAt: Date | string;
  }>;
  ownerUserId: string | null;
  currentUserEmail: string;
  emailVerificationRequired: boolean;
  billing: BillingInfo | null;
}

type Tab = "general" | "meals" | "categories" | "users" | "billing";

export function SettingsClient({
  config,
  mealOptions,
  mealCounts,
  users,
  invites,
  ownerUserId,
  currentUserEmail,
  emailVerificationRequired,
  billing,
}: SettingsClientProps) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [tab, setTab] = useState<Tab>(() => {
    if (tabParam === "meals") return "meals";
    if (tabParam === "categories") return "categories";
    if (tabParam === "users") return "users";
    if (tabParam === "billing") return "billing";
    return "general";
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "meals", label: "Meals" },
    { id: "categories", label: "Categories" },
    { id: "users", label: "Users" },
    { id: "billing", label: "Billing" },
  ];

  const statusLabel: Record<string, string> = {
    TRIALING: "Trial",
    ACTIVE: "Active",
    PAST_DUE: "Payment overdue",
    CANCELLED: "Cancelled",
    PAUSED: "Paused",
  };

  const statusColour: Record<string, string> = {
    TRIALING: "text-blue-600 bg-blue-50",
    ACTIVE: "text-green-600 bg-green-50",
    PAST_DUE: "text-amber-600 bg-amber-50",
    CANCELLED: "text-red-600 bg-red-50",
    PAUSED: "text-gray-600 bg-gray-50",
  };

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex bg-gray-100 rounded-lg p-1 gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* General tab */}
      {tab === "general" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-4">Wedding Details</h2>
            <WeddingConfigForm config={config} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Notifications</h2>
            <p className="text-sm text-gray-500 mb-4">
              Configure where reminder emails are delivered.
            </p>
            <NotificationsForm reminderEmail={config?.reminderEmail ?? null} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Session Timeout</h2>
            <p className="text-sm text-gray-500 mb-4">
              Configure how long users stay logged in before being timed out due to inactivity.
            </p>
            <SessionTimeoutSettings
              initialTimeoutMinutes={config?.sessionTimeout ?? 60}
              initialWarningMinutes={config?.sessionWarningTime ?? 5}
            />
          </div>
        </div>
      )}

      {/* Meals tab */}
      {tab === "meals" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-medium text-gray-900 mb-1">Meal Options</h2>
          <p className="text-sm text-gray-500 mb-4">
            Configure the meal choices shown on RSVP forms.
          </p>
          <MealOptionsList initialOptions={mealOptions} mealCounts={mealCounts} />
        </div>
      )}

      {/* Categories tab */}
      {tab === "categories" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Supplier Categories</h2>
            <p className="text-sm text-gray-500 mb-4">
              Categories for organising your suppliers.
            </p>
            <CategoriesManager entityType="supplier" apiBase="/api/supplier-categories" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Appointment Categories</h2>
            <p className="text-sm text-gray-500 mb-4">
              Categories for organising your appointments.
            </p>
            <CategoriesManager entityType="appointment" apiBase="/api/appointment-categories" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Task Categories</h2>
            <p className="text-sm text-gray-500 mb-4">
              Categories for organising your tasks.
            </p>
            <CategoriesManager entityType="task" apiBase="/api/task-categories" />
          </div>
        </div>
      )}

      {/* Billing tab */}
      {tab === "billing" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-medium text-gray-900">Subscription</h2>
                <p className="text-sm text-gray-500 mt-0.5">Wedding Planner · Standard plan · £12/month</p>
              </div>
              {billing && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColour[billing.subscriptionStatus] ?? "text-gray-600 bg-gray-50"}`}>
                  {statusLabel[billing.subscriptionStatus] ?? billing.subscriptionStatus}
                </span>
              )}
            </div>

            {billing?.currentPeriodEnd && billing.subscriptionStatus === "ACTIVE" && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                <Calendar className="w-4 h-4" />
                <span>
                  Next billing:{" "}
                  {new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </div>
            )}

            {billing?.trialEndsAt && billing.subscriptionStatus === "TRIALING" && (
              <div className="flex items-center gap-2 text-sm text-blue-600 mb-4">
                <Calendar className="w-4 h-4" />
                <span>
                  Trial ends:{" "}
                  {new Date(billing.trialEndsAt).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </div>
            )}

            {billing?.gracePeriodEndsAt && billing.subscriptionStatus === "PAST_DUE" && (
              <div className="flex items-center gap-2 text-sm text-amber-600 mb-4">
                <Calendar className="w-4 h-4" />
                <span>
                  Grace period ends:{" "}
                  {new Date(billing.gracePeriodEndsAt).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </div>
            )}

            <form action="/api/billing/portal" method="POST">
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                Manage subscription in Stripe
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Your data</h2>
            <p className="text-sm text-gray-500 mb-4">
              Download a full export of your wedding data including guests, suppliers, payments, appointments, and tasks.
            </p>
            <a
              href="/api/export"
              download
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download my data
            </a>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">User Management</h2>
            <p className="text-sm text-gray-500 mb-4">
              Add or remove admin accounts, manage roles and permissions.
            </p>
            <UsersManager
              initialUsers={users}
              initialInvites={invites}
              ownerUserId={ownerUserId}
              currentUserEmail={currentUserEmail}
              emailVerificationRequired={emailVerificationRequired}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium text-gray-900">Security</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Manage two-factor authentication and trusted devices.
                </p>
              </div>
              <Link
                href="/settings/security"
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Manage security
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
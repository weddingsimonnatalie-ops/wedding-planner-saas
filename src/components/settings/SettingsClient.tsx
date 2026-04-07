"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserRole, MealOption } from "@prisma/client";

// Matches the fields from the Wedding model used in this component
interface WeddingConfig {
  coupleName: string;
  weddingDate: Date | null;
  reminderEmail: string | null;
  sessionTimeout: number;
  sessionWarningTime: number;
  themeHue: number;
  currencySymbol: string;
  totalBudget?: number | null;
  timezone: string;
  // Event name configuration
  ceremonyEnabled: boolean;
  ceremonyName: string;
  ceremonyLocation?: string | null;
  ceremonyMealsEnabled: boolean;
  mealEnabled: boolean;
  mealName: string;
  mealLocation?: string | null;
  mealMealsEnabled: boolean;
  eveningPartyEnabled: boolean;
  eveningPartyName: string;
  eveningPartyLocation?: string | null;
  eveningPartyMealsEnabled: boolean;
  rehearsalDinnerEnabled: boolean;
  rehearsalDinnerName: string;
  rehearsalDinnerLocation?: string | null;
  rehearsalDinnerMealsEnabled: boolean;
}
import { UsersManager } from "./UsersManager";
import { MealOptionsList } from "./MealOptionsList";
import { CategoriesManager } from "./CategoriesManager";
import { NotificationsForm } from "./NotificationsForm";
import { SessionTimeoutSettings } from "./SessionTimeoutSettings";
import { ThemeColorPicker } from "./ThemeColorPicker";
import { CurrencySymbolPicker } from "./CurrencySymbolPicker";
import { EventNamesSettings } from "./EventNamesSettings";
import { TwoFactorSettings } from "./TwoFactorSettings";
import { TrustedDevicesList } from "./TrustedDevicesList";
import { TimezonePicker } from "./TimezonePicker";
import { WeddingConfigForm } from "@/components/wedding-config-form";
import { getEvents } from "@/lib/eventNames";
import Link from "next/link";
import { CreditCard } from "lucide-react";

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
}

type Tab = "general" | "meals" | "categories" | "users" | "security" | "billing";

export function SettingsClient({
  config,
  mealOptions,
  mealCounts,
  users,
  invites,
  ownerUserId,
  currentUserEmail,
  emailVerificationRequired,
}: SettingsClientProps) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [tab, setTab] = useState<Tab>(() => {
    if (tabParam === "meals") return "meals";
    if (tabParam === "categories") return "categories";
    if (tabParam === "users") return "users";
    if (tabParam === "security") return "security";
    if (tabParam === "billing") return "billing";
    return "general";
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "categories", label: "Categories" },
    { id: "meals", label: "Meals" },
    { id: "users", label: "Users" },
    { id: "security", label: "Security" },
    { id: "billing", label: "Billing" },
  ];

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
            <h2 className="text-base font-medium text-gray-900 mb-1">Event Names</h2>
            <p className="text-sm text-gray-500 mb-4">
              Customise the names of events shown on RSVP forms and guest lists.
            </p>
            <EventNamesSettings
              initialConfig={{
                ceremonyEnabled: config?.ceremonyEnabled ?? true,
                ceremonyName: config?.ceremonyName ?? "Ceremony",
                ceremonyLocation: config?.ceremonyLocation,
                ceremonyMealsEnabled: config?.ceremonyMealsEnabled ?? false,
                mealEnabled: config?.mealEnabled ?? true,
                mealName: config?.mealName ?? "Wedding Breakfast",
                mealLocation: config?.mealLocation,
                mealMealsEnabled: config?.mealMealsEnabled ?? true,
                eveningPartyEnabled: config?.eveningPartyEnabled ?? true,
                eveningPartyName: config?.eveningPartyName ?? "Evening Reception",
                eveningPartyLocation: config?.eveningPartyLocation,
                eveningPartyMealsEnabled: config?.eveningPartyMealsEnabled ?? false,
                rehearsalDinnerEnabled: config?.rehearsalDinnerEnabled ?? false,
                rehearsalDinnerName: config?.rehearsalDinnerName ?? "Rehearsal Dinner",
                rehearsalDinnerLocation: config?.rehearsalDinnerLocation,
                rehearsalDinnerMealsEnabled: config?.rehearsalDinnerMealsEnabled ?? false,
              }}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Notifications</h2>
            <p className="text-sm text-gray-500 mb-4">
              Configure where reminder emails are delivered.
            </p>
            <NotificationsForm reminderEmail={config?.reminderEmail ?? null} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Wedding Colour Theme</h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose a colour that matches your wedding palette. It will be used throughout the planner.
            </p>
            <ThemeColorPicker initialHue={config?.themeHue ?? 330} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Currency Symbol</h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose the symbol shown next to monetary amounts throughout the planner.
            </p>
            <CurrencySymbolPicker initialSymbol={config?.currencySymbol ?? "£"} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Timezone</h2>
            <p className="text-sm text-gray-500 mb-4">
              Set your local timezone for accurate countdown and date calculations.
            </p>
            <TimezonePicker initialTimezone={config?.timezone ?? "Europe/London"} />
          </div>

        </div>
      )}

      {/* Meals tab */}
      {tab === "meals" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-medium text-gray-900 mb-1">Meal Options</h2>
          <p className="text-sm text-gray-500 mb-4">
            Configure the meal choices shown on RSVP forms for each event.
          </p>
          <MealOptionsList
            initialOptions={mealOptions}
            mealCounts={mealCounts}
            events={config ? getEvents(config, true) : []}
          />
        </div>
      )}

      {/* Categories tab */}
      {tab === "categories" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Planning Categories</h2>
            <p className="text-sm text-gray-500 mb-4">
              Shared categories for organising your suppliers, appointments, and tasks.
            </p>
            <CategoriesManager entityType="planning" apiBase="/api/planning-categories" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Timeline Categories</h2>
            <p className="text-sm text-gray-500 mb-4">
              Categories for organising your wedding day timeline events.
            </p>
            <CategoriesManager entityType="timeline" apiBase="/api/timeline-categories" />
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
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
      )}

      {/* Security tab */}
      {tab === "security" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">
              Two-factor authentication
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Add an extra layer of security by requiring a code from your authenticator
              app each time you sign in.
            </p>
            <TwoFactorSettings />
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

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">
              Trusted devices
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Devices you&apos;ve marked as trusted. Trusted devices stay logged in longer.
            </p>
            <TrustedDevicesList />
          </div>
        </div>
      )}

      {/* Billing tab */}
      {tab === "billing" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-gray-900">Billing & Subscription</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Manage your subscription, payment method, and view invoices.
              </p>
            </div>
            <Link
              href="/billing"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Manage billing
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
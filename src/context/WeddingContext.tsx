"use client";

import { createContext, useContext } from "react";
import type { UserRole, SubStatus } from "@prisma/client";

export type EventNamesConfig = {
  ceremonyEnabled: boolean;
  ceremonyName: string;
  ceremonyMealsEnabled?: boolean;
  mealEnabled: boolean;
  mealName: string;
  mealMealsEnabled?: boolean;
  eveningPartyEnabled: boolean;
  eveningPartyName: string;
  eveningPartyMealsEnabled?: boolean;
  rehearsalDinnerEnabled: boolean;
  rehearsalDinnerName: string;
  rehearsalDinnerMealsEnabled?: boolean;
};

type WeddingContextValue = {
  weddingId: string;
  role: UserRole;
  subscriptionStatus: SubStatus;
  currencySymbol: string;
  eventNames: EventNamesConfig;
  dashboardLayout: string;
};

const WeddingContext = createContext<WeddingContextValue | null>(null);

export function WeddingProvider({
  weddingId,
  role,
  subscriptionStatus,
  currencySymbol,
  eventNames,
  dashboardLayout,
  children,
}: {
  weddingId: string;
  role: UserRole;
  subscriptionStatus: SubStatus;
  currencySymbol: string;
  eventNames: EventNamesConfig;
  dashboardLayout: string;
  children: React.ReactNode;
}) {
  return (
    <WeddingContext.Provider value={{ weddingId, role, subscriptionStatus, currencySymbol, eventNames, dashboardLayout }}>
      {children}
    </WeddingContext.Provider>
  );
}

export function useWedding(): WeddingContextValue {
  const ctx = useContext(WeddingContext);
  if (!ctx) {
    // Fallback for components rendered outside the dashboard layout
    return {
      weddingId: "",
      role: "VIEWER",
      subscriptionStatus: "TRIALING",
      currencySymbol: "£",
      eventNames: {
        ceremonyEnabled: true,
        ceremonyName: "Ceremony",
        mealEnabled: true,
        mealName: "Wedding Breakfast",
        eveningPartyEnabled: true,
        eveningPartyName: "Evening Reception",
        rehearsalDinnerEnabled: false,
        rehearsalDinnerName: "Rehearsal Dinner",
      },
      dashboardLayout: "classic",
    };
  }
  return ctx;
}

/**
 * Returns a user-facing tooltip message explaining why email sending is blocked,
 * or null when the subscription allows email. Use in UI components alongside
 * the canSendEmail boolean to show actionable tooltips on disabled email buttons.
 */
export function getEmailBlockReason(status: SubStatus): string | null {
  if (status === "ACTIVE" || status === "PAST_DUE") return null;
  if (status === "TRIALING") return "Upgrade to a paid plan to send emails";
  return "Email sending requires an active subscription";
}

/**
 * Returns a user-facing tooltip message explaining why file uploads are blocked,
 * or null when the subscription allows uploads. Use in UI components alongside
 * the canUpload boolean to show actionable tooltips on disabled upload buttons.
 */
export function getUploadBlockReason(status: SubStatus): string | null {
  if (status === "ACTIVE" || status === "PAST_DUE") return null;
  if (status === "TRIALING") return "Upgrade to a paid plan to upload files";
  return "File uploads require an active subscription";
}

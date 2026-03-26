"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@prisma/client";

type WeddingContextValue = {
  weddingId: string;
  role: UserRole;
};

const WeddingContext = createContext<WeddingContextValue | null>(null);

export function WeddingProvider({
  weddingId,
  role,
  children,
}: {
  weddingId: string;
  role: UserRole;
  children: React.ReactNode;
}) {
  return (
    <WeddingContext.Provider value={{ weddingId, role }}>
      {children}
    </WeddingContext.Provider>
  );
}

export function useWedding(): WeddingContextValue {
  const ctx = useContext(WeddingContext);
  if (!ctx) {
    // Fallback for components rendered outside the dashboard layout
    return { weddingId: "", role: "VIEWER" };
  }
  return ctx;
}

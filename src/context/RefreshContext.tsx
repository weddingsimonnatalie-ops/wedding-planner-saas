"use client";

import { createContext, useContext, useState } from "react";

interface RefreshContextValue {
  refreshToken: number;
  triggerRefresh: () => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  refreshToken: 0,
  triggerRefresh: () => {},
});

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshToken, setRefreshToken] = useState(0);
  function triggerRefresh() {
    setRefreshToken(n => n + 1);
  }
  return (
    <RefreshContext.Provider value={{ refreshToken, triggerRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  return useContext(RefreshContext);
}

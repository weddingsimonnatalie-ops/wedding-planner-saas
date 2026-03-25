"use client";

// Better Auth's useSession hook works without a provider wrapper.
// The auth client handles session management internally via React context.

export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
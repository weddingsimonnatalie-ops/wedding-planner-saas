import { createAuthClient } from "better-auth/react";

// Use NEXT_PUBLIC_APP_URL for client-side, fallback to window.location.origin
// In production, set NEXT_PUBLIC_APP_URL=https://planner.simon-natalie.com in .env
const baseURL = process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

export const authClient = createAuthClient({
  baseURL,
});

// Export hooks and methods for convenience
export const useSession = authClient.useSession;
export const signIn = authClient.signIn;
export const signOut = authClient.signOut;

// Type exports for custom user fields
export type { Session, User } from "./auth-better";
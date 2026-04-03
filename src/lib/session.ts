import { prisma } from "@/lib/prisma";
import { auth } from "./auth-better";
import { headers } from "next/headers";
import { UserRole } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  twoFactorEnabled: boolean;
};

export type Session = {
  user: SessionUser;
  session: {
    id: string;
    expiresAt: Date;
  };
};

export async function getSession(): Promise<Session | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as any).role ?? "VIEWER",
      twoFactorEnabled: (session.user as any).twoFactorEnabled ?? false,
    },
    session: session.session,
  };
}

export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

/**
 * Increment the session version for a user, invalidating all existing sessions.
 * Call this when:
 * - User changes password
 * - User changes email
 * - User enables/disables 2FA
 * - Admin changes user's role
 *
 * @param userId - The user ID whose sessions should be invalidated
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.$transaction([
    // Increment sessionVersion so any in-flight cached sessions are rejected
    prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    }),
    // Delete all Better Auth sessions so the user must re-authenticate
    prisma.session.deleteMany({
      where: { userId },
    }),
  ]);
}
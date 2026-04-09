import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { verifyWeddingCookie, COOKIE_NAME } from "@/lib/wedding-cookie";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export type ServerContext = {
  userId: string;
  userEmail: string;
  userName: string | null;
  weddingId: string;
  role: UserRole;
  dashboardLayout: string;
};

/**
 * Get the weddingId and role for the current user from server components.
 * Reads the signed weddingId cookie and verifies WeddingMember membership.
 *
 * Returns null if unauthenticated or no wedding context — callers should
 * call requireServerContext() instead if they want automatic redirects.
 */
export async function getServerContext(): Promise<ServerContext | null> {
  const session = await getSession();
  if (!session) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookieValue) return null;

  const cookiePayload = await verifyWeddingCookie(cookieValue);
  if (!cookiePayload) return null;
  const weddingId = cookiePayload.weddingId;

  const member = await prisma.weddingMember.findUnique({
    where: { userId_weddingId: { userId: session.user.id, weddingId } },
  });
  if (!member) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dashboardLayout: true },
  });

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    userName: session.user.name,
    weddingId,
    role: member.role,
    dashboardLayout: user?.dashboardLayout ?? "classic",
  };
}

/**
 * Like getServerContext() but redirects to login/select-wedding on failure.
 * Use in server components that require authentication and a wedding context.
 */
export async function requireServerContext(
  requiredRole?: UserRole[]
): Promise<ServerContext> {
  const ctx = await getServerContext();
  if (!ctx) {
    redirect("/login");
  }
  if (requiredRole && !requiredRole.includes(ctx.role)) {
    redirect("/");
  }
  return ctx;
}

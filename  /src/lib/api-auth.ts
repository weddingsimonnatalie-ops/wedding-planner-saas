import { NextRequest } from "next/server";
import { auth } from "@/lib/auth-better";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  twoFactorEnabled: boolean;
  sessionVersion: number;
};

type AuthSuccess = { authorized: true; user: SessionUser };
type AuthFailure = { authorized: false; response: NextResponse };

/**
 * Get the current session and check role-based access.
 * Uses Better Auth's session API with headers from the request.
 */
export async function requireRole(
  allowedRoles: UserRole[],
  req: NextRequest
): Promise<AuthSuccess | AuthFailure> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
      };
    }

    // Cast the user to include our custom fields
    const user = session.user as SessionUser;

    if (!allowedRoles.includes(user.role)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Forbidden — insufficient permissions" },
          { status: 403 }
        ),
      };
    }

    // Check session version to detect invalidated sessions
    // (password change, email change, 2FA toggle, role change)
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { sessionVersion: true },
    });

    if (!dbUser || dbUser.sessionVersion !== user.sessionVersion) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Session expired — please log in again" },
          { status: 401 }
        ),
      };
    }

    return { authorized: true, user };
  } catch (error) {
    console.error("requireRole error:", error);
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
    };
  }
}

// Convenience helpers - require NextRequest parameter
export const requireAdmin = (req: NextRequest) => requireRole(["ADMIN"], req);
export const requireAdminOrRsvpManager = (req: NextRequest) => requireRole(["ADMIN", "RSVP_MANAGER"], req);
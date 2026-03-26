import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { UserRole, SubStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyWeddingCookie, COOKIE_NAME } from "@/lib/wedding-cookie";

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  twoFactorEnabled: boolean;
  sessionVersion: number;
};

type WeddingContext = {
  subscriptionStatus: SubStatus;
  currentPeriodEnd: Date | null;
  gracePeriodEndsAt: Date | null;
};

type AuthSuccess = {
  authorized: true;
  user: SessionUser;
  weddingId: string;
  role: UserRole;
  wedding: WeddingContext;
};
type AuthFailure = { authorized: false; response: NextResponse };

/**
 * Get the current session, verify the signed weddingId cookie, and check
 * role-based access for the authenticated user's WeddingMember record.
 *
 * Steps:
 *  1. Validate Better Auth session
 *  2. Read and verify signed weddingId cookie — 401 if missing or tampered
 *  3. Query WeddingMember to confirm user is a member with one of allowedRoles
 *  4. Check subscription status — redirect to /billing/suspended if lapsed
 *  5. Check sessionVersion — 401 if session has been invalidated
 */
export async function requireRole(
  allowedRoles: UserRole[],
  req: NextRequest,
  options?: { allowLapsed?: boolean }
): Promise<AuthSuccess | AuthFailure> {
  try {
    // Step 1: validate Better Auth session
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
      };
    }

    const sessionUser = session.user as SessionUser;

    // Step 2: read and verify signed weddingId cookie
    const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
    if (!cookieValue) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "No wedding context" }, { status: 401 }),
      };
    }
    const cookiePayload = await verifyWeddingCookie(cookieValue);
    if (!cookiePayload) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Invalid wedding context" }, { status: 401 }),
      };
    }
    const weddingId = cookiePayload.weddingId;

    // Step 3: query WeddingMember to confirm role
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: sessionUser.id, weddingId } },
      include: {
        wedding: {
          select: {
            subscriptionStatus: true,
            currentPeriodEnd: true,
            gracePeriodEndsAt: true,
          },
        },
      },
    });

    if (!member) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Not a member of this wedding" }, { status: 403 }),
      };
    }

    if (!allowedRoles.includes(member.role)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Forbidden — insufficient permissions" },
          { status: 403 }
        ),
      };
    }

    // Step 4: check subscription status (skip for billing/portal routes that need to work when lapsed)
    const { subscriptionStatus, currentPeriodEnd, gracePeriodEndsAt } = member.wedding;
    if (
      !options?.allowLapsed &&
      (subscriptionStatus === "CANCELLED" ||
        (subscriptionStatus === "PAST_DUE" &&
          gracePeriodEndsAt !== null &&
          gracePeriodEndsAt < new Date()))
    ) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Subscription inactive", redirect: "/billing/suspended" },
          { status: 402 }
        ),
      };
    }

    // Step 5: check sessionVersion (fix GLM-5 bug — compare against User record, not session itself)
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { sessionVersion: true },
    });

    if (!dbUser || dbUser.sessionVersion !== sessionUser.sessionVersion) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Session expired — please log in again" },
          { status: 401 }
        ),
      };
    }

    return {
      authorized: true,
      user: sessionUser,
      weddingId,
      role: member.role,
      wedding: { subscriptionStatus, currentPeriodEnd, gracePeriodEndsAt },
    };
  } catch (error) {
    console.error("requireRole error:", error);
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
    };
  }
}

// Convenience helpers
export const requireAdmin = (req: NextRequest) => requireRole(["ADMIN"], req);
export const requireAdminOrRsvpManager = (req: NextRequest) =>
  requireRole(["ADMIN", "RSVP_MANAGER"], req);

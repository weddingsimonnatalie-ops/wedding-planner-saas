import { NextRequest, NextResponse } from "next/server";
import { UserRole, SubStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth-better";
import { verifyWeddingCookie, COOKIE_NAME } from "@/lib/wedding-cookie";

// The session_data cookie is Better Auth's cookie cache. Stripping it from request
// headers forces auth.api.getSession() to do a live DB lookup, bypassing the cache.
// This ensures invalidated sessions (deleted by invalidateUserSessions) are caught
// immediately in API routes. Middleware still uses the cache (Edge runtime needs it).
const SESSION_DATA_COOKIE = "better-auth.session_data";

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
 *  1. Direct DB session lookup via session token cookie (bypasses Better Auth
 *     cookie cache so invalidated/deleted sessions are detected immediately)
 *  2. Read and verify signed weddingId cookie — 401 if missing or tampered
 *  3. Query WeddingMember to confirm user is a member with one of allowedRoles
 *  4. Check subscription status — redirect to /billing/suspended if lapsed
 *  5. Check sessionVersion — 401 if session has been invalidated
 *
 * Note: middleware uses auth.api.getSession() with cookie cache (Edge runtime
 * cannot use Prisma). API routes use this direct DB path instead.
 */
export async function requireRole(
  allowedRoles: UserRole[],
  req: NextRequest,
  options?: { allowLapsed?: boolean }
): Promise<AuthSuccess | AuthFailure> {
  try {
    // Step 1: get session with cache bypassed — strip the session_data cookie so
    // Better Auth falls back to a live DB lookup. Deleted sessions (from
    // invalidateUserSessions) are therefore caught immediately.
    const headersWithoutCache = new Headers(req.headers);
    const cookies = headersWithoutCache.get("cookie") ?? "";
    headersWithoutCache.set(
      "cookie",
      cookies
        .split(";")
        .map((c) => c.trim())
        .filter((c) => !c.startsWith(`${SESSION_DATA_COOKIE}=`))
        .join("; ")
    );

    const session = await auth.api.getSession({ headers: headersWithoutCache });
    if (!session?.user) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
      };
    }

    const sessionUser = session.user as SessionUser;

    // Step 2: resolve weddingId — cookie path (web) or X-Wedding-Id header path (mobile)
    let weddingId: string;
    const cookieValue = req.cookies.get(COOKIE_NAME)?.value;

    if (cookieValue) {
      // Web path: verify signed JWT cookie
      const cookiePayload = await verifyWeddingCookie(cookieValue);
      if (!cookiePayload) {
        return {
          authorized: false,
          response: NextResponse.json({ error: "Invalid wedding context" }, { status: 401 }),
        };
      }
      weddingId = cookiePayload.weddingId;
    } else {
      // Mobile path: accept raw weddingId from X-Wedding-Id header.
      // Security: membership is still verified in Step 3 — a forged header only
      // produces a "not a member" rejection, no data is exposed.
      const headerWeddingId = req.headers.get("X-Wedding-Id");
      if (!headerWeddingId) {
        return {
          authorized: false,
          response: NextResponse.json({ error: "No wedding context" }, { status: 401 }),
        };
      }
      // Basic UUID format guard to reject obviously malformed values
      if (!/^[0-9a-f-]{36}$/i.test(headerWeddingId)) {
        return {
          authorized: false,
          response: NextResponse.json({ error: "Invalid wedding context" }, { status: 401 }),
        };
      }
      weddingId = headerWeddingId;
    }

    // Step 3: query WeddingMember to confirm role
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: sessionUser.id, weddingId } },
      include: {
        wedding: {
          select: {
            subscriptionStatus: true,
            currentPeriodEnd: true,
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

    // Step 4: check subscription status — block lapsed PAST_DUE (past their billing period end)
    // FREE users are allowed through (they have limited features gated elsewhere)
    const { subscriptionStatus, currentPeriodEnd } = member.wedding;
    if (
      !options?.allowLapsed &&
      subscriptionStatus === "PAST_DUE" &&
      currentPeriodEnd !== null &&
      currentPeriodEnd < new Date()
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
      wedding: { subscriptionStatus, currentPeriodEnd },
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

/**
 * Check whether the current subscription allows product email sending.
 * Only ACTIVE and PAST_DUE (within grace period) subscriptions may send emails.
 * FREE tier accounts are blocked.
 */
export function requireEmailFeature(subStatus: SubStatus): NextResponse | null {
  if (subStatus === "ACTIVE" || subStatus === "PAST_DUE") return null;
  const message =
    subStatus === "FREE"
      ? "Email sending requires a paid subscription. Upgrade to send emails."
      : "Email sending requires an active subscription.";
  return NextResponse.json({ error: message }, { status: 402 });
}

/**
 * Returns a user-facing explanation of why email sending is blocked for the
 * given subscription status. Returns null when email is allowed.
 * Used by UI components to show status-appropriate tooltip text.
 */
export function getEmailBlockReason(subStatus: SubStatus): string | null {
  if (subStatus === "ACTIVE" || subStatus === "PAST_DUE") return null;
  if (subStatus === "FREE") return "Upgrade to a paid plan to send emails";
  return "Email sending requires an active subscription";
}

/**
 * Check whether the current subscription allows file uploads.
 * Only ACTIVE and PAST_DUE (within grace period) subscriptions may upload files.
 * FREE tier accounts are blocked.
 */
export function requireUploadFeature(subStatus: SubStatus): NextResponse | null {
  if (subStatus === "ACTIVE" || subStatus === "PAST_DUE") return null;
  const message =
    subStatus === "FREE"
      ? "File uploads require a paid subscription. Upgrade to upload files."
      : "File uploads require an active subscription.";
  return NextResponse.json({ error: message }, { status: 402 });
}

/**
 * Check whether the current subscription allows access to premium features
 * (Timeline, Music). Only ACTIVE and PAST_DUE subscriptions have access.
 */
export function requirePremiumFeature(subStatus: SubStatus): NextResponse | null {
  if (subStatus === "ACTIVE" || subStatus === "PAST_DUE") return null;
  const message =
    subStatus === "FREE"
      ? "This feature requires a paid subscription. Upgrade to access it."
      : "This feature requires an active subscription.";
  return NextResponse.json({ error: message }, { status: 402 });
}
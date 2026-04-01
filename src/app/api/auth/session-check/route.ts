export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { verifyWeddingCookie, COOKIE_NAME } from "@/lib/wedding-cookie";

/**
 * GET /api/auth/session-check
 *
 * Lightweight endpoint to check if the session and wedding context are still valid.
 * Used by the InactivityTimer when a tab becomes visible again (iOS Safari tab freeze).
 *
 * Returns:
 *   - 200 OK if session and wedding context are valid
 *   - 401 Unauthorized if session is invalid or wedding context is missing
 */
export async function GET(req: NextRequest) {
  try {
    // Check Better Auth session
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ valid: false, reason: "no-session" }, { status: 401 });
    }

    // Check wedding context cookie
    const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
    if (!cookieValue) {
      return NextResponse.json({ valid: false, reason: "no-wedding-context" }, { status: 401 });
    }

    const cookiePayload = await verifyWeddingCookie(cookieValue);
    if (!cookiePayload) {
      return NextResponse.json({ valid: false, reason: "invalid-wedding-context" }, { status: 401 });
    }

    // Both session and wedding context are valid
    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json({ valid: false, reason: "error" }, { status: 401 });
  }
}
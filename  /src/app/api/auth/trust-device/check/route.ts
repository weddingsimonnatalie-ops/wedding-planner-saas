import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { cookies } from "next/headers";
import { verifyTrustToken, TRUSTED_DEVICE_COOKIE } from "@/lib/trusted-device";

/**
 * GET /api/auth/trust-device/check
 * Check if the current device is trusted
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value;

    if (!token) {
      return NextResponse.json({ trusted: false });
    }

    const result = await verifyTrustToken(token);

    if (!result || result.userId !== auth.user.id) {
      return NextResponse.json({ trusted: false });
    }

    return NextResponse.json({ trusted: true });
  } catch (error) {
    console.error("Error checking trusted device:", error);
    return NextResponse.json({ trusted: false });
  }
}
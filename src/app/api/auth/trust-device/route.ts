export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { extractIp } from "@/lib/login-attempt";
import {
  createTrustedDevice,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_DURATION_DAYS,
} from "@/lib/trusted-device";

/**
 * POST /api/auth/trust-device
 * Create a new trusted device for the current user
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const userId = auth.user.id;
    const userAgent = req.headers.get("user-agent");
    const ipAddress = extractIp(req);

    const body = await req.json().catch(() => ({}));
    const deviceName = body.deviceName as string | undefined;

    const result = await createTrustedDevice(userId, userAgent, ipAddress);

    // Override device name if provided
    if (deviceName) {
      // We already created the device, so we'd need to update it
      // For now, just use the parsed name
    }

    // Set the trust cookie
    const response = NextResponse.json({
      success: true,
      deviceId: result.deviceId,
      expiresAt: result.expiresAt,
      expiresInDays: TRUSTED_DEVICE_DURATION_DAYS,
    });

    response.cookies.set({
      name: TRUSTED_DEVICE_COOKIE,
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TRUSTED_DEVICE_DURATION_DAYS * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error creating trusted device:", error);
    return NextResponse.json(
      { error: "Failed to create trusted device" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/trust-device
 * Revoke all trusted devices for the current user
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { revokeAllTrustedDevices } = await import("@/lib/trusted-device");
    const count = await revokeAllTrustedDevices(auth.user.id);

    const response = NextResponse.json({
      success: true,
      revokedCount: count,
    });

    // Clear the trust cookie
    response.cookies.set({
      name: TRUSTED_DEVICE_COOKIE,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error revoking trusted devices:", error);
    return NextResponse.json(
      { error: "Failed to revoke trusted devices" },
      { status: 500 }
    );
  }
}
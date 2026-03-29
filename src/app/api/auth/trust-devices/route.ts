export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { apiJson } from "@/lib/api-response";
import { getTrustedDevices } from "@/lib/trusted-device";

/**
 * GET /api/auth/trust-devices
 * List all trusted devices for the current user
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const devices = await getTrustedDevices(auth.user.id);

    return apiJson({
      devices: devices.map((d) => ({
        id: d.id,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        browser: d.browser,
        os: d.os,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
        ipAddress: d.ipAddress,
      })),
    });
  } catch (error) {
    console.error("Error fetching trusted devices:", error);
    return NextResponse.json(
      { error: "Failed to fetch trusted devices" },
      { status: 500 }
    );
  }
}
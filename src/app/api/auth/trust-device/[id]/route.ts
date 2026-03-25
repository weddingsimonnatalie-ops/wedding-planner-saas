import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { revokeTrustedDevice, TRUSTED_DEVICE_COOKIE } from "@/lib/trusted-device";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/auth/trust-device/[id]
 * Revoke a specific trusted device
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const userId = auth.user.id;

    // Check if this is the current device being revoked
    // If so, we need to clear the cookie
    const cookieStore = req.cookies;
    const currentToken = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value;
    let isCurrentDevice = false;

    if (currentToken) {
      // Hash the current token to compare
      const { createHash } = await import("crypto");
      const tokenHash = createHash("sha256").update(currentToken).digest("hex");
      const device = await prisma.trustedDevice.findUnique({
        where: { tokenHash },
        select: { id: true },
      });
      isCurrentDevice = device?.id === id;
    }

    const success = await revokeTrustedDevice(userId, id);

    if (!success) {
      return NextResponse.json(
        { error: "Device not found or not owned by user" },
        { status: 404 }
      );
    }

    const response = NextResponse.json({ success: true });

    // Clear cookie if revoking current device
    if (isCurrentDevice) {
      response.cookies.set({
        name: TRUSTED_DEVICE_COOKIE,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Error revoking trusted device:", error);
    return NextResponse.json(
      { error: "Failed to revoke trusted device" },
      { status: 500 }
    );
  }
}
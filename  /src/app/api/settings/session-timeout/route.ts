import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";

// Validation constants
const MIN_TIMEOUT = 5; // Minimum 5 minutes
const MAX_TIMEOUT = 480; // Maximum 8 hours
const MIN_WARNING = 1; // Minimum 1 minute warning
const MAX_WARNING = 30; // Maximum 30 minute warning

/**
 * GET /api/settings/session-timeout
 * Get current session timeout settings
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const config = await prisma.weddingConfig.findFirst({
      select: {
        sessionTimeoutMinutes: true,
        warningMinutes: true,
      },
    });

    // Default values if not set
    return apiJson({
      timeoutMinutes: config?.sessionTimeoutMinutes ?? 60,
      warningMinutes: config?.warningMinutes ?? 5,
    });
  } catch (error) {
    console.error("Error fetching session timeout settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch session timeout settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/session-timeout
 * Update session timeout settings (admin only)
 */
export async function PUT(req: NextRequest) {
  const auth = await requireRole(["ADMIN"], req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const timeoutMinutes = body.timeoutMinutes;
    const warningMinutes = body.warningMinutes;

    // Validate timeout
    if (
      typeof timeoutMinutes !== "number" ||
      timeoutMinutes < MIN_TIMEOUT ||
      timeoutMinutes > MAX_TIMEOUT
    ) {
      return NextResponse.json(
        { error: `Timeout must be between ${MIN_TIMEOUT} and ${MAX_TIMEOUT} minutes` },
        { status: 400 }
      );
    }

    // Validate warning
    if (
      typeof warningMinutes !== "number" ||
      warningMinutes < MIN_WARNING ||
      warningMinutes > MAX_WARNING
    ) {
      return NextResponse.json(
        { error: `Warning must be between ${MIN_WARNING} and ${MAX_WARNING} minutes` },
        { status: 400 }
      );
    }

    // Warning must be less than timeout
    if (warningMinutes >= timeoutMinutes) {
      return NextResponse.json(
        { error: "Warning time must be less than timeout" },
        { status: 400 }
      );
    }

    // Update config (there's always one row with id=1)
    await prisma.weddingConfig.update({
      where: { id: 1 },
      data: {
        sessionTimeoutMinutes: timeoutMinutes,
        warningMinutes: warningMinutes,
      },
    });

    return apiJson({
      success: true,
      timeoutMinutes,
      warningMinutes,
    });
  } catch (error) {
    console.error("Error updating session timeout settings:", error);
    return NextResponse.json(
      { error: "Failed to update session timeout settings" },
      { status: 500 }
    );
  }
}
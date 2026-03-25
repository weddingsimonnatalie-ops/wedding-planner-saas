import { NextRequest } from "next/server";
import { prisma } from "./prisma";

/**
 * Extract client IP from request headers.
 */
export function extractIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/**
 * Log a login attempt to the database.
 */
export async function logAttempt(email: string, success: boolean, req: NextRequest) {
  try {
    await prisma.loginAttempt.create({
      data: {
        email,
        success,
        ipAddress: extractIp(req),
        userAgent: req.headers.get("user-agent"),
      },
    });
  } catch (e) {
    console.error("Failed to log login attempt:", e);
  }
}
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

/**
 * Extract client IP from request headers.
 * Checks Cloudflare header first, then X-Forwarded-For, then X-Real-IP.
 */
export function extractIp(req: NextRequest): string | null {
  // Cloudflare sets this header with the real client IP
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  // Standard proxy header - first IP in the chain is the original client
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map(ip => ip.trim());
    // Return the first non-private IP (client IP, not internal proxy)
    for (const ip of ips) {
      if (ip && !isPrivateIp(ip)) return ip;
    }
    // Fall back to first IP if all are private
    return ips[0] || null;
  }

  return req.headers.get("x-real-ip");
}

/**
 * Check if an IP address is a private/internal IP.
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("172.16.") ||
      ip.startsWith("172.17.") ||
      ip.startsWith("172.18.") ||
      ip.startsWith("172.19.") ||
      ip.startsWith("172.20.") ||
      ip.startsWith("172.21.") ||
      ip.startsWith("172.22.") ||
      ip.startsWith("172.23.") ||
      ip.startsWith("172.24.") ||
      ip.startsWith("172.25.") ||
      ip.startsWith("172.26.") ||
      ip.startsWith("172.27.") ||
      ip.startsWith("172.28.") ||
      ip.startsWith("172.29.") ||
      ip.startsWith("172.30.") ||
      ip.startsWith("172.31.") ||
      ip === "127.0.0.1" ||
      ip.startsWith("169.254.")) {
    return true;
  }

  // IPv6 private/local
  if (ip.startsWith("::") || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }

  return false;
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
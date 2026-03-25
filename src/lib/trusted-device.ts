import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";

// Constants
export const TRUSTED_DEVICE_COOKIE = "trusted_device_token";
export const TRUSTED_DEVICE_DURATION_DAYS = 30;
export const TRUSTED_DEVICE_DURATION_MS = TRUSTED_DEVICE_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Device types
export type DeviceType = "desktop" | "tablet" | "mobile";

// Parsed device info from user agent
export interface DeviceInfo {
  deviceName: string;
  deviceType: DeviceType;
  browser: string;
  os: string;
}

/**
 * Generate a random trust token
 */
export function generateTrustToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a trust token for storage
 */
export function hashTrustToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Parse user agent to get device info
 */
export function parseUserAgent(userAgent: string | null): DeviceInfo {
  if (!userAgent) {
    return {
      deviceName: "Unknown Device",
      deviceType: "desktop",
      browser: "Unknown",
      os: "Unknown",
    };
  }

  // Detect OS
  let os = "Unknown";
  if (userAgent.includes("Windows NT 10")) os = "Windows 10/11";
  else if (userAgent.includes("Windows NT 6.3")) os = "Windows 8.1";
  else if (userAgent.includes("Windows NT 6.2")) os = "Windows 8";
  else if (userAgent.includes("Windows NT 6.1")) os = "Windows 7";
  else if (userAgent.includes("Mac OS X")) {
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
    os = match ? `macOS ${match[1].replace("_", ".")}` : "macOS";
  } else if (userAgent.includes("Android")) {
    const match = userAgent.match(/Android (\d+(\.\d+)?)/);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    const match = userAgent.match(/OS (\d+_\d+)/);
    os = match ? `iOS ${match[1].replace("_", ".")}` : "iOS";
  } else if (userAgent.includes("Linux")) os = "Linux";

  // Detect browser
  let browser = "Unknown";
  if (userAgent.includes("Edg/")) {
    const match = userAgent.match(/Edg\/(\d+(\.\d+)?)/);
    browser = match ? `Edge ${match[1]}` : "Edge";
  } else if (userAgent.includes("Chrome/")) {
    const match = userAgent.match(/Chrome\/(\d+(\.\d+)?)/);
    browser = match ? `Chrome ${match[1]}` : "Chrome";
  } else if (userAgent.includes("Firefox/")) {
    const match = userAgent.match(/Firefox\/(\d+(\.\d+)?)/);
    browser = match ? `Firefox ${match[1]}` : "Firefox";
  } else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome")) {
    const match = userAgent.match(/Version\/(\d+(\.\d+)?)/);
    browser = match ? `Safari ${match[1]}` : "Safari";
  }

  // Detect device type
  let deviceType: DeviceType = "desktop";
  if (userAgent.includes("Mobile") || userAgent.includes("iPhone") || userAgent.includes("Android")) {
    deviceType = userAgent.includes("iPad") || userAgent.includes("Tablet") ? "tablet" : "mobile";
  } else if (userAgent.includes("iPad")) {
    deviceType = "tablet";
  }

  // Generate device name
  let deviceName = os;
  if (deviceType === "mobile") {
    deviceName = userAgent.includes("iPhone") ? "iPhone" : userAgent.includes("iPad") ? "iPad" : "Phone";
  } else if (deviceType === "tablet") {
    deviceName = userAgent.includes("iPad") ? "iPad" : "Tablet";
  }

  return { deviceName, deviceType, browser, os };
}

/**
 * Create a trusted device for a user
 */
export async function createTrustedDevice(
  userId: string,
  userAgent: string | null,
  ipAddress: string | null
): Promise<{ token: string; deviceId: string; expiresAt: Date }> {
  const deviceInfo = parseUserAgent(userAgent);
  const token = generateTrustToken();
  const tokenHash = hashTrustToken(token);
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DURATION_MS);

  const device = await prisma.trustedDevice.create({
    data: {
      userId,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      tokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return {
    token,
    deviceId: device.id,
    expiresAt,
  };
}

/**
 * Verify a trust token from a cookie
 * Returns the device if valid, null if not found or expired
 */
export async function verifyTrustToken(
  token: string
): Promise<{ userId: string; deviceId: string } | null> {
  if (!token) return null;

  const tokenHash = hashTrustToken(token);

  const device = await prisma.trustedDevice.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!device) return null;
  if (device.expiresAt < new Date()) {
    // Clean up expired device
    await prisma.trustedDevice.delete({ where: { id: device.id } });
    return null;
  }

  // Update lastUsedAt
  await prisma.trustedDevice.update({
    where: { id: device.id },
    data: { lastUsedAt: new Date() },
  });

  return { userId: device.userId, deviceId: device.id };
}

/**
 * Check if request has a valid trusted device cookie
 */
export async function hasTrustedDevice(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value;

  if (!token) return false;

  const result = await verifyTrustToken(token);
  return result?.userId === userId;
}

/**
 * Get all trusted devices for a user
 */
export async function getTrustedDevices(userId: string) {
  const devices = await prisma.trustedDevice.findMany({
    where: { userId },
    select: {
      id: true,
      deviceName: true,
      deviceType: true,
      browser: true,
      os: true,
      createdAt: true,
      lastUsedAt: true,
      ipAddress: true,
      expiresAt: true,
    },
    orderBy: { lastUsedAt: "desc" },
  });

  return devices;
}

/**
 * Revoke a trusted device
 */
export async function revokeTrustedDevice(
  userId: string,
  deviceId: string
): Promise<boolean> {
  const result = await prisma.trustedDevice.deleteMany({
    where: { id: deviceId, userId },
  });

  return result.count > 0;
}

/**
 * Revoke all trusted devices for a user
 */
export async function revokeAllTrustedDevices(userId: string): Promise<number> {
  const result = await prisma.trustedDevice.deleteMany({
    where: { userId },
  });

  return result.count;
}

/**
 * Clean up expired trusted devices (can be called periodically)
 */
export async function cleanupExpiredTrustedDevices(): Promise<number> {
  const result = await prisma.trustedDevice.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return result.count;
}
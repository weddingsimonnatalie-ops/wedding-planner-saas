export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEnvConfig } from "@/lib/env";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  database: "connected" | "disconnected";
  redis: "connected" | "disconnected" | "not_configured";
  timestamp: string;
}

async function checkDatabase(): Promise<"connected" | "disconnected"> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "connected";
  } catch (error) {
    console.error("[health] Database check failed:", error);
    return "disconnected";
  }
}

async function checkRedis(): Promise<"connected" | "disconnected" | "not_configured"> {
  const config = getEnvConfig();

  if (!config.redisUrl) {
    return "not_configured";
  }

  try {
    // Dynamic import to avoid bundling ioredis when not needed
    const { Redis } = await import("ioredis");
    const redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    await redis.connect();
    await redis.ping();
    await redis.quit();
    return "connected";
  } catch (error) {
    console.error("[health] Redis check failed:", error);
    return "disconnected";
  }
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const [dbStatus, redisStatus] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const status: HealthStatus = {
    status: "healthy",
    database: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  };

  // Determine overall status
  if (dbStatus === "disconnected") {
    status.status = "unhealthy";
  } else if (redisStatus === "disconnected") {
    // Redis down but DB up = degraded (app still works, falls back to in-memory)
    status.status = "degraded";
  }

  const statusCode = status.status === "unhealthy" ? 503 : 200;

  return NextResponse.json(status, { status: statusCode });
}
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Handle database errors consistently across all API routes.
 * Logs full error details server-side, returns a safe message to the client.
 */
export function handleDbError(error: unknown): NextResponse {
  // Prisma known errors (e.g., unique constraint, record not found)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        // Unique constraint violation
        console.error("[db] Unique constraint error:", error.meta ?? error);
        return NextResponse.json(
          { error: "A record with that value already exists" },
          { status: 409 }
        );
      case "P2025":
        // Record not found
        console.error("[db] Record not found:", error.meta ?? error);
        return NextResponse.json(
          { error: "Record not found" },
          { status: 404 }
        );
      default:
        // All other Prisma errors
        console.error("[db] Prisma error:", error.code, error.meta ?? error);
        return NextResponse.json(
          { error: "Database error" },
          { status: 500 }
        );
    }
  }

  // Unknown/unexpected errors
  console.error("[db] Unexpected error:", error);
  return NextResponse.json(
    { error: "An unexpected error occurred" },
    { status: 500 }
  );
}

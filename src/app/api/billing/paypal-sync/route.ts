export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { syncWeddingFromPayPal } from "@/lib/paypal-sync";
import { handleDbError } from "@/lib/db-error";

/**
 * POST /api/billing/paypal-sync
 *
 * Manually syncs a PayPal subscription state from PayPal API.
 * Used for debugging or manual recovery.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;

    const result = await syncWeddingFromPayPal(auth.weddingId);

    return NextResponse.json({
      changed: result.changed,
      skipped: result.skipped,
      before: result.before,
      after: result.after,
    });
  } catch (error) {
    return handleDbError(error);
  }
}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { syncWeddingFromStripe } from "@/lib/stripe-sync";
import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;

    const result = await syncWeddingFromStripe(auth.weddingId);

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
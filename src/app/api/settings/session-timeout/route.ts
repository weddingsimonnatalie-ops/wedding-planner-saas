export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

const MIN_TIMEOUT = 5;
const MAX_TIMEOUT = 480;
const MIN_WARNING = 1;
const MAX_WARNING = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const wedding = await withTenantContext(weddingId, (tx) =>
      tx.wedding.findUnique({
        where: { id: weddingId },
        select: { sessionTimeout: true, sessionWarningTime: true },
      })
    );

    return apiJson({
      timeoutMinutes: wedding?.sessionTimeout ?? 30,
      warningMinutes: wedding?.sessionWarningTime ?? 5,
    });
  } catch (error) {
    return handleDbError(error);
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"], req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const body = await req.json();
    const { timeoutMinutes, warningMinutes } = body;

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

    if (warningMinutes >= timeoutMinutes) {
      return NextResponse.json(
        { error: "Warning time must be less than timeout" },
        { status: 400 }
      );
    }

    await withTenantContext(weddingId, (tx) =>
      tx.wedding.update({
        where: { id: weddingId },
        data: { sessionTimeout: timeoutMinutes, sessionWarningTime: warningMinutes },
      })
    );

    return apiJson({ success: true, timeoutMinutes, warningMinutes });
  } catch (error) {
    return handleDbError(error);
  }
}

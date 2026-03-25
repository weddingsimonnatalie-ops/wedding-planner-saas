import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { checkAppointmentReminders } from "@/lib/appointmentReminders";

import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const result = await checkAppointmentReminders();
    return NextResponse.json(result);

  } catch (error) {
    return handleDbError(error);
  }

}

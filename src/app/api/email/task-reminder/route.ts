import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireEmailFeature } from "@/lib/api-auth";
import { sendTaskReminderEmail } from "@/lib/email";
import { checkRateLimit, getEmailRateLimit } from "@/lib/rate-limit";
import { withTenantContext } from "@/lib/tenant";
import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const emailGate = requireEmailFeature(auth.wedding.subscriptionStatus);
    if (emailGate) return emailGate;

    const rateKey = `email:task:${auth.user.id}`;
    const { max, windowMs } = getEmailRateLimit();
    const rateCheck = await checkRateLimit(rateKey, max, windowMs);
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const { taskId } = await req.json();
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const task = await withTenantContext(weddingId, async (tx) => {
      return tx.task.findUnique({ where: { id: taskId, weddingId } });
    });

    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const to = auth.user.email;
    if (!to) return NextResponse.json({ error: "No recipient email configured" }, { status: 400 });

    const result = await sendTaskReminderEmail(
      to,
      task.title,
      task.priority,
      task.dueDate ? new Date(task.dueDate) : null,
      task.notes
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });

  } catch (error) {
    return handleDbError(error);
  }
}

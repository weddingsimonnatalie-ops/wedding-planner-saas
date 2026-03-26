export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { requireAdmin } from "@/lib/api-auth";
import { withTenantContext } from "@/lib/tenant";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";
import { getCached, invalidateCache } from "@/lib/cache";
import { verifyWeddingCookieId, COOKIE_NAME } from "@/lib/wedding-cookie";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
    if (!cookieValue) return NextResponse.json({ error: "No wedding context" }, { status: 401 });
    const weddingId = await verifyWeddingCookieId(cookieValue);
    if (!weddingId) return NextResponse.json({ error: "Invalid wedding context" }, { status: 401 });

    const categories = await getCached(
      `${weddingId}:appointment-categories`,
      300_000,
      () => withTenantContext(weddingId, (tx) =>
        tx.appointmentCategory.findMany({ where: { weddingId }, orderBy: { sortOrder: "asc" } })
      )
    );

    return apiJson(categories);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    const { weddingId } = auth;

    const data = await req.json();
    if (!data.name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: data.name, field: "categoryName", required: true },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const category = await withTenantContext(weddingId, async (tx) => {
      const maxOrder = await tx.appointmentCategory.aggregate({
        where: { weddingId },
        _max: { sortOrder: true },
      });
      const nextOrder = (maxOrder._max.sortOrder ?? -10) + 10;

      return tx.appointmentCategory.create({
        data: {
          weddingId,
          name: data.name.trim(),
          colour: data.colour ?? "#6366f1",
          sortOrder: data.sortOrder ?? nextOrder,
        },
      });
    });

    invalidateCache(`${weddingId}:appointment-categories`);
    return NextResponse.json(category, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";
import { getCached, invalidateCache } from "@/lib/cache";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const options = await getCached(
      "meal-options",
      300_000,
      () => prisma.mealOption.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
    );
    return apiJson(options);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { name, description, course, isActive, sortOrder } = await req.json();

    if (!name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: name, field: "mealOptionName", required: true },
      { value: description, field: "description" },
      { value: course, field: "courseName" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const option = await prisma.mealOption.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          course: course?.trim() || null,
          isActive: isActive !== false,
          sortOrder: sortOrder ?? 0,
        },
    });

    invalidateCache("meal-options");
    return NextResponse.json(option, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

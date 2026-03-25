export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";
import { validateFields } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const appointments = await prisma.appointment.findMany({
        include: {
          supplier: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, colour: true } },
        },
        orderBy: { date: "asc" },
    });

    return apiJson(appointments);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { title, categoryId, date, location, notes, supplierId, reminderDays } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    // Validate field lengths
    const errors = validateFields([
      { value: title, field: "title", required: true },
      { value: location, field: "location" },
      { value: notes, field: "appointmentNotes" },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    if (categoryId !== undefined && categoryId !== null) {
        const category = await prisma.appointmentCategory.findUnique({ where: { id: categoryId } });
        if (!category) return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }

    if (supplierId !== undefined && supplierId !== null) {
        const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
        if (!supplier) return NextResponse.json({ error: "Invalid supplierId" }, { status: 400 });
    }

    const appt = await prisma.appointment.create({
        data: {
          title: title.trim(),
          categoryId: categoryId || null,
          date: new Date(date),
          location: location?.trim() || null,
          notes: notes?.trim() || null,
          supplierId: supplierId || null,
          reminderDays: reminderDays != null ? Number(reminderDays) : null,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, colour: true } },
        },
    });

    return NextResponse.json(appt, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

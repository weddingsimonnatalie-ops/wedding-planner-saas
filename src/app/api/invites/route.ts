export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { handleDbError } from "@/lib/db-error";
import { apiJson } from "@/lib/api-response";
import { sendInviteEmail } from "@/lib/email";
import { isValidRole } from "@/lib/validation";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  try {
    const invites = await prisma.weddingInvite.findMany({
      where: { weddingId: auth.weddingId },
      orderBy: { createdAt: "desc" },
    });
    return apiJson(invites);
  } catch (error) {
    return handleDbError(error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json() as { email?: string; role?: string };
    const { email, role } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!role || !isValidRole(role)) {
      return NextResponse.json({ error: "Valid role is required (ADMIN, VIEWER, RSVP_MANAGER)" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const wedding = await prisma.wedding.findUnique({
      where: { id: auth.weddingId },
      select: { coupleName: true, themeHue: true },
    });

    const invite = await prisma.weddingInvite.create({
      data: {
        weddingId: auth.weddingId,
        email: normalizedEmail,
        role: role as "ADMIN" | "VIEWER" | "RSVP_MANAGER",
        expiresAt,
      },
    });

    const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const inviteUrl = `${baseUrl}/invite/${invite.token}`;

    await sendInviteEmail(normalizedEmail, wedding?.coupleName ?? "Our Wedding", inviteUrl, role, wedding?.themeHue ?? 330);

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    return handleDbError(error);
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { apiJson } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { invalidateUserSessions } from "@/lib/session";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return apiJson({ ...user, role: auth.role });
  } catch (error) {
    return handleDbError(error);
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(["ADMIN", "VIEWER", "RSVP_MANAGER"], req);
  if (!auth.authorized) return auth.response;

  try {
    const { name, email, password, dashboardLayout } = await req.json();

    // Track if email is being changed (requires session invalidation)
    let emailChanged = false;

    // Email change requires password confirmation
    if (email && email !== auth.user.email) {
      if (!password) {
        return NextResponse.json(
          { error: "Password required to change email" },
          { status: 400 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: auth.user.id },
        include: { accounts: { where: { providerId: "credential" } } },
      });

      const credentialAccount = user?.accounts[0];
      if (!credentialAccount || !(await bcrypt.compare(password, credentialAccount.password || ""))) {
        return NextResponse.json({ error: "Invalid password" }, { status: 400 });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 400 });
      }

      emailChanged = true;
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        ...(name !== undefined && { name: name || null }),
        ...(email && { email }),
        ...(dashboardLayout !== undefined && { dashboardLayout }),
      },
      select: { id: true, name: true, email: true, dashboardLayout: true },
    });

    // Invalidate all sessions if email was changed
    if (emailChanged) {
      await invalidateUserSessions(auth.user.id);
    }

    return NextResponse.json(updated);

  } catch (error) {
    return handleDbError(error);
  }
}
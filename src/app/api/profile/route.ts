import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { invalidateUserSessions } from "@/lib/session";

import { handleDbError } from "@/lib/db-error";

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, email, password } = await req.json();

    // Track if email is being changed (requires session invalidation)
    let emailChanged = false;

    // Email change requires password confirmation
    if (email && email !== session.user.email) {
      if (!password) {
        return NextResponse.json(
          { error: "Password required to change email" },
          { status: 400 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
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
      where: { id: session.user.id },
      data: {
        ...(name !== undefined && { name: name || null }),
        ...(email && { email }),
      },
      select: { id: true, name: true, email: true },
    });

    // Invalidate all sessions if email was changed
    if (emailChanged) {
      await invalidateUserSessions(session.user.id);
    }

    return NextResponse.json(updated);

  } catch (error) {
    return handleDbError(error);
  }

}
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { invalidateUserSessions } from "@/lib/session";
import { LENGTH_LIMITS } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentPassword, newPassword } = await req.json();

    if (!newPassword || newPassword.length < LENGTH_LIMITS.passwordMin) {
    return NextResponse.json({ error: `New password must be at least ${LENGTH_LIMITS.passwordMin} characters` }, { status: 400 });
    }

    if (newPassword.length > LENGTH_LIMITS.passwordMax) {
    return NextResponse.json({ error: `New password must be ${LENGTH_LIMITS.passwordMax} characters or less` }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: id },
      include: { accounts: { where: { providerId: "credential" } } },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // If changing own password, require current password; otherwise require ADMIN
    const currentUser = session.user as { id: string; email: string; role: string };
    if (currentUser.id !== id && currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (currentUser.id === id) {
    if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }
    const credentialAccount = user.accounts[0];
    if (!credentialAccount?.password) {
        return NextResponse.json({ error: "No credential account found" }, { status: 400 });
    }
    const match = await bcrypt.compare(currentPassword, credentialAccount.password);
    if (!match) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    // Update password in Account table (Better Auth)
    await prisma.account.updateMany({
      where: { userId: id, providerId: "credential" },
      data: { password: hashed },
    });

    // Invalidate all sessions for this user (including the current one)
    // They will need to log in again with the new password
    await invalidateUserSessions(id);

    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

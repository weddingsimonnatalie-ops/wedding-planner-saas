import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateFields } from "@/lib/validation";
import { invalidateUserSessions } from "@/lib/session";
import { handleDbError } from "@/lib/db-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { name, email } = await req.json();
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: name, field: "userName" },
      { value: email, field: "email", required: true },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    // Check for duplicate email
    const existing = await prisma.user.findUnique({
      where: { email: email.trim() },
      select: { id: true },
    });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 });
    }

    // Get current user to check if email is changing
    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });

    const emailChanging = currentUser?.email !== email.trim();

    // Update user and account in transaction
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          name: name?.trim() || null,
          email: email.trim(),
          // Reset email verification if email changes
          ...(emailChanging && { emailVerified: null }),
        },
        select: { id: true, name: true, email: true, role: true, twoFactorEnabled: true, lockedUntil: true, emailVerified: true, createdAt: true },
      }),
      // Update Account.accountId for credential provider
      prisma.account.updateMany({
        where: { userId: id, providerId: "credential" },
        data: { accountId: email.trim() },
      }),
    ]);

    // Invalidate sessions if email changed (user must re-login)
    if (emailChanging) {
      await invalidateUserSessions(id);
    }

    return NextResponse.json(user);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    // Cannot delete own account
    if (auth.user.id === id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    // Must keep at least one user
    const count = await prisma.user.count();
    if (count <= 1) {
      return NextResponse.json({ error: "Cannot delete the last user account" }, { status: 400 });
    }

    await prisma.user.delete({ where: { id: id } });
    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}
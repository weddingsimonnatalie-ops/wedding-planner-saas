export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateFields } from "@/lib/validation";
import { invalidateUserSessions } from "@/lib/session";
import { handleDbError } from "@/lib/db-error";
import { apiJson } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Verify user is a member of the current wedding
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: id, weddingId } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            twoFactorEnabled: true,
            lockedUntil: true,
            createdAt: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "User not found in this wedding" }, { status: 404 });
    }

    return apiJson({ ...member.user, role: member.role, memberId: member.id, joinedAt: member.joinedAt });

  } catch (error) {
    return handleDbError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Verify user is a member of the current wedding before allowing changes
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: id, weddingId } },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "User not found in this wedding" }, { status: 404 });
    }

    // Cannot edit the account owner (earliest joinedAt = original registrant)
    const firstMember = await prisma.weddingMember.findFirst({
      where: { weddingId },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    });
    if (firstMember?.userId === id && auth.user.id !== id) {
      return NextResponse.json({ error: "Cannot edit the account owner" }, { status: 403 });
    }

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

    // Update User fields only (name, email). Do NOT update role here — use /role endpoint.
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          name: name?.trim() || null,
          email: email.trim(),
          // Reset email verification if email changes
          ...(emailChanging && { emailVerified: null }),
        },
        select: { id: true, name: true, email: true, twoFactorEnabled: true, lockedUntil: true, emailVerified: true, createdAt: true },
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

    // Fetch the role from WeddingMember to include in response
    const updatedMember = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: id, weddingId } },
      select: { role: true },
    });

    return NextResponse.json({ ...user, role: updatedMember?.role ?? null });

  } catch (error) {
    return handleDbError(error);
  }

}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { weddingId } = auth;

    // Cannot remove own membership
    if (auth.user.id === id) {
      return NextResponse.json({ error: "Cannot remove your own membership" }, { status: 400 });
    }

    // Verify user is a member of the current wedding
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: id, weddingId } },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "User not found in this wedding" }, { status: 404 });
    }

    // Cannot remove the account owner (earliest joinedAt = original registrant)
    const firstMember = await prisma.weddingMember.findFirst({
      where: { weddingId },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    });
    if (firstMember?.userId === id) {
      return NextResponse.json({ error: "Cannot remove the account owner from this wedding" }, { status: 403 });
    }

    // Must keep at least one member in the wedding
    const count = await prisma.weddingMember.count({ where: { weddingId } });
    if (count <= 1) {
      return NextResponse.json({ error: "Cannot remove the last member of this wedding" }, { status: 400 });
    }

    // Remove the WeddingMember for this wedding only — do NOT delete the User
    // (they may belong to other weddings)
    await prisma.weddingMember.delete({
      where: { userId_weddingId: { userId: id, weddingId } },
    });

    return NextResponse.json({ ok: true });

  } catch (error) {
    return handleDbError(error);
  }

}

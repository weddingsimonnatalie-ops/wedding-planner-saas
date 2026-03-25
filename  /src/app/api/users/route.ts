export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { apiJson } from "@/lib/api-response";
import { sendVerificationEmail, generateVerificationToken } from "@/lib/email";
import { validateFields, LENGTH_LIMITS } from "@/lib/validation";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, emailVerified: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    });
    return apiJson(users);

  } catch (error) {
    return handleDbError(error);
  }

}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;

    const { name, email, password, role } = await req.json();

    if (!email?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (password.length < LENGTH_LIMITS.passwordMin) {
        return NextResponse.json({ error: `Password must be at least ${LENGTH_LIMITS.passwordMin} characters` }, { status: 400 });
    }

    if (password.length > LENGTH_LIMITS.passwordMax) {
        return NextResponse.json({ error: `Password must be ${LENGTH_LIMITS.passwordMax} characters or less` }, { status: 400 });
    }

    // Validate field lengths
    const errors = validateFields([
      { value: name, field: "userName" },
      { value: email, field: "email", required: true },
    ]);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const validRole = role && Object.values(UserRole).includes(role) ? role : UserRole.ADMIN;

    const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (existing) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const requireVerification = process.env.EMAIL_VERIFICATION_REQUIRED === "true";

    // Generate verification token if required
    const verificationToken = requireVerification ? generateVerificationToken() : null;
    const verificationTokenExpires = requireVerification ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null; // 24 hours

    const user = await prisma.user.create({
        data: {
          name: name?.trim() || null,
          email: email.trim(),
          role: validRole,
          emailVerified: requireVerification ? null : new Date(),
          verificationToken,
          verificationTokenExpires,
          accounts: {
            create: {
              providerId: "credential",
              accountId: email.trim(),
              password: hashed,
            },
          },
        },
        select: { id: true, name: true, email: true, role: true, emailVerified: true, createdAt: true },
    });

    // Send verification email if required
    if (requireVerification && verificationToken) {
      const config = await prisma.weddingConfig.findUnique({ where: { id: 1 } });
      const coupleName = config?.coupleName ?? "Wedding Planner";
      await sendVerificationEmail(user.email, user.name, verificationToken, coupleName);
    }

    return NextResponse.json(user, { status: 201 });

  } catch (error) {
    return handleDbError(error);
  }

}

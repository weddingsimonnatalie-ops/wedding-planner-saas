import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { signWeddingCookie, COOKIE_NAME, MAX_AGE_SECONDS } from "@/lib/wedding-cookie";
import { apiJson } from "@/lib/api-response";
import { handleDbError } from "@/lib/db-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/weddings/select
 * Returns all weddings the current user is a member of.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const memberships = await prisma.weddingMember.findMany({
      where: { userId: session.user.id },
      include: {
        wedding: {
          select: {
            id: true,
            coupleName: true,
            weddingDate: true,
            subscriptionStatus: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return apiJson(
      memberships.map((m) => ({
        weddingId: m.wedding.id,
        coupleName: m.wedding.coupleName,
        weddingDate: m.wedding.weddingDate,
        subscriptionStatus: m.wedding.subscriptionStatus,
        role: m.role,
      }))
    );
  } catch (error) {
    return handleDbError(error);
  }
}

/**
 * POST /api/weddings/select
 * Set the active wedding (sets the signed weddingId cookie).
 * Body: { weddingId: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { weddingId } = await req.json();
    if (!weddingId || typeof weddingId !== "string") {
      return NextResponse.json({ error: "weddingId required" }, { status: 400 });
    }

    // Verify the user is actually a member of this wedding
    const member = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: session.user.id, weddingId } },
    });
    if (!member) {
      return NextResponse.json({ error: "Not a member of this wedding" }, { status: 403 });
    }

    const token = await signWeddingCookie({ weddingId, role: member.role });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
      sameSite: "lax",
      maxAge: MAX_AGE_SECONDS,
      path: "/",
      domain: process.env.COOKIE_DOMAIN || undefined,
    });
    return response;
  } catch (error) {
    return handleDbError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { signWeddingCookie, COOKIE_NAME, MAX_AGE_SECONDS } from "@/lib/wedding-cookie";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/set-wedding
 *
 * Called after a successful login. Looks up the user's WeddingMember records
 * and sets the signed weddingId cookie.
 *
 * Returns:
 *   - { redirect: '/dashboard' } — one wedding found, cookie set
 *   - { redirect: '/select-wedding' } — multiple weddings, user must choose
 *   - { redirect: '/register' } — no weddings found
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const memberships = await prisma.weddingMember.findMany({
    where: { userId: session.user.id },
    include: {
      wedding: {
        select: { id: true, subscriptionStatus: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  if (memberships.length === 0) {
    return apiJson({ redirect: "/register" });
  }

  if (memberships.length > 1) {
    return apiJson({ redirect: "/select-wedding" });
  }

  // Exactly one wedding — set the cookie
  const weddingId = memberships[0].wedding.id;
  const role = memberships[0].role;
  const token = await signWeddingCookie({ weddingId, role });

  const response = NextResponse.json({ redirect: "/" });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined,
  });

  return response;
}

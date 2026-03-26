import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth-better";
import { verifyWeddingCookie, COOKIE_NAME } from "@/lib/wedding-cookie";

// Public paths that don't require authentication
const publicPaths = [
  "/login",
  "/register",
  "/rsvp",
  "/api/auth",
  "/api/register",
  "/api/rsvp",
  "/api/health",
  "/api/webhooks",
  "/api/inngest",
];

// Paths that need auth but not a wedding context (wedding selection / setup)
const noWeddingContextPaths = [
  "/select-wedding",
  "/register",
  "/onboarding",
  "/billing/suspended",
  "/api/auth/set-wedding",
  "/api/weddings",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/static")
  ) {
    return NextResponse.next();
  }

  // Step 1: check Better Auth session
  let session;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    console.error("Middleware session check error:", error);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Paths that don't need a wedding context (e.g. select-wedding, onboarding)
  if (noWeddingContextPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Step 2: verify signed weddingId cookie
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;

  if (!cookieValue) {
    return NextResponse.redirect(new URL("/select-wedding", request.url));
  }

  const cookiePayload = await verifyWeddingCookie(cookieValue);
  if (!cookiePayload) {
    // Cookie tampered — clear it and redirect to login
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
  const weddingId = cookiePayload.weddingId;

  // Subscription gate is enforced in the dashboard layout (Node.js runtime)
  // and in requireRole() for all API routes. Middleware only handles session
  // and weddingId cookie — no Prisma calls (Edge runtime doesn't support Prisma).

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|rsvp|api/auth|api/register|api/rsvp|api/health|api/webhooks|api/inngest|_next/static|_next/image|favicon.ico).*)",
  ],
};

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/features/auth/server/session-token";
import { guardRedirectFor } from "@/lib/auth/route-guard";

export async function middleware(request: NextRequest) {
  const redirectPath = guardRedirectFor(request.nextUrl.pathname);
  if (!redirectPath) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  if (payload) return NextResponse.next();

  return NextResponse.redirect(new URL(redirectPath, request.url));
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/invoices/:path*",
    "/customers/:path*",
    "/products/:path*",
    "/payments/:path*",
    "/reports/:path*",
  ],
};

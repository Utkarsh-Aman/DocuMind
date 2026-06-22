import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  const { pathname } = request.nextUrl;

  // 1. Guarding protected routes: redirect to login if not authenticated
  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 2. Redirecting logged-in users away from auth pages to the dashboard
  if (pathname === "/login" || pathname === "/") {
    if (token) {
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

// Matching routes that this middleware should run on
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/"
  ]
};
